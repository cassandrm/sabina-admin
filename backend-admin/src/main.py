"""
Backend Admin - FastAPI Application
Standalone admin service for Document Types management
"""
import time
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .routers import admin, auth, analyzers
from .database import create_tables, SessionLocal, engine
from .models import DocumentType, Utente
from .services.auth_service import AuthService
from .utils.yaml_loader import Yaml

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def wait_for_db(max_retries: int = 30, retry_interval: int = 2):
    """Wait for database to be ready"""
    from sqlalchemy import text
    
    for attempt in range(max_retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("✅ Database connection established")
            return True
        except Exception as e:
            logger.warning(f"⏳ Waiting for database... attempt {attempt + 1}/{max_retries}")
            time.sleep(retry_interval)
    
    logger.error("❌ Could not connect to database after max retries")
    return False


app = FastAPI(
    title="SABINA Admin API",
    description="Admin backend for Document Types management",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure based on your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(analyzers.router, prefix="/api", tags=["Analyzers"])


# Startup initialization (synchronous, runs before app starts)
logger.info("Starting Backend Admin...")

# Wait for database to be ready
if not wait_for_db():
    logger.error("Failed to connect to database, exiting...")
else:
    # Create tables
    create_tables()
    logger.info("Database tables initialized")
    
    # Initialize database session
    db = SessionLocal()
    
    try:
        # Create default user if not exists
        auth_service = AuthService(db)
        
        default_user_username = "acquisti"
        existing_user = auth_service.get_user_by_username(default_user_username)
        if not existing_user:
            auth_service.create_user(
                username=default_user_username,
                password=default_user_username,
                email="admin@example.com"
            )
            logger.info("✅ Default user created successfully")
        else:
            logger.info("ℹ️  User 'acquisti' already exists")
        
        # Import document types from YAML if not present
        try:
            existing_schemas_count = db.query(DocumentType).count()
            logger.info(f"Checking existing schemas: {existing_schemas_count} records found")
            
            if existing_schemas_count == 0:
                yaml_loader = Yaml()
                document_types = yaml_loader.getDocumentTypeFromYaml()
                logger.info(f"Document types from YAML: {[dt.name for dt in document_types]}")
                
                for doc_type in document_types:
                    db.add(doc_type)
                db.commit()
                logger.info("✅ Document types imported successfully from YAML")
            else:
                logger.info(f"ℹ️  Document types already present in database ({existing_schemas_count} records)")
                
        except Exception as e:
            db.rollback()
            logger.error(f"⚠️  Error importing JSON schemas: {e}", exc_info=True)
            
    except Exception as e:
        logger.error(f"⚠️  Error during startup initialization: {e}", exc_info=True)
    finally:
        db.close()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "backend-admin"}
