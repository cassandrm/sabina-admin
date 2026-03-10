from abc import ABC, abstractmethod
import json
import re
import logging
import unicodedata


logger = logging.getLogger(__name__)


class ValidationBaseService(ABC):

    def __init__(self, validation_rules: str):
        self.validation_rules = validation_rules


    def _valida_campo_nested(self, data, field_path):
        """Naviga attraverso campi nested usando dot notation"""
        keys = field_path.split('.')
        value = data
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return None
        return value


    def _is_placeholder_or_empty(self, value):
        """
        Determina se un valore è un placeholder, valore di default o campo vuoto.

        Args:
            value: Il valore da controllare

        Returns:
            bool: True se il valore è considerato placeholder/vuoto, False altrimenti
        """
        if value is None:
            return True

        # Stringa vuota o solo spazi
        if isinstance(value, str):
            value_lower = value.lower().strip()
            if not value_lower:
                return True
            # Pattern comuni di placeholder
            placeholder_patterns = [
                r'\bplaceholder\b', r'\bn/a\b', r'\bn\.a\.\b', r'\bna\b',
                r'\bnon disponibile\b', r'\bda compilare\b', r'\bvuoto\b',
                r'\bempty\b', r'\bnull\b', r'\bnone\b',
                r'\bxxx\b', r'\.\.\.', r'\btbd\b', r'\bto be defined\b',
                r'^\[', r'\]$', r'\[inserire', r'\[specificare', r'\[indicare'
            ]
            if any(re.search(pattern, value_lower) for pattern in placeholder_patterns):
                return True

        # Dizionario vuoto o con tutti valori placeholder
        if isinstance(value, dict):
            if not value:
                return True
            return all(self._is_placeholder_or_empty(v) for v in value.values())

        # Lista vuota
        if isinstance(value, list):
            return len(value) == 0

        return False


    def _enum_value_allowed(self, value, enum_list):
        """Verifica se un valore è nella lista di enum, con confronto case-insensitive per stringhe."""
        def _norm(s: str) -> str:
            return unicodedata.normalize('NFC', s).strip().lower()

        def _remove_accents(s: str) -> str:
            nkfd = unicodedata.normalize('NFKD', s)
            return ''.join(c for c in nkfd if not unicodedata.combining(c)).strip().lower()

        if isinstance(value, str):
            v_norm = _norm(value)
            v_noacc = _remove_accents(value)

            for ev in enum_list:
                if isinstance(ev, str):
                    ev_norm = _norm(ev)
                    ev_noacc = _remove_accents(ev)

                    if ev_norm == v_norm or ev_noacc == v_noacc:
                        return True
                else:
                    if ev == value:
                        return True
            return False

        if isinstance(value, list):
            return any(self._enum_value_allowed(v, enum_list) for v in value)

        return value in enum_list


    def _count_active_sections(self, data, sections, ignore_placeholders=True):
        """Conta quante sezioni contengono valori reali (non placeholder o vuoti)."""
        active_sections = []

        logger.info(f"🔍 Verifica sezioni attive - Totale sezioni: {len(sections)}")

        for section_path in sections:
            section_value = self._valida_campo_nested(data, section_path)

            logger.info(f"   📌 Path: {section_path}")
            logger.info(f"      Valore: {section_value} (tipo: {type(section_value)})")

            if section_value is not None:
                if ignore_placeholders:
                    is_placeholder = self._is_placeholder_or_empty(section_value)
                    logger.info(f"      Placeholder/vuoto? {is_placeholder}")
                    if not is_placeholder:
                        active_sections.append(section_path)
                        logger.info("      ✅ SEZIONE ATTIVA")
                    else:
                        logger.info("      ❌ Sezione ignorata (placeholder/vuoto)")
                else:
                    active_sections.append(section_path)
                    logger.info("      ✅ SEZIONE ATTIVA (ignore_placeholders=False)")
            else:
                logger.info("      ⚠️ Valore None – sezione non trovata")

        logger.info(f"📊 Totale sezioni attive: {len(active_sections)} – {active_sections}")
        return len(active_sections), active_sections


    def _valida_campo_array(self, data, rule):
        """
        Valida un campo all'interno di un array (path con notazione []).
        Es: "TitolariCaricheQualifiche[].Residenza.Nazione"

        Returns:
            tuple: (errors_list, valid_fields_list)
        """
        field = rule['field']
        errors = []
        valid_fields = []
        seen_errors = set()

        # Split: "TitolariCaricheQualifiche[].Residenza.Nazione" -> "TitolariCaricheQualifiche", "Residenza.Nazione"
        bracket_idx = field.index('[]')
        array_path = field[:bracket_idx]
        item_field_path = field[bracket_idx + 3:]  # skip "[]."

        # Recupera l'array dai dati (supporta anche path nested prima di [])
        array_data = self._valida_campo_nested(data, array_path)

        if not isinstance(array_data, list) or len(array_data) == 0:
            # Array non presente o vuoto: i controlli cross-field gestiranno
            # le regole "almeno uno richiesto"
            return errors, valid_fields

        # Valida ogni elemento dell'array
        for idx, item in enumerate(array_data):
            value = self._valida_campo_nested(item, item_field_path)
            field_valid = True

            # Campo obbligatorio
            if rule.get('required') and not value:
                msg = rule.get('requiredMessage',
                               f"Il campo '{rule.get('label_field', field)}' è obbligatorio.")
                if msg not in seen_errors:
                    errors.append({'field': f"{array_path}[{idx}].{item_field_path}", 'label_field': rule.get('label_field', field), 'value': value, 'rule_description': msg, 'failed_check': 'required'})
                    seen_errors.add(msg)
                field_valid = False

            # Pattern regex
            if value and rule.get('pattern'):
                if not re.match(rule['pattern'], str(value), re.IGNORECASE):
                    msg = rule.get('formatMessage',
                                   f"Il campo '{field}' non rispetta il formato richiesto.")
                    if msg not in seen_errors:
                        errors.append({'field': f"{array_path}[{idx}].{item_field_path}", 'label_field': rule.get('label_field', field), 'value': value, 'rule_description': msg, 'failed_check': 'pattern'})
                        seen_errors.add(msg)
                    field_valid = False

            # Enum
            if value and rule.get('enum'):
                if not self._enum_value_allowed(value, rule['enum']):
                    msg = rule.get('formatMessage',
                                   f"Il campo '{field}' deve essere uno dei valori consentiti.")
                    if msg not in seen_errors:
                        errors.append({'field': f"{array_path}[{idx}].{item_field_path}", 'label_field': rule.get('label_field', field), 'value': value, 'rule_description': msg, 'failed_check': 'enum'})
                        seen_errors.add(msg)
                    field_valid = False

            # Min length
            if value and rule.get('minLength') and len(str(value)) < rule['minLength']:
                msg = rule.get('formatMessage', f"Il campo '{field}' è troppo corto.")
                if msg not in seen_errors:
                    errors.append({'field': f"{array_path}[{idx}].{item_field_path}", 'label_field': rule.get('label_field', field), 'value': value, 'rule_description': msg, 'failed_check': 'minLength'})
                    seen_errors.add(msg)
                field_valid = False

            # Max length
            if value and rule.get('maxLength') and len(str(value)) > rule['maxLength']:
                msg = rule.get('formatMessage', f"Il campo '{field}' è troppo lungo.")
                if msg not in seen_errors:
                    errors.append({'field': f"{array_path}[{idx}].{item_field_path}", 'label_field': rule.get('label_field', field), 'value': value, 'rule_description': msg, 'failed_check': 'maxLength'})
                    seen_errors.add(msg)
                field_valid = False

            # Campo valido e non vuoto -> aggiungilo ai valid_fields
            if field_valid and value is not None and value != '' and value != [] and value != {}:
                valid_fields.append({
                    'field': f"{array_path}[{idx}].{item_field_path}",
                    'label_field': rule.get('label_field', field),
                    'value': self._fix_encoding(value),
                    'rule_description': (
                        rule.get('description') or
                        rule.get('formatMessage') or
                        rule.get('requiredMessage', '')
                    )
                })

        # Decodifica errori unicode
        decoded_errors = [self._fix_encoding(err) for err in errors]
        return decoded_errors, valid_fields


    def _valida_dati_complessi(self, data, schema):

        errors = []
        valid_fields = []

        for rule in schema.get('rules', []):
            field = rule['field']

            # Gestione campi array con notazione []
            if '[]' in field:
                array_errors, array_valid = self._valida_campo_array(data, rule)
                errors.extend(array_errors)
                valid_fields.extend(array_valid)
                continue

            value = self._valida_campo_nested(data, field)
            field_valid = True
            field_errors = []

            # Blocco completo se displayOnlyIf non è soddisfatta
            if rule.get('displayOnlyIf'):
                display_condition = rule['displayOnlyIf']
                dep_field = display_condition['field']
                operator = display_condition.get('operator', '==')
                compare_value = display_condition.get('value')
                dep_value = self._valida_campo_nested(data, dep_field)

                logger.info(
                    f"Valutazione displayOnlyIf per campo '{field}': "
                    f"dipende da '{dep_field}' (valore: {dep_value}) "
                    f"con operatore '{operator}' e valore di confronto '{compare_value}'"
                )

                should_display = False
                if operator == '==' and dep_value == compare_value:
                    should_display = True
                elif operator == '!=' and dep_value != compare_value:
                    should_display = True
                elif operator == 'in' and isinstance(compare_value, list) and dep_value in compare_value:
                    should_display = True
                elif operator == 'not_in' and isinstance(compare_value, list) and dep_value not in compare_value:
                    should_display = True
                elif operator == 'exists' and dep_value is not None and not self._is_placeholder_or_empty(dep_value):
                    should_display = True
                elif operator == 'not_exists' and (dep_value is None or self._is_placeholder_or_empty(dep_value)):
                    should_display = True
                elif operator == 'contains' and isinstance(dep_value, list) and compare_value in dep_value:
                    should_display = True
                elif operator == 'not_contains' and isinstance(dep_value, list) and compare_value not in dep_value:
                    should_display = True

                if not should_display:
                    continue  # salta il campo

            # Campo obbligatorio fisso
            if rule.get('required') and not value:
                field_errors.append({
                    'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                    'rule_description': rule.get('requiredMessage', f"Il campo '{rule.get('label_field', field)}' è obbligatorio."),
                    'failed_check': 'required'
                })
                field_valid = False

            # RequiredIf semplice
            if rule.get('requiredIf'):
                if isinstance(rule['requiredIf'], str):
                    dep_value = self._valida_campo_nested(data, rule['requiredIf'])
                    if dep_value and not value:
                        field_errors.append({
                            'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                            'rule_description': rule.get('requiredMessage', f"Il campo '{field}' è richiesto."),
                            'failed_check': 'requiredIf'
                        })
                        field_valid = False
                # RequiredIf con condizione complessa
                elif isinstance(rule['requiredIf'], dict):
                    dep_field = rule['requiredIf']['field']
                    operator = rule['requiredIf'].get('operator', '==')
                    compare_value = rule['requiredIf'].get('value')
                    dep_value = self._valida_campo_nested(data, dep_field)

                    logger.info(
                        f"Valutazione requiredIf per '{field}': "
                        f"dep_value={dep_value}, operator={operator}, compare_value={compare_value}"
                    )

                    condition_met = False

                    if operator == '==' and dep_value == compare_value:
                        condition_met = True
                    elif operator == '!=' and dep_value != compare_value:
                        # Imposta che `dep_value != compare_value` richiede valore
                        # ma solo se `dep_value` è davvero valorizzato
                        if dep_value is not None:
                            condition_met = True
                    elif operator == 'in' and isinstance(compare_value, list) and dep_value in compare_value:
                        condition_met = True
                    elif operator == 'not_in' and isinstance(compare_value, list) and dep_value not in compare_value:
                        condition_met = True
                    elif operator == 'exists':
                        if dep_value is not None and not self._is_placeholder_or_empty(dep_value):
                            condition_met = True

                    if condition_met and not value:
                        field_errors.append({
                            'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                            'rule_description': rule.get('requiredMessage', f"Il campo '{field}' è richiesto."),
                            'failed_check': 'requiredIf'
                        })
                        field_valid = False

            # RequiredIfNot (almeno uno dei due non è vuoto)
            if rule.get('requiredIfNot'):
                other_field = rule['requiredIfNot']
                other_value = self._valida_campo_nested(data, other_field)
                if not value and not other_value:
                    field_errors.append({
                        'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                        'rule_description': rule.get('requiredMessage', f"Il campo '{field}' è richiesto."),
                        'failed_check': 'requiredIfNot'
                    })
                    field_valid = False

            # Pattern
            if value and rule.get('pattern'):
                if not re.match(rule['pattern'], str(value), re.IGNORECASE):
                    field_errors.append({
                        'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                        'rule_description': rule.get('formatMessage', f"Il campo '{field}' non rispetta il formato richiesto."),
                        'failed_check': 'pattern'
                    })
                    field_valid = False

            # Enum
            if value and rule.get('enum'):
                if not self._enum_value_allowed(value, rule['enum']):
                    field_errors.append({
                        'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                        'rule_description': rule.get('formatMessage', f"Il campo '{field}' deve essere uno dei valori consentiti."),
                        'failed_check': 'enum'
                    })
                    field_valid = False

            # Min/Max length
            if value and rule.get('minLength') and len(str(value)) < rule['minLength']:
                field_errors.append({
                    'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                    'rule_description': rule.get('formatMessage', f"Il campo '{field}' è troppo corto."),
                    'failed_check': 'minLength'
                })
                field_valid = False
            if value and rule.get('maxLength') and len(str(value)) > rule['maxLength']:
                field_errors.append({
                    'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                    'rule_description': rule.get('formatMessage', f"Il campo '{field}' è troppo lungo."),
                    'failed_check': 'maxLength'
                })
                field_valid = False

            # MinSelected (solo per array)
            if rule.get('minSelected') and isinstance(value, list):
                selected = sum(1 for item in value if item.get('selezionato', False))
                if selected < rule['minSelected']:
                    field_errors.append({
                        'field': field, 'label_field': rule.get('label_field', field), 'value': value,
                        'rule_description': rule.get('requiredMessage', f"Il campo '{field}' richiede almeno {rule['minSelected']} selezioni."),
                        'failed_check': 'minSelected'
                    })
                    field_valid = False

            # Prepara errori già decodificati per l'esterno
            decoded_field_errors = [self._fix_encoding(fe) for fe in field_errors]

            errors.extend(decoded_field_errors)

            # Se il campo è OK e non è vuoto, aggiungilo a valid_fields
            if field_valid and value is not None and value != "" and value != [] and value != {}:
                valid_fields.append({
                    'field': field,
                    'label_field': rule.get('label_field', field),
                    'value': self._fix_encoding(value),
                    'rule_description': (
                        rule.get('description') or
                        rule.get('formatMessage') or
                        rule.get('requiredMessage', '')
                    )
                })

        # CrossFieldRules
        for cross_rule in schema.get('crossFieldRules', []):
            condition = cross_rule['condition']

            if 'anyOf' in condition:
                fields = condition['anyOf']
                if not any(self._valida_campo_nested(data, f) for f in fields):
                    errors.append({'field': None, 'label_field': None, 'value': None, 'rule_description': cross_rule.get('message', 'Errore di validazione cross-field.'), 'failed_check': 'cross_field'})

            if 'allOf' in condition:
                fields = condition['allOf']
                first_filled = self._valida_campo_nested(data, fields[0])
                if first_filled:
                    if not all(self._valida_campo_nested(data, f) for f in fields):
                        errors.append({'field': None, 'label_field': None, 'value': None, 'rule_description': cross_rule.get('message', 'Errore di validazione cross-field.'), 'failed_check': 'cross_field'})

            if 'mutuallyExclusive' in condition:
                sections = condition['mutuallyExclusive']
                ignore_placeholders = cross_rule.get('ignoreEmptyAndPlaceholders', False)
                active_count, active_sections = self._count_active_sections(data, sections, ignore_placeholders)

                if active_count > 1:
                    section_names = [s.split('.')[-1] for s in active_sections]
                    logger.warning(
                        f"Rilevate {active_count} sezioni mutuamente esclusive attive: {', '.join(section_names)}"
                    )
                    errors.append({'field': None, 'label_field': None, 'value': None, 'rule_description': cross_rule.get('message', 'Errore di mutua esclusività.'), 'failed_check': 'cross_field'})
                elif active_count == 0:
                    logger.warning("Nessuna modalità di partecipazione selezionata.")
                    errors.append({'field': None, 'label_field': None, 'value': None, 'rule_description': "Deve essere selezionata almeno una modalità di partecipazione (Impresa Singola, RTI/RTP, Consorzio oppure Altro).", 'failed_check': 'cross_field'})

        # Ritorna già con valori/label già decodificati e puliti
        decoded_valid_fields = valid_fields
        decoded_errors = [self._fix_encoding(err) for err in errors]

        return {
            'valid_fields': decoded_valid_fields,
            'error_fields': decoded_errors,
            'is_valid': len(decoded_errors) == 0
        }


    def _fix_encoding(self, obj):
        """
        Corregge ricorsivamente problemi di encoding UTF-8 (mojibake)
        es: "SOCIETÃÂ PER AZIONI" -> "SOCIETÀ PER AZIONI"
        Applica il fix ripetutamente finché il testo non cambia più.
        """
        if isinstance(obj, str):
            result = obj
            for _ in range(3):  # Max 3 iterazioni
                try:
                    decoded = result.encode('latin-1').decode('utf-8')
                    if decoded == result:
                        break
                    result = decoded
                except (UnicodeDecodeError, UnicodeEncodeError):
                    try:
                        decoded = result.encode('cp1252').decode('utf-8')
                        if decoded == result:
                            break
                        result = decoded
                    except (UnicodeDecodeError, UnicodeEncodeError):
                        break
            return result
        elif isinstance(obj, dict):
            return {self._fix_encoding(k): self._fix_encoding(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._fix_encoding(item) for item in obj]
        return obj


    def validate(self, json_data):
        """Valida i dati con il JSON delle regole fornito."""
        if isinstance(self.validation_rules, dict):
            schema = self.validation_rules
        else:
            schema = json.loads(self.validation_rules)

        return self._valida_dati_complessi(json_data, schema)
