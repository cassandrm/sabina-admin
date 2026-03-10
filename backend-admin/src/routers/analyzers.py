"""
Analyzers router for fetching Azure Content Understanding analyzers
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import logging
import os
import re
from typing import List, Dict, Any

from .. import security
from ..database import get_db
from ..settings import settings
from sqlalchemy.orm import Session

router = APIRouter(tags=["Analyzers"])
logger = logging.getLogger(__name__)


def _safe_json_loads(s: str):
    """
    Parse a JSON string that may contain invalid escape sequences
    (e.g. \d, \w, \. from regex patterns written without double-backslash).
    First tries standard json.loads; on JSONDecodeError caused by invalid escapes
    it repairs lone backslashes and retries.
    """
    import json as _j
    try:
        return _j.loads(s)
    except _j.JSONDecodeError:
        # Replace \x where x is NOT a valid JSON escape character with \\x
        fixed = re.sub(r'\\(?!["\\\//bfnrtu])', r'\\\\', s)
        return _j.loads(fixed)


@router.get("/analyzers")
async def get_analyzers(
    current_user: dict = Depends(security.get_current_user)
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Get list of available Azure Content Understanding analyzers.
    Requires user authentication.
    
    Returns:
        Dict with list of analyzers containing analyzer_id and description
    """
    try:
        # Check if Azure credentials are configured
        if not settings.azure_content_understanding_endpoint or not settings.azure_content_understanding_key:
            logger.warning("Azure Content Understanding not configured")
            return {"analyzers": []}
        
        from azure.ai.contentunderstanding import ContentUnderstandingClient
        from azure.core.credentials import AzureKeyCredential
        
        client = ContentUnderstandingClient(
            endpoint=settings.azure_content_understanding_endpoint,
            credential=AzureKeyCredential(settings.azure_content_understanding_key)
        )
        
        # List all analyzers
        analyzers = client.list_analyzers()
        analyzer_list = []
        
        for analyzer in analyzers:
            analyzer_list.append({
                "analyzer_id": analyzer.analyzer_id,
                "description": getattr(analyzer, 'description', None)
            })
        
        logger.info(f"Retrieved {len(analyzer_list)} analyzers")
        return {"analyzers": analyzer_list}
        
    except ImportError:
        logger.error("Azure Content Understanding SDK not installed")
        return {"analyzers": []}
    except Exception as e:
        logger.error(f"Error fetching analyzers: {e}")
        # Return empty list instead of error to not break the UI
        return {"analyzers": []}


@router.post("/analyzers/analyze")
async def analyze_pdf(
    file: UploadFile = File(...),
    analyzer_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
) -> Dict[str, Any]:
    """
    Analyze a PDF file using Azure Content Understanding.
    Accepts a PDF upload and an analyzer_id, returns extracted JSON fields.
    """
    if not file.content_type or "pdf" not in file.content_type:
        raise HTTPException(status_code=400, detail="Il file deve essere un PDF")

    try:
        binary_data = await file.read()
        logger.info(f"Received PDF ({len(binary_data)} bytes) for analyzer '{analyzer_id}'")

        from ..services.content_understanding_service import ContentUnderstandingService
        service = ContentUnderstandingService(db)
        result = await service.getJsonData(analyzer_id, binary_data)

        if result is None:
            raise HTTPException(
                status_code=500,
                detail="Errore durante l'analisi del PDF. Controlla i log per dettagli."
            )

        return {"fields": result}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Errore durante l'analisi del PDF: {str(e)}"
        )


@router.post("/analyzers/validate")
async def validate_json(
    request_body: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
) -> Dict[str, Any]:
    """
    Validate extracted JSON data against the validation rules from the YAML config file.
    Uses the 'name' field of DocumentType to find config/{name}.yaml and reads validation_rules from it.
    Expects: { "schema_id": int, "json_data": dict }
    Returns: { "valid_fields": [...], "error_fields": [...], "is_valid": bool }
    """
    schema_id = request_body.get("schema_id")
    json_data = request_body.get("json_data")

    if not schema_id or json_data is None:
        raise HTTPException(status_code=400, detail="schema_id e json_data sono obbligatori")

    from ..models import DocumentType as DocumentTypeModel
    schema = db.query(DocumentTypeModel).filter(DocumentTypeModel.id == schema_id).first()
    if not schema:
        raise HTTPException(status_code=404, detail=f"Schema con ID {schema_id} non trovato")

    if not schema.name:
        raise HTTPException(status_code=400, detail="Lo schema non ha un campo 'name' configurato")

    # Carica le validation_rules dal file YAML in config/
    import yaml
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config", f"{schema.name}.yaml")
    logger.info(f"Loading validation rules from: {config_path}")

    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail=f"File di configurazione '{schema.name}.yaml' non trovato in config/")

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            yaml_data = yaml.safe_load(f)

        validation_rules_raw = yaml_data.get('validation_rules')
        if not validation_rules_raw:
            raise HTTPException(status_code=400, detail=f"Il file '{schema.name}.yaml' non contiene validation_rules")

        # validation_rules nel YAML è una stringa JSON, va parsata
        import json as _json
        if isinstance(validation_rules_raw, str):
            validation_rules = _safe_json_loads(validation_rules_raw)
        else:
            validation_rules = validation_rules_raw

        from ..services.validation_base_service import ValidationBaseService
        validation_service = ValidationBaseService(validation_rules)
        result = validation_service.validate(json_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating JSON: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Errore durante la validazione: {str(e)}"
        )
