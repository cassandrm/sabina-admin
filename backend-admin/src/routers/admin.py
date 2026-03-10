"""
Admin router for Document Types/Schemas management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging
import os
import json
import yaml

from ..database import get_db
from .. import security
from ..models import (
    DocumentType,
    DocumentTypeRead,
    DocumentTypeCreate,
    DocumentTypeUpdate,
    DocumentTypeListResponse
)

router = APIRouter(tags=["admin"])
logger = logging.getLogger(__name__)

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config")


@router.get("/schemas", response_model=DocumentTypeListResponse)
def get_all_schemas(
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
):
    """
    Get all document type schemas from database.
    Requires user authentication.
    """
    try:
        schemas = db.query(DocumentType).all()
        logger.info(f"Retrieved {len(schemas)} document types from database.")
        
        schema_responses = []
        for schema in schemas:
            validation_rules = schema.validation_rules if schema.validation_rules else None
            schema_dict = {
                "id": schema.id,
                "name": schema.name,
                "label": schema.label,
                "patterns": schema.patterns,
                "analyzer_id": schema.analyzer_id,
                "validation_rules": validation_rules
            }
            schema_responses.append(DocumentTypeRead(**schema_dict))
        
        return DocumentTypeListResponse(
            schemas=schema_responses,
            total=len(schema_responses)
        )
    except Exception as e:
        logger.error(f"Error getting schemas: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting schemas: {str(e)}"
        )


@router.put("/schemas/{schema_id}", response_model=DocumentTypeRead)
def update_schema(
    schema_id: int,
    schema_update: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
):
    """
    Update an existing document type schema.
    Requires user authentication.
    """
    schema = db.query(DocumentType).filter(DocumentType.id == schema_id).first()
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema with ID {schema_id} not found"
        )

    update_data = schema_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(schema, field, value)

    try:
        db.commit()
        db.refresh(schema)
        logger.info(f"Schema {schema_id} updated successfully")
        
        schema_dict = {
            "id": schema.id,
            "name": schema.name,
            "label": schema.label,
            "patterns": schema.patterns,
            "analyzer_id": schema.analyzer_id,
            "validation_rules": schema.validation_rules if schema.validation_rules else None
        }
        return DocumentTypeRead(**schema_dict)
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating schema {schema_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating schema: {str(e)}"
        )


@router.post("/schemas", response_model=DocumentTypeRead)
def create_schema(
    schema_create: DocumentTypeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
):
    """
    Create a new document type schema.
    Requires user authentication.
    """
    logger.info(f"Creating schema for analyzer_id={schema_create.analyzer_id}")
    
    existing = db.query(DocumentType).filter(
        DocumentType.analyzer_id == schema_create.analyzer_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schema with analyzer_id '{schema_create.analyzer_id}' already exists"
        )

    try:
        schema_data = schema_create.model_dump()
        new_schema = DocumentType(**schema_data)
        db.add(new_schema)
        db.commit()
        db.refresh(new_schema)
        
        logger.info(f"New schema created with ID {new_schema.id}")
        
        schema_dict = {
            "id": new_schema.id,
            "name": new_schema.name,
            "label": new_schema.label,
            "patterns": new_schema.patterns,
            "analyzer_id": new_schema.analyzer_id,
            "validation_rules": new_schema.validation_rules
        }
        return DocumentTypeRead(**schema_dict)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating schema: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating schema: {str(e)}"
        )


@router.delete("/schemas/{schema_id}")
def delete_schema(
    schema_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
):
    """
    Delete a document type schema.
    Requires user authentication.
    """
    schema = db.query(DocumentType).filter(DocumentType.id == schema_id).first()
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema with ID {schema_id} not found"
        )

    try:
        db.delete(schema)
        db.commit()
        logger.info(f"Schema {schema_id} deleted successfully")
        return {"message": f"Schema {schema_id} deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting schema {schema_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting schema: {str(e)}"
        )


@router.get("/schemas/{schema_id}/validation-rules")
def get_validation_rules_from_file(
    schema_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
):
    """
    Get validation_rules from the YAML config file matching the schema name.
    """
    schema = db.query(DocumentType).filter(DocumentType.id == schema_id).first()
    if not schema:
        raise HTTPException(status_code=404, detail=f"Schema con ID {schema_id} non trovato")
    if not schema.name:
        raise HTTPException(status_code=400, detail="Lo schema non ha un campo 'name' configurato")

    config_path = os.path.join(CONFIG_DIR, f"{schema.name}.yaml")
    logger.info(f"Loading validation rules from: {config_path}")

    if not os.path.exists(config_path):
        return {"validation_rules": None}

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)

        validation_rules_raw = yaml_data.get('validation_rules')
        if not validation_rules_raw:
            return {"validation_rules": None}

        if isinstance(validation_rules_raw, str):
            validation_rules = json.loads(validation_rules_raw)
        else:
            validation_rules = validation_rules_raw

        return {"validation_rules": validation_rules}
    except Exception as e:
        logger.error(f"Error reading validation rules from file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Errore nella lettura delle validation rules: {str(e)}")


@router.put("/schemas/{schema_id}/validation-rules")
def save_validation_rules_to_file(
    schema_id: int,
    request_body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
):
    """
    Save validation_rules to the YAML config file matching the schema name.
    Updates only the validation_rules section, preserving the rest of the YAML.
    """
    schema = db.query(DocumentType).filter(DocumentType.id == schema_id).first()
    if not schema:
        raise HTTPException(status_code=404, detail=f"Schema con ID {schema_id} non trovato")
    if not schema.name:
        raise HTTPException(status_code=400, detail="Lo schema non ha un campo 'name' configurato")

    validation_rules = request_body.get("validation_rules")
    if validation_rules is None:
        raise HTTPException(status_code=400, detail="validation_rules è obbligatorio")

    config_path = os.path.join(CONFIG_DIR, f"{schema.name}.yaml")
    logger.info(f"Saving validation rules to: {config_path}")

    try:
        # Leggi il file YAML esistente
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            raise HTTPException(status_code=404, detail=f"File di configurazione '{schema.name}.yaml' non trovato in config/")

        # Converti le validation_rules in stringa JSON indentata
        validation_rules_json = json.dumps(validation_rules, indent=2, ensure_ascii=False)

        # Sostituisci la sezione validation_rules nel file YAML
        # Il formato è: validation_rules: |\n  {json content}
        import re
        # Pattern: validation_rules: | seguito da tutto il blocco indentato fino alla fine del file o prossima chiave non indentata
        pattern = r'(validation_rules:\s*\|)\n((?:[ \t]+.*\n?)*)'
        # Indenta ogni riga del JSON con 2 spazi per il blocco YAML
        indented_json = '\n'.join('  ' + line for line in validation_rules_json.split('\n'))
        replacement = r'\1\n' + indented_json + '\n'
        new_content = re.sub(pattern, replacement, content)

        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(new_content)

        logger.info(f"Validation rules saved to {config_path}")
        return {"message": "Validation rules salvate con successo", "validation_rules": validation_rules}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving validation rules to file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio delle validation rules: {str(e)}")
