from typing import List, Optional

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
