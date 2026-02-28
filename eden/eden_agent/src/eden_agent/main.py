from fastapi import FastAPI, HTTPException

from .agent import rank_shelters
from .config import settings
from .models import (
    CallPlanRequest,
    CallPlanResponse,
    CallScriptRequest,
    CallScriptResponse,
    SearchRequest,
    SessionEvent,
    SessionStartRequest,
    SessionStartResponse,
    SessionState,
    Shelter,
)
from .safety import run_safety_checks
from .script_generator import generate_script
from .session_store import SessionStore
from .shelter_directory import ShelterDirectory


app = FastAPI(title="Eden Agent", version="0.2.0")
directory = ShelterDirectory(settings.data_path)
sessions = SessionStore()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "eden-agent", "env": settings.environment}


@app.post("/shelters/search", response_model=list[Shelter])
def search_shelters(body: SearchRequest) -> list[Shelter]:
    state = body.state or settings.default_state
    return directory.search(state=state, city=body.city, language=body.language)


@app.post("/agent/next-calls", response_model=CallPlanResponse)
def next_calls(body: CallPlanRequest) -> CallPlanResponse:
    state = body.state or settings.default_state
    shelters = directory.search(state=state, city=body.city, language=body.language)
    ranked = rank_shelters(shelters, needs_child_support=body.needs_child_support)
    max_calls = max(1, min(body.max_calls, 10))
    planned = ranked[:max_calls]

    return CallPlanResponse(total_candidates=len(ranked), planned_calls=planned)


@app.post("/agent/session/start", response_model=SessionStartResponse)
def start_session(body: SessionStartRequest) -> SessionStartResponse:
    session = sessions.create(
        caller_name=body.caller_name,
        organization=body.organization,
        notes=body.notes,
    )
    return SessionStartResponse(
        session_id=session.session_id,
        caller_name=session.caller_name,
        organization=session.organization,
    )


@app.get("/agent/session/{session_id}", response_model=SessionState)
def get_session(session_id: str) -> SessionState:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/agent/session/{session_id}/events", response_model=SessionState)
def add_session_event(session_id: str, body: SessionEvent) -> SessionState:
    session = sessions.add_event(session_id, body)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/agent/generate-script", response_model=CallScriptResponse)
def create_call_script(body: CallScriptRequest) -> CallScriptResponse:
    session = sessions.get(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    shelter = directory.get_by_id(body.shelter_id)
    if not shelter:
        raise HTTPException(status_code=404, detail="Shelter not found")

    survivor_needs = body.survivor_needs or ""
    language = body.language or "English"
    context_text = " ".join(
        [
            session.notes or "",
            survivor_needs,
            " ".join(event.type for event in session.events),
        ]
    ).strip()

    safety = run_safety_checks(context_text)
    script, used_llm = generate_script(
        session=session,
        shelter=shelter,
        survivor_needs=survivor_needs,
        language=language,
    )

    sessions.add_event(
        session.session_id,
        SessionEvent(
            type="script_generated",
            payload={"shelter_id": shelter.id, "generated_with_llm": str(used_llm)},
        ),
    )

    return CallScriptResponse(
        shelter_id=shelter.id,
        shelter_name=shelter.name,
        generated_with_llm=used_llm,
        script=script,
        safety=safety,
    )
