"""
Cross-document validation logic.
"""
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def _get_nested(data: Any, path: str) -> Any:
    keys = path.split(".")
    value = data
    for key in keys:
        if isinstance(value, dict) and key in value:
            value = value[key]
        else:
            return None
    return value


def _split_qualified(qualified: str):
    parts = qualified.split(".", 1)
    return (parts[0], parts[1]) if len(parts) == 2 else (None, qualified)


def run_cross_checks(
    checks: List[Dict[str, Any]],
    documents: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Validate a list of cross-checks against extracted document data.

    Args:
        checks: list of check dicts with keys: field, compare_with, check, message (opt)
        documents: dict mapping analyzer_id → extracted JSON data

    Returns:
        { valid_rules, error_rules, is_valid }
    """
    valid_rules = []
    error_rules = []

    for idx, rule_entry in enumerate(checks):
        print(f"Processing rule #{idx}: {rule_entry}")
        field_q = rule_entry.get("field", "")
        compare_q = rule_entry.get("compare_with", "")
        check = rule_entry.get("check", "equals_ignorecase")
        custom_msg = rule_entry.get("message")

        analyzer_a, field_a = _split_qualified(field_q)
        analyzer_b, field_b = _split_qualified(compare_q)

        data_a = documents.get(analyzer_a, {}) if analyzer_a else {}
        data_b = documents.get(analyzer_b, {}) if analyzer_b else {}

        value_a = _get_nested(data_a, field_a) if field_a else None
        value_b = _get_nested(data_b, field_b) if field_b else None

        logger.debug(
            "[cross-validate] check #%d: %s %s %s → a=%r b=%r",
            idx, field_q, check, compare_q, value_a, value_b,
        )

        entry = {
            "rule_index": idx,
            "field": field_q,
            "compare_with": compare_q,
            "check": check,
            "value_a": value_a,
            "value_b": value_b,
            "label": custom_msg or f"{field_q} == {compare_q}",
        }

        def _is_missing(v: Any) -> bool:
            return v is None or (isinstance(v, str) and v.strip() == "")

        missing_a = _is_missing(value_a)
        missing_b = _is_missing(value_b)

        if missing_a or missing_b:
            passed = False
            if not custom_msg:
                missing_fields = []
                if missing_a:
                    missing_fields.append(f"[{analyzer_a}] {field_a}")
                if missing_b:
                    missing_fields.append(f"[{analyzer_b}] {field_b}")
                default_error = "Campo assente o vuoto: " + ", ".join(missing_fields)
            else:
                default_error = custom_msg
        elif check == "equals_ignorecase":
            passed = str(value_a).strip().lower() == str(value_b).strip().lower()
            default_error = custom_msg or (
                f"Verifica non superata: [{analyzer_a}] {field_a} = «{value_a}» ≠"
                f" [{analyzer_b}] {field_b} = «{value_b}»"
            )
        else:
            passed = value_a == value_b
            default_error = custom_msg or (
                f"Verifica non superata: [{analyzer_a}] {field_a} = «{value_a}» ≠"
                f" [{analyzer_b}] {field_b} = «{value_b}»"
            )

        if passed:
            valid_rules.append(entry)
        else:
            entry["error"] = default_error
            error_rules.append(entry)

    return {
        "valid_rules": valid_rules,
        "error_rules": error_rules,
        "is_valid": len(error_rules) == 0,
    }
