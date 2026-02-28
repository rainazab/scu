from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class Shelter(BaseModel):
    id: str
    name: str
    city: str
    state: str
    phone: str
    languages: List[str] = Field(default_factory=list)
    has_beds: bool = False
    open_24_7: bool = False
    accepts_children: bool = False


class SearchRequest(BaseModel):
    state: Optional[str] = None
    city: Optional[str] = None
    language: Optional[str] = None


class CallPlanRequest(BaseModel):
    state: Optional[str] = None
    city: Optional[str] = None
    language: Optional[str] = None
    needs_child_support: bool = False
    max_calls: int = 3


class CallPlanItem(BaseModel):
    shelter_id: str
    shelter_name: str
    phone: str
    score: int
    reasons: List[str]


class CallPlanResponse(BaseModel):
    total_candidates: int
    planned_calls: List[CallPlanItem]


class SessionStartRequest(BaseModel):
    caller_name: str
    organization: str = "Eden"
    notes: Optional[str] = None


class SessionStartResponse(BaseModel):
    session_id: str
    caller_name: str
    organization: str


class SessionEvent(BaseModel):
    type: str
    payload: Dict[str, str] = Field(default_factory=dict)


class SessionState(BaseModel):
    session_id: str
    caller_name: str
    organization: str
    notes: Optional[str] = None
    events: List[SessionEvent] = Field(default_factory=list)


class CallScriptRequest(BaseModel):
    session_id: str
    shelter_id: str
    survivor_needs: Optional[str] = None
    language: Optional[str] = None


class EscalationDecision(BaseModel):
    requires_human_handoff: bool
    reason: str


class SafetyCheckResult(BaseModel):
    blocked_topics: List[str]
    required_disclaimer: str
    escalation: EscalationDecision


class CallScriptResponse(BaseModel):
    shelter_id: str
    shelter_name: str
    generated_with_llm: bool
    script: str
    safety: SafetyCheckResult
