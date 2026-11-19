from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings come from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    # Signs the login cookie. Must be long and random (the app refuses to start otherwise).
    secret_key: str = Field(min_length=32)
    invite_code: str = Field(min_length=4)
    # Set to true when the site is served over HTTPS (production).
    cookie_secure: bool = False


settings = Settings()
