from typing import Dict, Optional
from uuid import uuid4

from .models import SessionEvent, SessionState


class SessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}

    def create(self, *, caller_name: str, organization: str, notes: Optional[str]) -> SessionState:
        session_id = str(uuid4())
        session = SessionState(
            session_id=session_id,
            caller_name=caller_name,
            organization=organization,
            notes=notes,
            events=[],
        )
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)

    def add_event(self, session_id: str, event: SessionEvent) -> Optional[SessionState]:
        session = self._sessions.get(session_id)
        if not session:
            return None
        session.events.append(event)
        return session
