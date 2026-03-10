"""
Database configuration for Backend Admin
"""
import os
import logging
from sqlmodel import create_engine, Session, SQLModel
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv(override=False)
logger = logging.getLogger(__name__)

SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    logger.warning("SQLALCHEMY_DATABASE_URL not set, using default")
    SQLALCHEMY_DATABASE_URL = "mysql+pymysql://posteitaliane:password@localhost:3306/sabina"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_timeout=60,
    pool_recycle=1800,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session)


def get_db():
    """Get a new database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all database tables"""
    from .models import DocumentType, Utente
    SQLModel.metadata.create_all(engine)
    logger.info("Database tables created/verified")
