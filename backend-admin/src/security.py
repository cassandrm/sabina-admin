"""
Security utilities for API Key and JWT authentication
"""
from fastapi import Security, HTTPException, status, Depends
from fastapi.security.api_key import APIKeyHeader
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .settings import settings
from .utils.auth_utils import verify_token
from .database import get_db
from .models import Utente

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)
bearer_scheme = HTTPBearer(auto_error=True)


async def get_api_key(api_key: str = Security(api_key_header)):
    """Validate API key from header"""
    if api_key != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key"
        )
    return api_key


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
    db: Session = Depends(get_db)
) -> Utente:
    """
    Dependency for endpoint protection with JWT authentication.
    Verifies JWT token and returns current user.
    
    Args:
        credentials: Bearer credentials with JWT token
        db: Database session
        
    Returns:
        Utente: Authenticated user
        
    Raises:
        HTTPException 401: If token invalid or user not found
    """
    token = credentials.credentials
    
    # Verify and decode token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract username from token
    username: str = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Find user in database
    user = db.query(Utente).filter(Utente.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user
