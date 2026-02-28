from fastapi import FastAPI

from .agent import rank_shelters
from .config import settings
from .models import CallPlanRequest, CallPlanResponse, SearchRequest, Shelter
from .shelter_directory import ShelterDirectory


app = FastAPI(title="Eden Agent", version="0.1.0")
directory = ShelterDirectory(settings.data_path)


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
