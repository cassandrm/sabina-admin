"""
Cross-document validation rules router – single YAML file, no DB.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import logging
import os
import re
import json
import yaml
from typing import Any, Dict, List, Optional

from ..database import get_db
from .. import security
from ..services.validation_cross_service import run_cross_checks

router = APIRouter(tags=["cross-rules"])
logger = logging.getLogger(__name__)

CONFIG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config"
)
CROSS_RULES_FILE = os.path.join(CONFIG_DIR, "cross_rules.yaml")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_json_loads(s: str):
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        fixed = re.sub(r'\\(?!["\\\//bfnrtu])', r'\\\\', s)
        return json.loads(fixed)


def _parse_checks_from_vr(vr_raw) -> List[Dict[str, Any]]:
    """Parse checks list from a validation_rules value (JSON string or dict)."""
    if not vr_raw:
        return []
    vr = _safe_json_loads(vr_raw) if isinstance(vr_raw, str) else vr_raw
    return [
        {
            "field": r.get("field", ""),
            "compare_with": r.get("compare_with", ""),
            "check": r.get("check", "equals_ignorecase"),
            **(({"message": r["message"]}) if r.get("message") else {}),
        }
        for r in vr.get("checks", [])
    ]


def _derive_analyzer_ids(checks: List[Dict[str, Any]]) -> List[str]:
    """Derive unique analyzer_ids from the field path prefixes in checks."""
    seen: List[str] = []
    for c in checks:
        for key in ("field", "compare_with"):
            val = c.get(key, "")
            if "." in val:
                aid = val.split(".", 1)[0]
                if aid and aid not in seen:
                    seen.append(aid)
    return seen


def _read_cross_rules() -> List[Dict[str, Any]]:
    """
    Read all cross rules from cross_rules.yaml.
    Expected format per rule:
        label_name: ...
        validation_rules: |
          { "rules": [ { "field": ..., "compare_with": ..., "check": ..., "message": ... } ] }
    analyzer_ids are derived automatically from the field path prefixes.
    Returns list of rule dicts with keys: label_name, analyzer_ids, checks.
    """
    if not os.path.exists(CROSS_RULES_FILE):
        return []
    try:
        with open(CROSS_RULES_FILE, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        result = []
        for r in data.get("rules", []):
            checks = _parse_checks_from_vr(r.get("validation_rules"))
            result.append({
                "label_name": r.get("label_name", ""),
                "analyzer_ids": _derive_analyzer_ids(checks),
                "checks": checks,
            })
        return result
    except Exception as e:
        logger.error(f"[cross-rules] Errore lettura {CROSS_RULES_FILE}: {e}")
        return []


def _write_cross_rules(rules: List[Dict[str, Any]]) -> None:
    """
    Persist all rules to cross_rules.yaml using validation_rules: | block format.
    analyzer_ids are NOT stored – they are derived from field path prefixes at read time.
    """
    lines: List[str] = ["rules:\n"]
    for r in rules:
        label = r.get("label_name", "")
        checks = r.get("checks", [])
        vr_obj = {"checks": checks}
        vr_json = json.dumps(vr_obj, indent=2, ensure_ascii=False)
        indented_json = "\n".join("      " + line for line in vr_json.splitlines())
        # Quote label only if it contains YAML special characters
        if any(c in label for c in ':#[]{},&*!|>\'"\\%@`') or not label or label[0] in ' \t':
            label_yaml = json.dumps(label, ensure_ascii=False)
        else:
            label_yaml = label
        lines.append(f"  - label_name: {label_yaml}\n")
        lines.append(f"    validation_rules: |\n{indented_json}\n")
        lines.append("\n")
    with open(CROSS_RULES_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)
    logger.info(f"[cross-rules] Salvato {CROSS_RULES_FILE} ({len(rules)} regole)")


def _read_validation_rules_from_yaml(analyzer_id: str) -> Optional[Dict[str, Any]]:
    """Read and parse validation_rules from an analyzer YAML config file."""
    config_path = os.path.join(CONFIG_DIR, f"{analyzer_id}.yaml")
    if not os.path.exists(config_path):
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            yaml_data = yaml.safe_load(f)
        raw = yaml_data.get("validation_rules")
        if not raw:
            return None
        return _safe_json_loads(raw) if isinstance(raw, str) else raw
    except Exception as e:
        logger.warning(f"[cross-rules] Errore lettura YAML {analyzer_id}: {e}")
        return None


def _extract_fields(validation_rules: Dict[str, Any]) -> List[str]:
    return [r["field"] for r in validation_rules.get("rules", []) if r.get("field")]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/cross-rules/fields")
def get_fields_for_analyzers(
    analyzer_ids: str = Query(..., description="Comma-separated analyzer IDs"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.get_current_user),
):
    """Return field paths available in each analyzer's validation_rules YAML."""
    ids = [a.strip() for a in analyzer_ids.split(",") if a.strip()]
    result: Dict[str, List[str]] = {}
    for analyzer_id in ids:
        vr = _read_validation_rules_from_yaml(analyzer_id)
        result[analyzer_id] = _extract_fields(vr) if vr else []
    return {"fields": result}


@router.get("/cross-rules")
def get_cross_rules(
    current_user: dict = Depends(security.get_current_user),
):
    """Return all cross-document validation rules from cross_rules.yaml."""
    rules = _read_cross_rules()
    return {"rules": rules, "total": len(rules)}


@router.put("/cross-rules")
def save_cross_rules(
    body: Dict[str, Any],
    current_user: dict = Depends(security.get_current_user),
):
    """Replace the entire cross_rules.yaml with the provided rules list."""
    rules = body.get("rules")
    if rules is None:
        raise HTTPException(status_code=400, detail="'rules' è obbligatorio nel body")
    if not isinstance(rules, list):
        raise HTTPException(status_code=400, detail="'rules' deve essere una lista")
    try:
        _write_cross_rules(rules)
        return {"message": "cross_rules.yaml salvato con successo", "total": len(rules)}
    except Exception as e:
        logger.error(f"[cross-rules] Errore salvataggio: {e}")
        raise HTTPException(status_code=500, detail=f"Errore salvataggio: {str(e)}")


@router.post("/cross-rules/validate")
def validate_cross_checks(
    body: Dict[str, Any],
    current_user: dict = Depends(security.get_current_user),
):
    """
    Validate a list of checks against extracted document data.
    Body: { "checks": [...], "documents": { "<analyzer_id>": {...json_data...} } }
    """
    checks: List[Dict[str, Any]] = body.get("checks", [])
    documents: Dict[str, Any] = body.get("documents", {})

    if not checks:
        raise HTTPException(status_code=400, detail="'checks' è obbligatorio")
    if not documents:
        raise HTTPException(status_code=400, detail="'documents' è obbligatorio")

    return run_cross_checks(checks, documents)

