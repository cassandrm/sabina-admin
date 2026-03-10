"""
Admin router for Document Types/Schemas management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import logging
import os
import re
import json
import yaml
from typing import Any, Optional

from ..database import get_db
from .. import security
from ..models import (
    DocumentType,
    DocumentTypeRead,
    DocumentTypeCreate,
    DocumentTypeUpdate,
    DocumentTypeListResponse
)
from ..settings import settings

router = APIRouter(tags=["admin"])
logger = logging.getLogger(__name__)

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config")


def _safe_json_loads(s: str):
    """
    Robust JSON parser for LLM output that may contain:
    - Invalid escape sequences (\d, \w, \. from regex patterns)
    - Surrounding markdown fences or stray text
    - Truncation (try to extract last complete object)
    Uses multiple repair strategies before giving up.
    """
    # Strategy 1: direct parse
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    # Strategy 2: fix lone backslashes that are not valid JSON escape characters.
    # Valid JSON escapes after \: " \ / b f n r t u
    def _fix_backslashes(text: str) -> str:
        result = []
        i = 0
        in_string = False
        while i < len(text):
            c = text[i]
            if in_string:
                if c == '\\':
                    if i + 1 < len(text):
                        nxt = text[i + 1]
                        if nxt in '"\\/ bfnrtu':
                            # Valid escape sequence — keep as-is
                            result.append(c)
                            result.append(nxt)
                            i += 2
                            continue
                        else:
                            # Invalid escape — double the backslash
                            result.append('\\\\')
                            i += 1
                            continue
                    else:
                        result.append('\\\\')
                        i += 1
                        continue
                elif c == '"':
                    in_string = False
            else:
                if c == '"':
                    in_string = True
            result.append(c)
            i += 1
        return ''.join(result)

    fixed = _fix_backslashes(s)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Strategy 3: bracket-track to extract the outermost complete {...} object,
    # then apply backslash fix on that. Handles truncated LLM responses.
    def _extract_json_object(text: str) -> str | None:
        start = text.find('{')
        if start < 0:
            return None
        depth = 0
        in_str = False
        i = start
        while i < len(text):
            c = text[i]
            if in_str:
                if c == '\\':
                    i += 2  # skip escaped character
                    continue
                if c == '"':
                    in_str = False
            else:
                if c == '"':
                    in_str = True
                elif c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        return text[start:i + 1]
            i += 1
        return None

    candidate = _extract_json_object(s)
    if candidate:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
        try:
            return json.loads(_fix_backslashes(candidate))
        except json.JSONDecodeError:
            pass

    # Strategy 4: original simple regex as last resort
    fixed2 = re.sub(r'\\(?!["\\\//bfnrtu])', r'\\\\', s)
    return json.loads(fixed2)


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
            validation_rules = _safe_json_loads(validation_rules_raw)
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


# ---------------------------------------------------------------------------
# AI-assisted rule improvement
# ---------------------------------------------------------------------------

class ImproveRulesRequest(BaseModel):
    prompt: str
    current_rules: Any


SYSTEM_PROMPT = """Sei un esperto di schemi di validazione JSON per documenti italiani.
Ti viene fornito un oggetto JSON che rappresenta le "validation_rules" di uno schema documentale
e un prompt dell'utente che descrive un problema o un miglioramento da apportare.

Il tuo compito è restituire **solo** l'oggetto JSON aggiornato, senza alcun testo introduttivo,
senza markdown, senza backtick, senza spiegazioni. La risposta deve iniziare con '{' e terminare con '}'.

REGOLE FONDAMENTALI PER IL JSON:
- Il JSON deve essere sintatticamente valido e completo.
- I pattern regex all'interno dei valori JSON devono usare il doppio backslash: \\d \\w \\. \\d+ ecc.
  Esempio corretto: "pattern": "^[A-Z]{6}\\d{2}" NON "pattern": "^[A-Z]{6}\d{2}"
- Non troncare mai l'output: il JSON deve essere completo fino alla } finale.

Rispetta la struttura originale delle regole: mantieni le stesse chiavi di primo livello e lo stesso stile.
Modifica solo ciò che è necessario per risolvere il problema descritto dall'utente.
"""


@router.post("/schemas/{schema_id}/improve-rules")
async def improve_rules_with_ai(
    schema_id: int,
    body: ImproveRulesRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user)
):
    """
    Use AWS Bedrock to improve the validation rules based on a user prompt.
    Returns the improved validation_rules JSON.
    """
    if not settings.aws_access_key_id or not settings.aws_secret_access_key or not settings.model_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AWS Bedrock non configurato. Impostare AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e MODEL_ID."
        )

    schema = db.query(DocumentType).filter(DocumentType.id == schema_id).first()
    if not schema:
        raise HTTPException(status_code=404, detail=f"Schema con ID {schema_id} non trovato")

    try:
        import boto3
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pacchetto 'boto3' non installato. Aggiungere boto3 alle dipendenze."
        )

    # Load generation prompt from rules.yaml as reference context
    generation_prompt_text = ""
    try:
        rules_yaml_path = os.path.join(CONFIG_DIR, "rules.yaml")
        with open(rules_yaml_path, "r", encoding="utf-8") as f:
            rules_config = yaml.safe_load(f)
        raw_gen_prompt = rules_config.get("generation_prompt", "")
        # Strip the {schema_str} section — not relevant when improving existing rules
        if raw_gen_prompt:
            lines = raw_gen_prompt.splitlines()
            filtered = [l for l in lines if "{schema_str}" not in l]
            generation_prompt_text = "\n".join(filtered).strip()
    except Exception as e:
        logger.warning(f"Could not load rules.yaml generation prompt: {e}")

    current_rules_json = json.dumps(body.current_rules, indent=2, ensure_ascii=False)

    reference_section = (
        f"\n\nPROMPT DI RIFERIMENTO USATO PER LA GENERAZIONE INIZIALE DELLE REGOLE:\n"
        f"(Usa questo come guida per mantenere struttura, convenzioni e vincoli attesi)\n"
        f"---\n{generation_prompt_text}\n---"
        if generation_prompt_text else ""
    )

    user_message = (
        f"Schema documento: {schema.name or schema.analyzer_id}\n\n"
        f"Regole di validazione attuali:\n{current_rules_json}"
        f"{reference_section}\n\n"
        f"Problema / miglioramento richiesto:\n{body.prompt}"
    )

    try:
        client = boto3.client(
            "bedrock-runtime",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        response = client.converse(
            modelId=settings.model_id,
            system=[{"text": SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": user_message}]}],
            inferenceConfig={"temperature": 0.2, "maxTokens": 16000},
        )
        raw = response["output"]["message"]["content"][0]["text"]
        # Strip potential markdown fences
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw.rstrip())
            raw = raw.strip()

        improved_rules = _safe_json_loads(raw)
        logger.info(f"AI improved rules for schema {schema_id}")
        return {"improved_rules": improved_rules}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calling AWS Bedrock for schema {schema_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Errore nella chiamata ad AWS Bedrock: {str(e)}"
        )
