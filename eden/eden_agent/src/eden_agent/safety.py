from .models import EscalationDecision, SafetyCheckResult


HIGH_RISK_TERMS = [
    "immediate danger",
    "weapon",
    "homicide",
    "suicide",
    "life threatening",
    "child in danger",
]


def evaluate_escalation(text: str) -> EscalationDecision:
    normalized = text.lower()
    for term in HIGH_RISK_TERMS:
        if term in normalized:
            return EscalationDecision(
                requires_human_handoff=True,
                reason=f"High-risk language detected: '{term}'",
            )
    return EscalationDecision(
        requires_human_handoff=False,
        reason="No high-risk language detected.",
    )


def run_safety_checks(context_text: str) -> SafetyCheckResult:
    escalation = evaluate_escalation(context_text)
    return SafetyCheckResult(
        blocked_topics=[
            "Guaranteeing bed availability",
            "Legal advice",
            "Medical diagnosis",
        ],
        required_disclaimer=(
            "This outreach provides shelter coordination support only and does not "
            "replace emergency services. Call 911 for immediate danger."
        ),
        escalation=escalation,
    )
