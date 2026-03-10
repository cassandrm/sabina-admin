"""
Service for authentication and user management.
"""
import logging
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from ..models import Utente
from ..utils.auth_utils import hash_password, verify_password

logger = logging.getLogger(__name__)


class AuthService:
    """Service for managing authentication and user operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_user_by_username(self, username: str) -> Optional[Utente]:
        """Get user by username"""
        return self.db.query(Utente).filter(Utente.username == username).first()
    
    def create_user(
        self, 
        username: str, 
        password: str, 
        email: Optional[str] = None
    ) -> Utente:
        """
        Create a new user in the database.
        
        Args:
            username: Username (must be unique)
            password: Plain text password (will be hashed)
            email: Optional email
            
        Returns:
            Utente: The created user object
        """
        logger.info(f"Creating user: {username}")
        
        # Validate password
        if not password or len(password) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 3 characters"
            )
        
        # Validate username
        if not username or len(username) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be at least 3 characters"
            )
        
        # Check if username already exists
        existing_user = self.get_user_by_username(username)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )
        
        # Create new user
        password_hash = hash_password(password)
        new_user = Utente(
            username=username,
            password_hash=password_hash,
            email=email
        )
        
        try:
            self.db.add(new_user)
            self.db.commit()
            self.db.refresh(new_user)
            logger.info(f"User '{username}' created successfully")
            return new_user
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating user: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error creating user"
            )
