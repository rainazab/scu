from typing import List

from .models import CallPlanItem, Shelter


def rank_shelters(
    shelters: List[Shelter], *, needs_child_support: bool = False
) -> List[CallPlanItem]:
    plans: List[CallPlanItem] = []

    for shelter in shelters:
        score = 0
        reasons: List[str] = []

        if shelter.has_beds:
            score += 50
            reasons.append("Reports bed availability")

        if shelter.open_24_7:
            score += 30
            reasons.append("Open 24/7")

        if needs_child_support and shelter.accepts_children:
            score += 20
            reasons.append("Accepts children")

        if not shelter.has_beds:
            reasons.append("May have no beds currently")

        plans.append(
            CallPlanItem(
                shelter_id=shelter.id,
                shelter_name=shelter.name,
                phone=shelter.phone,
                score=score,
                reasons=reasons,
            )
        )

    plans.sort(key=lambda item: item.score, reverse=True)
    return plans
