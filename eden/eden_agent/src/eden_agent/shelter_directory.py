import json
from pathlib import Path
from typing import List, Optional

from .models import Shelter


class ShelterDirectory:
    def __init__(self, data_path: str) -> None:
        self._data_path = Path(data_path)
        self._shelters: List[Shelter] = []
        self.reload()

    def reload(self) -> None:
        raw = json.loads(self._data_path.read_text())
        self._shelters = [Shelter(**item) for item in raw]

    def all(self) -> List[Shelter]:
        return self._shelters

    def search(
        self,
        *,
        state: Optional[str] = None,
        city: Optional[str] = None,
        language: Optional[str] = None,
    ) -> List[Shelter]:
        results = self._shelters

        if state:
            target = state.strip().lower()
            results = [s for s in results if s.state.lower() == target]

        if city:
            target = city.strip().lower()
            results = [s for s in results if s.city.lower() == target]

        if language:
            target = language.strip().lower()
            results = [
                s
                for s in results
                if any(lang.lower() == target for lang in s.languages)
            ]

        return results
