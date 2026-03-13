"""
YAML configuration loader for Document Types.
"""
import json
import os
from typing import List
import yaml
import logging

from ..models import DocumentType

logger = logging.getLogger(__name__)


FILE_YAML = [
    "manifestazione_interesse.yaml",
    "dichiarazione_cciaa.yaml",
    "dichiarazione_soggetti.yaml",
    "dichiarazione_sostitutiva.yaml"
]


class Yaml:
    """YAML configuration loader"""
    
    def __init__(self):
        pass
  
    def getDocumentTypeFromYaml(self) -> List[DocumentType]:
        """Load document types from YAML configuration files."""
        document_types = []
        
        for file_name in FILE_YAML:
            try:
                yaml_config = self._load_yaml_config(file_name)
                name = yaml_config.get("name")
                pattern = yaml_config.get("pattern")
                analyzer_id = yaml_config.get("analyzer_id")
                validation_rules = yaml_config.get("validation_rules")
                label_name = yaml_config.get("label_name")
                is_man_interesse = bool(yaml_config.get("is_man_interesse", False))
                
                # Parse validation_rules if it's a JSON string
                if isinstance(validation_rules, str):
                    try:
                        cleaned = validation_rules.strip()
                        try:
                            validation_rules = json.loads(cleaned)
                        except Exception:
                            cleaned2 = ''.join(line.strip() for line in cleaned.splitlines())
                            validation_rules = json.loads(cleaned2)
                        logger.info("✅ validation_rules parsed as JSON")
                    except Exception as e:
                        logger.warning(f"⚠️  Could not parse validation_rules as JSON: {e}")
                
                doc_type = DocumentType(
                    label=label_name,
                    name=name,
                    patterns=pattern,
                    analyzer_id=analyzer_id,
                    is_man_interesse=is_man_interesse,
                    validation_rules=validation_rules,
                )
                
                document_types.append(doc_type)
                
            except Exception as e:
                logger.error(f"❌ Error processing YAML '{file_name}': {e}", exc_info=True)
        
        return document_types
    
    def _load_yaml_config(self, config_label: str) -> dict:
        """
        Load YAML configuration file.

        Args:
            config_label: Name of the config file to load
            
        Returns:
            dict: Parsed YAML configuration
        """
        logger.info(f"🔧 Loading YAML configuration: {config_label}")

        try:
            config_dir = os.getenv("CONFIG_YAML_DIR", "/usr/src/app/config/")
            config_path = os.path.join(config_dir, config_label)

            logger.debug(f"   Config directory: {config_dir}")
            logger.debug(f"   Config file path: {config_path}")

            if not os.path.exists(config_path):
                logger.error(f"❌ YAML config file not found: {config_path}")
                raise FileNotFoundError(f"YAML config file not found: {config_path}")

            with open(config_path, "r", encoding="utf-8") as f:
                yaml_config = yaml.safe_load(f)
            
            logger.debug(f"✅ Successfully loaded YAML config: {list(yaml_config.keys())}")
            return yaml_config

        except Exception as e:
            logger.error(f"❌ Error loading YAML config '{config_label}': {e}", exc_info=True)
            raise
