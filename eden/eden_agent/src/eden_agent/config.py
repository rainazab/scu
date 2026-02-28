import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.environment = os.getenv("EDEN_ENV", "development")
        self.data_path = os.getenv("EDEN_DATA_PATH", "data/shelters.sample.json")
        self.default_state = os.getenv("EDEN_DEFAULT_STATE", "CA")


settings = Settings()
