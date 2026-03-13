"""
Data models for Backend Admin
"""
from sqlmodel import Field, SQLModel, Column
from sqlalchemy import JSON
from typing import Optional, Any, Dict, List
from datetime import datetime as dt
from datetime import datetime


# ==========================================================================
# UTENTE MODEL
# ==========================================================================
class Utente(SQLModel, table=True):
    """User table for authentication"""
    __tablename__ = "utente"
    
    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    username: str = Field(max_length=100, unique=True, nullable=False, index=True)
    password_hash: str = Field(max_length=255, nullable=False)
    email: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=dt.utcnow, nullable=False)
    last_login: Optional[datetime] = Field(default=None)


# ==========================================================================
# DOCUMENT TYPE MODELS
# ==========================================================================
class DocumentTypeBase(SQLModel):
    """Base fields shared between DB and API"""
    label: Optional[str] = Field(default=None, max_length=255, index=True, unique=True)
    patterns: Optional[str] = Field(default=None, max_length=1000)
    analyzer_id: str = Field(max_length=255)
    is_man_interesse: bool = Field(default=False)
    validation_rules: Optional[Dict[str, Any]] = Field(default=None)


class DocumentType(DocumentTypeBase, table=True):
    """Database model for document types"""
    __tablename__ = "document_types"

    id: Optional[int] = Field(default=None, primary_key=True, index=True)
    label: Optional[str] = Field(default=None, max_length=255, index=True, unique=True)
    patterns: Optional[str] = Field(default=None, max_length=1000)
    analyzer_id: str = Field(max_length=255)
    is_man_interesse: bool = Field(default=False)
    validation_rules: Optional[Dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON)
    )


class DocumentTypeCreate(DocumentTypeBase):
    """Schema for creating a new DocumentType"""
    label: Optional[str] = Field(default=None, max_length=255)
    patterns: Optional[str] = Field(default=None, max_length=1000)
    analyzer_id: str = Field(max_length=255)
    is_man_interesse: bool = Field(default=False)
    validation_rules: Optional[Dict[str, Any]] = Field(default=None)


class DocumentTypeUpdate(SQLModel):
    """Schema for updating a DocumentType"""
    label: Optional[str] = Field(default=None, max_length=255)
    patterns: Optional[str] = Field(default=None, max_length=1000)
    analyzer_id: Optional[str] = Field(None, max_length=255)
    is_man_interesse: Optional[bool] = Field(default=None)
    validation_rules: Optional[Dict[str, Any]] = Field(default=None)


class DocumentTypeRead(DocumentTypeBase):
    """Schema for reading a DocumentType (API response)"""
    id: int
    label: Optional[str] = Field(default=None, max_length=255)
    patterns: Optional[str] = Field(default=None, max_length=1000)
    analyzer_id: str = Field(max_length=255)
    is_man_interesse: bool = Field(default=False)
    validation_rules: Optional[Dict[str, Any]] = Field(default=None)


class DocumentTypeListResponse(SQLModel):
    """Schema for list of DocumentType"""
    schemas: List["DocumentTypeRead"]
    total: int


# ==========================================================================
# AUTH SCHEMAS
# ==========================================================================
class LoginRequest(SQLModel):
    """Login request schema"""
    username: str
    password: str


class LoginResponse(SQLModel):
    """Login response schema"""
    success: bool
    token: str
    message: str


class UserInfo(SQLModel):
    """User info response schema"""
    id: int
    username: str
    email: Optional[str] = None
    
    class Config:
        from_attributes = True
