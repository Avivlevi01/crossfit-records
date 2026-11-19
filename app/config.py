from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings come from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    # Signs the login cookie. Must be long and random (the app refuses to start otherwise).
    secret_key: str = Field(min_length=32)
    invite_code: str = Field(min_length=4)
    # Set to true when the site is served over HTTPS (production). Also turns on HSTS.
    cookie_secure: bool = False
    # The automatic API docs page (/docs). On for development, off in production.
    enable_docs: bool = False


    @model_validator(mode="after")
    def _no_placeholders_in_production(self):
        """Refuse to start in production with the example values still in place."""
        if self.cookie_secure and "change-me" in (self.secret_key + self.invite_code + self.database_url).lower():
            raise ValueError("Production settings still contain a 'CHANGE-ME' placeholder: edit your .env")
        return self


settings = Settings()
