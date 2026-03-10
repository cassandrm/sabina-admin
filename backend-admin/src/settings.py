"""
Settings configuration for Backend Admin
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # API Security
    api_key: str
    
    # JWT Configuration
    jwt_secret_key: str = "your-secret-key-change-in-production"
    access_token_expire_minutes: int = 30
    
    # Database
    sqlalchemy_database_url: str
    
    # Azure Content Understanding
    azure_content_understanding_endpoint: Optional[str] = None
    azure_content_understanding_key: Optional[str] = None

    model_config = {
        'env_file': '.env',
        'env_file_encoding': 'utf-8',
        'case_sensitive': False,
        'extra': 'ignore'
    }


# Singleton pattern
_settings_instance = None


def get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance


settings = get_settings()
