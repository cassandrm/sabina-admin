import json
import logging
import os
import traceback
from typing import Optional
from azure.core.credentials import AzureKeyCredential
from azure.ai.contentunderstanding import ContentUnderstandingClient
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)


class ContentUnderstandingService:

    def __init__(self, db: Session):
        self.db = db
        # Carica gli schemi e i discriminanti dal database all'inizializzazione

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
    
            # convert the received model to a dictionary
            #data = result.as_dict()
            
            # data = self.decode_unicode_escapes(result.as_dict())
            
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
            
            # Pulisci i fields: mantieni solo i valori, rimuovi type/spans/confidence/source
            def clean_fields(obj):
                if isinstance(obj, dict):
                    # Se è un campo con valueString/valueNumber/etc., estrai solo il valore
                    if 'type' in obj:
                        if 'valueString' in obj:
                            return obj['valueString']
                        elif 'valueNumber' in obj:
                            return obj['valueNumber']
                        elif 'valueObject' in obj:
                            return {str(k): clean_fields(v) for k, v in obj['valueObject'].items()}
                        elif 'valueArray' in obj:
                            return [clean_fields(item) for item in obj['valueArray']]
                        else:
                            return None
                    return {str(k): clean_fields(v) for k, v in obj.items()}
                return obj
            
            fields = clean_fields(fields)
            
            # Rimuovi ricorsivamente i campi con valore null
            def remove_nulls(obj):
                if isinstance(obj, dict):
                    return {str(k): remove_nulls(v) for k, v in obj.items() if v is not None}
                elif isinstance(obj, list):
                    return [remove_nulls(item) for item in obj if item is not None]
                return obj
            
            fields = remove_nulls(fields)

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