import json
import os
from typing import Dict, Any, Optional
from collections import OrderedDict
from azure.core.credentials import AzureKeyCredential
from azure.ai.contentunderstanding import ContentUnderstandingClient
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

class ContentUnderstandingService:

    def __init__(self, db: Session):
        self.db = db
        # Carica gli schemi e i discriminanti dal database all'inizializzazione

    def _get_cu_client(self) -> ContentUnderstandingClient:
        """Crea e restituisce un ContentUnderstandingClient usando le impostazioni di settings."""
        from ..settings import settings
        return ContentUnderstandingClient(
            endpoint=settings.azure_content_understanding_endpoint,
            credential=AzureKeyCredential(settings.azure_content_understanding_key)
        )

    def get_analyzers(self) -> dict:
        """
        Recupera la lista degli analyzer_id custom dal servizio ContentUnderstanding
        (esclude quelli con prefisso 'prebuilt-').
        """
        logger.info("Recupero lista analyzer da Azure Content Understanding")
        try:
            client = self._get_cu_client()
            custom_analyzers = [
                {"analyzer_id": a.analyzer_id, "description": a.analyzer_id}
                for a in client.list_analyzers()
                if not a.analyzer_id.startswith("prebuilt-")
            ]
            logger.info(f"Trovati {len(custom_analyzers)} analyzer custom")
            return {"analyzers": custom_analyzers}
        except Exception as e:
            logger.error(f"Errore nel recupero degli analyzer: {e}")
            return {"analyzers": []}

    async def extractSchemaForAnalyzer(self, analyzer_id: str):
        """
        Recupera lo schema JSON associato a un analyzer_id tramite ContentUnderstanding.
        Restituisce un oggetto compatibile con il frontend.
        """
        logger.info(f"➡️ Richiesta schema per analyzer_id: {analyzer_id}")
        try:
            content_understanding_client = self._get_cu_client()
            analyzer = content_understanding_client.get_analyzer(analyzer_id)
            field_schema = analyzer.field_schema

            # Serializza ogni ContentFieldDefinition in dict
            def serialize_field(field):
                if isinstance(field, (str, int, float, bool)) or field is None:
                    return field
                elif isinstance(field, dict):
                    return {k: serialize_field(v) for k, v in field.items()}
                elif isinstance(field, list):
                    return [serialize_field(item) for item in field]
                elif hasattr(field, 'to_dict'):
                    return field.to_dict()
                elif hasattr(field, '__dict__'):
                    return {k: serialize_field(v) for k, v in field.__dict__.items()}
                return str(field)
            
            schema_dict = {}
            if field_schema and hasattr(field_schema, 'fields'):
                for k, v in field_schema.fields.items():
                    schema_dict[k] = serialize_field(v)

            logger.info(f"✅ Schema recuperato per analyzer_id {analyzer_id}: {bool(field_schema)}")
            logger.info(f"✅ Schema dettagliato per analyzer_id {analyzer_id}: {json.dumps(schema_dict, indent=2)[:500]}...")

            return {
                "analyzer_id": analyzer_id,
                "schema": schema_dict
            }
        except Exception as e:
            logger.error(f"❌ Errore nel recupero schema per analyzer_id {analyzer_id}: {e}")
            return {"analyzer_id": analyzer_id}


    def decode_unicode_escapes(self, obj):
        """Decodifica double/triple unicode escapes ricorsivamente."""
        if isinstance(obj, str):
            decoded = obj
            # Prova fino a 2 decode per double/triple escape
            for _ in range(2):
                try:
                    decoded = decoded.encode('utf-8').decode('unicode_escape')
                except:
                    break
            return decoded
        elif isinstance(obj, dict):
            return {k: self.decode_unicode_escapes(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self.decode_unicode_escapes(item) for item in obj]
        else:
            return obj
        
    async def getJsonData(self, analyzer_id: str, binary_data: bytes) -> Optional[str]:
        try:
            print("\n⚙️ Inizio elaborazione PDF con Azure Content Understanding...\n")

            # Inizializza il client di Content Understanding
            from ..settings import settings
            
            endpoint = settings.azure_content_understanding_endpoint
            key = settings.azure_content_understanding_key
            
            if not endpoint or not key:
                logger.error("ENDPOINT o KEY_CONTENT_UNDERSTANDING non configurati nelle variabili d'ambiente")
                return None
            
            content_understanding_client = ContentUnderstandingClient(
                endpoint=endpoint,
                credential=AzureKeyCredential(key)
            )

            poller = content_understanding_client.begin_analyze_binary(
                analyzer_id=analyzer_id,
                binary_input=binary_data,
                content_type="application/pdf"
            )

            result = poller.result()


            # Recupera i dettagli di utilizzo (token, pagine, ecc.) dalla risposta di polling
            # 'usage' è nel body della LRO status (ContentAnalyzerAnalyzeOperationStatus),
            # non nell'AnalyzeResult, quindi va estratto dalla raw HTTP response

            try:
                raw_response = poller.polling_method()._pipeline_response.http_response
                import json as _json
                status_body = _json.loads(raw_response.text())
                usage = status_body.get("usage", {})
                if usage:
                    logger.info(f"\n💡 Utilizzo:")
                    if usage.get("tokens"):
                        logger.info(f"   Token: {usage['tokens']}")
                    if usage.get("documentPagesBasic"):
                        logger.info(f"   Pagine (basic): {usage['documentPagesBasic']}")
                    if usage.get("documentPagesStandard"):
                        logger.info(f"   Pagine (standard): {usage['documentPagesStandard']}")
                    if usage.get("documentPagesMinimal"):
                        logger.info(f"   Pagine (minimal): {usage['documentPagesMinimal']}")
                    if usage.get("contextualizationTokens"):
                        logger.info(f"   Token contestualizzazione: {usage['contextualizationTokens']}")
                    if usage.get("audioHours"):
                        logger.info(f"   Ore audio: {usage['audioHours']}")
                    if usage.get("videoHours"):
                        logger.info(f"   Ore video: {usage['videoHours']}")
                else:
                    logger.info("\n⚠️ Nessun dettaglio di utilizzo disponibile nella risposta.")
            except Exception as e:
                logger.error(f"\n⚠️ Impossibile recuperare i dettagli di utilizzo: {e}")
                
            data = result.as_dict()

            # Debug: logga la struttura della risposta
            logger.info(f"🔍 Chiavi presenti nella risposta Azure: {list(data.keys())}")
            logger.info(f"🔍 Tipo di data: {type(data)}")

            # Funzione per forzare tutte le chiavi a stringa (ricorsiva)
            def stringify_keys(obj):
                if isinstance(obj, dict):
                    return {str(k): stringify_keys(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [stringify_keys(item) for item in obj]
                return obj

            # Sanitizza subito l'intero data per evitare chiavi non-stringa
            data = stringify_keys(data)

            # Estrai solo la sezione fields dal primo content
            fields = {}
            if 'contents' in data:
                for content in data['contents']:
                    fields = content.get('fields', {})
                    break
            
            # # Pulisci i fields: mantieni solo i valori, rimuovi type/spans/confidence/source
            # def clean_fields(obj):
            #     if isinstance(obj, dict):
            #         # Se è un campo con valueString/valueNumber/etc., estrai solo il valore
            #         if 'type' in obj:
            #             if 'valueString' in obj:
            #                 return obj['valueString']
            #             elif 'valueNumber' in obj:
            #                 return obj['valueNumber']
            #             elif 'valueObject' in obj:
            #                 return {str(k): clean_fields(v) for k, v in obj['valueObject'].items()}
            #             elif 'valueArray' in obj:
            #                 return [clean_fields(item) for item in obj['valueArray']]
            #             else:
            #                 return None
            #         return {str(k): clean_fields(v) for k, v in obj.items()}
            #     return obj
            
            fields = self.clean_fields(fields)
            
            # # Rimuovi ricorsivamente i campi con valore null
            # def remove_nulls(obj):
            #     if isinstance(obj, dict):
            #         return {str(k): remove_nulls(v) for k, v in obj.items() if v is not None}
            #     elif isinstance(obj, list):
            #         return [remove_nulls(item) for item in obj if item is not None]
            #     return obj
            
            fields = self.remove_nulls(fields)

            print("\n✅ Estrazione dei fields completata. Ecco i dati estratti:")
            print( json.dumps(fields, ensure_ascii=False, indent=2) )
        
            return fields
        except KeyError as e:
            logger.error(
                f"Variabile d'ambiente mancante per Azure Content Understanding: {e}")
            return None
        except AttributeError as e:
            logger.error(
                f"Errore di attributo durante l'estrazione JSON: {e}")
            return None
        except Exception as e:
            logger.error(
                f"Errore imprevisto durante l'estrazione JSON da Azure Content Understanding: {e}\n{traceback.format_exc()}")
            return None
        
    async def generateValidationRulesFromSchema(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        """
        Genera le regole di validazione (evaluation_prompt) da uno schema JSON usando l'LLM.
        Le regole seguono il formato YAML evaluation_prompt con fields rules e crossFieldRules.

        Args:
            schema: Dizionario contenente lo schema JSON (può avere "analyzer_id" e "schema" o essere lo schema diretto)

        Returns:
            Dict con validation_rules (JSON string) e informazioni aggiuntive, o dict con errore
        """
        if not schema:
            logger.error("Schema vuoto fornito a generateValidationRulesFromSchema")
            return {"validation_rules": None, "error": "Empty schema provided"}

        logger.info(f"Schema ricevuto per generazione regole: {json.dumps(schema, indent=2)[:500]}...")
        # Determina il titolo dello schema
        analyzer_id = schema.get("analyzer_id", "schema")
        
        # Estrai lo schema JSON puro
        schema_data = schema.get("schema", schema)
        
        # Gestisci diversi tipi di input
        if isinstance(schema_data, str):
            # Se è stringa, deserializza con OrderedDict per preservare l'ordine
            try:
                schema_data = json.loads(schema_data, object_pairs_hook=OrderedDict)
            except json.JSONDecodeError as e:
                logger.error(f"Errore parsing schema_data come JSON: {e}")
                return {"validation_rules": None, "error": f"Invalid JSON schema: {str(e)}"}
        elif isinstance(schema_data, dict) and not isinstance(schema_data, OrderedDict):
            # Se è dict ma non OrderedDict, converti per preservare l'ordine
            schema_data = OrderedDict(schema_data)

        if not isinstance(schema_data, dict):
            logger.error(f"Schema data deve essere un dict, ricevuto: {type(schema_data)}")
            return {"validation_rules": None, "error": "Schema must be a dictionary"}

        # Crea l'agente Bedrock
        agent = self._createBedrockAgent(temperature=0.1)
        if not agent:
            return {"validation_rules": None, "error": "Failed to create Bedrock agent"}

        try:
            # Serializza lo schema per il prompt
            # CRITICO: sort_keys=False preserva l'ordine esatto dei campi quando passa all'LLM
            schema_str = json.dumps(schema_data, ensure_ascii=False, indent=2, sort_keys=False)

            # Carica il prompt dal file di configurazione
            rules_prompt_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "config", "rules-prompt.yaml"
            )
            try:
                import yaml
                with open(rules_prompt_path, "r", encoding="utf-8") as f:
                    rules_config = yaml.safe_load(f)
                generation_prompt_template = rules_config.get("generation_prompt", "")
                if not generation_prompt_template:
                    raise ValueError("generation_prompt non trovato in rules-prompt.yaml")
            except Exception as e:
                logger.error(f"Errore nel caricamento di rules-prompt.yaml: {e}")
                return {"validation_rules": None, "error": f"Failed to load prompt config: {str(e)}"}

            prompt = generation_prompt_template.replace("{schema_str}", schema_str)
            logger.info("***********************************************************")
            logger.info(f"Prompt generazione regole per analyzer_id {analyzer_id}:\n{prompt}")
            logger.info("***********************************************************")

            logger.info(f"🔄 Generazione regole di validazione per documento tipo: {analyzer_id}")
            response = agent(prompt)
            response_text = self._convertResponseToString(response)

        except Exception as e:
            logger.error(f"Errore durante la chiamata LLM per la generazione delle regole: {e}")
            return {"validation_rules": None, "error": f"LLM call failed: {str(e)}"}

        # Pulisci la risposta
        json_response = self._cleanJsonResponse(response_text)
        logger.info("***********************************************************")
        logger.info(f"Risposta LLM per analyzer_id {analyzer_id}:\n{json_response}")
        logger.info("***********************************************************")

        try:
            # Parse la risposta JSON
            validation_rules = json.loads(json_response)
            
            # Verifica la struttura base
            if "rules" not in validation_rules:
                logger.warning("Risposta LLM non contiene 'rules', inizializzo array vuoto")
                validation_rules["rules"] = []
            
            if "crossFieldRules" not in validation_rules:
                logger.warning("Risposta LLM non contiene 'crossFieldRules', inizializzo array vuoto")
                validation_rules["crossFieldRules"] = []

            num_field_rules = len(validation_rules.get("rules", []))
            num_cross_rules = len(validation_rules.get("crossFieldRules", []))
            
            logger.info(f"✅ Generati {num_field_rules} field rules e {num_cross_rules} cross-field rules")

            return {
                "validation_rules": validation_rules,
                "num_field_rules": num_field_rules,
                "num_cross_rules": num_cross_rules,
                "analyzer_id": analyzer_id
            }

        except json.JSONDecodeError as e:
            logger.error(f"❌ Errore nel parsing della risposta LLM: {e}")
            logger.error(f"Risposta ricevuta: {json_response[:500]}...")
            return {"validation_rules": None, "error": f"JSON parsing failed: {str(e)}"}
        except Exception as e:
            logger.error(f"Errore imprevisto durante la generazione delle regole di validazione: {e}")
            return {"validation_rules": None, "error": str(e)}

    # Funzioni private

    def _createBedrockAgent(self, temperature: float = 0.1, max_tokens: Optional[int] = None) -> Optional[Any]:
        """
        Crea un agente Bedrock con i parametri specificati.

        Args:
            temperature: Temperatura per il modello (default: 0.1)
            max_tokens: Numero massimo di token (opzionale)

        Returns:
            Agent Bedrock configurato o None in caso di errore
        """
        try:
            from strands import Agent
            from strands.models import BedrockModel
            from ..settings import settings

            bedrock_params = {
                "model_id": settings.model_id,
                "region_name": settings.aws_region,
                "temperature": temperature,
            }

            if max_tokens is not None:
                bedrock_params["max_tokens"] = max_tokens

            bedrock_model = BedrockModel(**bedrock_params)
            return Agent(model=bedrock_model)
        except Exception as e:
            logger.error(
                f"Errore durante l'inizializzazione del modello Bedrock: {e}")
            return None

    def _convertResponseToString(self, response: Any) -> str:
        """
        Converte la risposta dell'agente in stringa.

        Args:
            response: Risposta dell'agente (può essere già una stringa)

        Returns:
            Risposta convertita in stringa
        """
        return str(response) if not isinstance(response, str) else response

    def _cleanJsonResponse(self, response_text: str) -> str:
        """
        Pulisce la risposta JSON da eventuali markdown code blocks.

        Args:
            response_text: Testo della risposta che potrebbe contenere markdown

        Returns:
            Stringa JSON pulita senza formattazione markdown
        """
        json_response = response_text.strip()
        if json_response.startswith("```json"):
            json_response = json_response[7:]
        if json_response.startswith("```"):
            json_response = json_response[3:]
        if json_response.endswith("```"):
            json_response = json_response[:-3]
        return json_response.strip()
    
    def clean_fields(self, obj):
        if isinstance(obj, dict):
            # Trasforma ogni dict vuoto in stringa vuota
            if len(obj) == 0:
                return ""
            obj = {k: v for k, v in obj.items() if k not in ['type', 'method', 'description']}
            if list(obj.keys()) == ['_data'] and obj['_data'] == {}:
                return ""
            if list(obj.keys()) == ['_data'] and isinstance(obj['_data'], dict):
                normalized = self.clean_fields(obj['_data'])
                if isinstance(normalized, dict):
                    return normalized
                return normalized
            if 'properties' in obj and isinstance(obj['properties'], dict):
                properties_cleaned = self.clean_fields(obj['properties'])
                other_keys = {k: self.clean_fields(v) for k, v in obj.items() if k != 'properties'}
                if isinstance(properties_cleaned, dict):
                    return {**other_keys, **properties_cleaned}
                else:
                    return other_keys
            new_obj = {}
            for k, v in obj.items():
                normalized_v = self.clean_fields(v)
                # Trasforma ogni dict vuoto in stringa vuota
                if isinstance(normalized_v, dict) and len(normalized_v) == 0:
                    new_obj[k] = ""
                else:
                    new_obj[k] = normalized_v
            if 'valueString' in obj:
                return obj['valueString']
            elif 'valueNumber' in obj:
                return obj['valueNumber']
            elif 'valueObject' in obj:
                return {k: self.clean_fields(v) for k, v in obj['valueObject'].items()}
            elif 'valueArray' in obj:
                return [self.clean_fields(item) for item in obj['valueArray']]
            return new_obj
        elif isinstance(obj, list):
            return [self.clean_fields(item) for item in obj]
        return obj

    def remove_nulls(self, obj):
        if isinstance(obj, dict):
            return {k: self.remove_nulls(v) for k, v in obj.items() if v is not None}
        elif isinstance(obj, list):
            return [self.remove_nulls(item) for item in obj if item is not None]
        return obj