import json
from urllib import request
from urllib.error import URLError

from .config import settings
from .models import SessionState, Shelter


def _fallback_script(session: SessionState, shelter: Shelter, survivor_needs: str) -> str:
    needs_line = survivor_needs or "Seeking safe placement and intake information."
    return (
        f"Hello, this is {session.caller_name} from {session.organization}. "
        f"I'm calling to ask about current DV shelter intake options at {shelter.name}. "
        f"Context: {needs_line}\n\n"
        "Questions:\n"
        "1) Do you currently have availability, and if not, when should we call back?\n"
        "2) What intake requirements should we prepare before arrival?\n"
        "3) Are language supports available for this case?\n"
        "4) Is there a direct coordinator we should follow up with?\n\n"
        "Thank you for your support. We will avoid sharing identifying details without consent."
    )


def _build_prompt(session: SessionState, shelter: Shelter, survivor_needs: str, language: str) -> str:
    return (
        "You are writing a trauma-informed call script for shelter outreach.\n"
        "Constraints:\n"
        "- Keep it concise and professional.\n"
        "- Do not guarantee bed availability.\n"
        "- Do not provide legal or medical advice.\n"
        "- Include a short disclaimer about emergency services.\n\n"
        f"Caller: {session.caller_name} ({session.organization})\n"
        f"Shelter: {shelter.name} in {shelter.city}, {shelter.state}\n"
        f"Preferred language: {language or 'English'}\n"
        f"Survivor needs: {survivor_needs or 'General DV shelter intake support'}\n\n"
        "Output: One ready-to-read phone script with bullet-pointed questions."
    )


def generate_script(
    *,
    session: SessionState,
    shelter: Shelter,
    survivor_needs: str,
    language: str,
) -> tuple[str, bool]:
    if not settings.openai_api_key:
        return _fallback_script(session, shelter, survivor_needs), False

    payload = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "user",
                "content": _build_prompt(session, shelter, survivor_needs, language),
            }
        ],
        "temperature": 0.3,
    }
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.openai_api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=15) as response:
            raw = json.loads(response.read().decode("utf-8"))
            text = raw["choices"][0]["message"]["content"].strip()
            return text, True
    except (URLError, KeyError, json.JSONDecodeError):
        return _fallback_script(session, shelter, survivor_needs), False
