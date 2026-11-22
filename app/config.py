from pydantic import Field, field_validator, model_validator
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
    # How many reverse proxies in front of the app append to X-Forwarded-For.
    # 0 = none (use the socket address). Caddy = 1, Google Cloud Run = 1.
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)

    @field_validator("database_url")
    @classmethod
    def _use_psycopg3_driver(cls, v: str) -> str:
        """Hosted databases (Neon) hand out postgresql://... or postgres://...; SQLAlchemy needs
        the driver spelled out. Keep any ?sslmode=require part untouched."""
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @model_validator(mode="after")
    def _no_placeholders_in_production(self):
        """Refuse to start in production with the example values still in place."""
        if self.cookie_secure and "change-me" in (self.secret_key + self.invite_code + self.database_url).lower():
            raise ValueError("Production settings still contain a 'CHANGE-ME' placeholder: edit your .env")
        return self


settings = Settings()
