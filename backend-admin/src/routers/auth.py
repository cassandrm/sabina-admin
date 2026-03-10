"""
Authentication router for login and user management
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import logging

from ..database import get_db
from ..models import Utente, LoginRequest, LoginResponse, UserInfo
from ..utils.auth_utils import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from ..security import get_current_user

router = APIRouter(tags=["Authentication"])
logger = logging.getLogger(__name__)


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Login endpoint with database verification and JWT token generation.
    
    Args:
        request: LoginRequest containing username and password
        db: Database session
        
    Returns:
        LoginResponse with JWT token if credentials are valid
        
    Raises:
        HTTPException 401: If credentials are invalid
    """
    logger.info(f"Login attempt for user: {request.username}")
    
    # Find user in database
    user = db.query(Utente).filter(Utente.username == request.username).first()
    
    if not user:
        logger.warning(f"Login failed: user '{request.username}' not found")
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
        logger.warning(f"Login failed: wrong password for user '{request.username}'")
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )
    
    # Update last_login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Generate JWT token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    logger.info(f"Login successful for user: {request.username}")
    
    return LoginResponse(
        success=True,
        token=access_token,
        message="Login successful"
    )


@router.get("/me", response_model=UserInfo)
async def get_current_user_info(current_user: Utente = Depends(get_current_user)):
    """
    Get info about the currently authenticated user.
    Requires a valid JWT Bearer token in Authorization header.
    
    Args:
        current_user: Current user (injected by dependency)
        
    Returns:
        UserInfo: Authenticated user information
    """
    logger.info(f"User info request: {current_user.username}")
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email
    )
