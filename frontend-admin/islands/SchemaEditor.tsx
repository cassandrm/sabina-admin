import { useState, useRef, useEffect } from "preact/hooks";
import type { DocumentType } from "../utils/api.ts";

type TestMode = "upload" | "paste";

interface SchemaEditorProps {
    schema: DocumentType;
    onClose: () => void;
    onUpdated: () => void;
}

export default function SchemaEditor({ schema, onClose, onUpdated }: SchemaEditorProps) {
    const [analyzer_id, setAnalyzer_id] = useState(schema.analyzer_id ?? "");
    const [patterns, setPatterns] = useState(schema.patterns ?? "");
    const [validationRules, setValidationRules] = useState("");
    const [loadingRules, setLoadingRules] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingDB, setSavingDB] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    // AI improve rules
    const [improveModalOpen, setImproveModalOpen] = useState(false);
    const [improvePrompt, setImprovePrompt] = useState("");
    const [improvingRules, setImprovingRules] = useState(false);
    const [improveError, setImproveError] = useState<string | null>(null);
    const [saveNotification, setSaveNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Load validation_rules from YAML config file on mount
    useEffect(() => {
        if (!schema.id) {
            setLoadingRules(false);
            return;
        }
        (async () => {
            try {
                const response = await fetch(`/api/admin/schemas/${schema.id}/validation-rules`, {
                    headers: { "Authorization": `Bearer ${localStorage.getItem("authToken")}` },
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.validation_rules) {
                        setValidationRules(JSON.stringify(data.validation_rules, null, 2));
                    } else {
                        setValidationRules(JSON.stringify(schema.validation_rules || {}, null, 2));
                    }
                } else {
                    setValidationRules(JSON.stringify(schema.validation_rules || {}, null, 2));
                }
            } catch {
                setValidationRules(JSON.stringify(schema.validation_rules || {}, null, 2));
            } finally {
                setLoadingRules(false);
            }
        })();
    }, [schema.id]);

    const validateJson = (value: string): boolean => {
        try {
            JSON.parse(value);
            return true;
        } catch {
            return false;
        }
    };

    // Fix mojibake (UTF-8 interpreted as Latin-1), matching backend _fix_encoding logic.
    // Applies up to 3 rounds of latin-1 → utf-8 re-decoding.
    const fixEncoding = (str: string): string => {
        if (!str) return str;
        let result = str;
        for (let i = 0; i < 3; i++) {
            try {
                // Re-encode as latin-1 bytes then decode as utf-8
                const bytes = new Uint8Array(result.length);
                for (let j = 0; j < result.length; j++) bytes[j] = result.charCodeAt(j) & 0xff;
                const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                if (decoded === result) break;
                result = decoded;
            } catch {
                break;
            }
        }
        return result;
    };

    // Render a single field row (used for both error and valid fields)
    // Row for a valid field object { field, label_field, value, rule_description }
    const FieldRow = ({ item }: { item: Record<string, unknown> }) => {
        const label = fixEncoding(String(item.label_field ?? item.field ?? ""));
        const field = fixEncoding(String(item.field ?? ""));
        const value = item.value !== undefined && item.value !== null ? String(item.value) : "—";
        return (
            <div style={{ padding: "0.5rem 0.75rem", marginBottom: "0.35rem", borderRadius: "6px", background: "#f0fff4", border: "1px solid #b7efc5", fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <span style={{ fontWeight: 600, color: "#1a7a3c", flex: 1 }}>{label}</span>
                    <span style={{ fontFamily: "monospace", color: "#555", background: "#d4f5de", padding: "1px 7px", borderRadius: "4px", whiteSpace: "nowrap", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
                </div>
                <div style={{ marginTop: "0.2rem", color: "#888", fontSize: "0.73rem" }}>{field}</div>
            </div>
        );
    };

    // Row for a structured error dict { field, label_field, value, rule_description, failed_check }
    // or a plain string (cross-field / legacy)
    const ErrorRow = ({ item }: { item: Record<string, unknown> | string }) => {
        if (typeof item === "string") {
            return (
                <div style={{ padding: "0.5rem 0.75rem", marginBottom: "0.35rem", borderRadius: "6px", background: "#fff5f5", border: "1px solid #f5c6cb", fontSize: "0.82rem", color: "#7b2d2d" }}>
                    ⚠ {fixEncoding(item)}
                </div>
            );
        }
        const label = item.label_field ? fixEncoding(String(item.label_field)) : (item.field ? fixEncoding(String(item.field)) : null);
        const fieldPath = item.field ? fixEncoding(String(item.field)) : null;
        const value = (item.value !== undefined && item.value !== null && item.value !== "") ? String(item.value) : null;
        const desc = item.rule_description ? fixEncoding(String(item.rule_description)) : null;
        const checkLabels: Record<string, string> = {
            required: "obbligatorio", requiredIf: "obbligatorio (condizionale)", requiredIfNot: "obbligatorio (alternativo)",
            pattern: "formato non valido", enum: "valore non consentito", minLength: "troppo corto",
            maxLength: "troppo lungo", minSelected: "selezione insufficiente", cross_field: "regola trasversale"
        };
        const checkBadge = item.failed_check ? (checkLabels[String(item.failed_check)] ?? String(item.failed_check)) : null;
        return (
            <div style={{ padding: "0.5rem 0.75rem", marginBottom: "0.35rem", borderRadius: "6px", background: "#fff5f5", border: "1px solid #f5c6cb", fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <span style={{ fontWeight: 600, color: "#c0392b", flex: 1 }}>{label ?? "⚠ Errore"}</span>
                    {value && <span style={{ fontFamily: "monospace", color: "#555", background: "#fddede", padding: "1px 7px", borderRadius: "4px", whiteSpace: "nowrap", maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>}
                </div>
                {desc && <div style={{ marginTop: "0.25rem", color: "#7b2d2d", fontStyle: "italic" }}>⚠ {desc}</div>}
                <div style={{ marginTop: "0.2rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {fieldPath && <span style={{ color: "#888", fontSize: "0.73rem" }}>{fieldPath}</span>}
                    {checkBadge && <span style={{ fontSize: "0.68rem", background: "#f5c6cb", color: "#721c24", borderRadius: "3px", padding: "0 5px", fontWeight: 600 }}>{checkBadge}</span>}
                </div>
            </div>
        );
    };

    // Formatted validation result display
    const ValidationResultDisplay = ({ resultJson }: { resultJson: string }) => {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(resultJson);
        } catch {
            return <pre style={{ fontSize: "0.82rem", color: "#333" }}>{resultJson}</pre>;
        }
        const isValid = Boolean(parsed.is_valid);
        const errors: Record<string, unknown>[] = Array.isArray(parsed.error_fields) ? parsed.error_fields as Record<string, unknown>[] : [];
        const valids: Record<string, unknown>[] = Array.isArray(parsed.valid_fields) ? parsed.valid_fields as Record<string, unknown>[] : [];
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "0", overflowY: "auto", flex: 1 }}>
                {/* Summary badge */}
                <div style={{ padding: "0.5rem 0.75rem", marginBottom: "0.6rem", borderRadius: "6px", background: isValid ? "#d4edda" : "#f8d7da", border: `1px solid ${isValid ? "#c3e6cb" : "#f5c6cb"}`, fontWeight: 700, fontSize: "0.9rem", color: isValid ? "#155724" : "#721c24", textAlign: "center" }}>
                    {isValid ? "✅ Validazione superata" : `❌ Validazione fallita — ${errors.length} ${errors.length === 1 ? "errore" : "errori"}, ${valids.length} ${valids.length === 1 ? "campo valido" : "campi validi"}`}
                </div>
                {/* Errors first */}
                {errors.length > 0 && (
                    <div style={{ marginBottom: "0.6rem" }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#c0392b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>Campi con errori ({errors.length})</div>
                        {errors.map((item, i) => <ErrorRow key={i} item={item as Record<string, unknown> | string} />)}
                    </div>
                )}
                {/* Valid fields */}
                {valids.length > 0 && (
                    <div>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#1a7a3c", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>Campi validi ({valids.length})</div>
                        {valids.map((item, i) => <FieldRow key={i} item={item} />)}
                    </div>
                )}
            </div>
        );
    };

    // Modal component
    function Modal({ message, spinner, onClose }: { message: string; spinner?: boolean; onClose?: () => void }) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 16px rgba(0,0,0,0.18)', padding: '2.5rem 2rem', minWidth: '340px', maxWidth: '90vw', textAlign: 'center', fontSize: '1.25rem', color: '#1976d2', position: 'relative' }}>
                    {spinner && <span className="loader" style={{ width: '36px', height: '36px', border: '6px solid #1976d2', borderTop: '6px solid #f8f9fa', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block', marginBottom: '1rem' }}></span>}
                    <div>{message}</div>
                    {onClose && <button onClick={onClose} style={{ marginTop: '2rem', padding: '0.75rem 2rem', fontSize: '1.1rem', background: '#1976d2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>OK</button>}
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    const [modal, setModal] = useState<{ message: string; spinner?: boolean; onClose?: () => void } | null>(null);
    const [analyzeResult, setAnalyzeResult] = useState<string>("");
    const [pasteResult, setPasteResult] = useState<string>("");
    const [analyzing, setAnalyzing] = useState(false);
    const [uploadValidationResult, setUploadValidationResult] = useState<string>("");
    const [pasteValidationResult, setPasteValidationResult] = useState<string>("");
    const [validating, setValidating] = useState(false);
    const [testMode, setTestMode] = useState<TestMode>("upload");
    const [pasteError, setPasteError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = async () => {
        let parsedValidationRules;
        try {
            parsedValidationRules = JSON.parse(validationRules);
        } catch {
            setValidationError("validation_rules non è un JSON valido");
            return;
        }
        if (!parsedValidationRules || Object.keys(parsedValidationRules).length === 0) {
            setValidationError("Le validation rules non possono essere vuote.");
            return;
        }
        setValidationError(null);
        setSaving(true);
        setError(null);
        try {
            setModal({ message: 'Salvataggio delle modifiche in corso...', spinner: true });

            // 1. Salva le validation_rules nel file YAML
            const rulesResponse = await fetch(`/api/admin/schemas/${schema.id}/validation-rules`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                },
                body: JSON.stringify({ validation_rules: parsedValidationRules }),
            });
            if (!rulesResponse.ok) {
                const errorData = await rulesResponse.json().catch(() => ({}));
                setModal({ message: errorData.detail || 'Errore nel salvataggio delle validation rules', onClose: () => setModal(null) });
                throw new Error(errorData.detail || "Errore nel salvataggio delle validation rules");
            }

            // 2. Salva gli altri campi (analyzer_id, patterns) nel database
            const response = await fetch(`/api/admin/schemas/${schema.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                },
                body: JSON.stringify({
                    analyzer_id,
                    patterns
                }),
            });
            const respText = await response.text();
            if (!response.ok) {
                const errorData = respText ? JSON.parse(respText) : {};
                setModal({ message: errorData.detail || 'Errore nel salvataggio', onClose: () => setModal(null) });
                throw new Error(errorData.detail || "Errore nel salvataggio");
            }
            setModal(null);
            setSaveNotification({ type: 'success', message: '✅ Salvataggio su YAML completato con successo.' });
            setTimeout(() => setSaveNotification(null), 5000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Errore sconosciuto");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveDB = async () => {
        let parsedValidationRules;
        try {
            parsedValidationRules = JSON.parse(validationRules);
        } catch {
            setValidationError("validation_rules non è un JSON valido");
            return;
        }
        if (!parsedValidationRules || Object.keys(parsedValidationRules).length === 0) {
            setValidationError("Le validation rules non possono essere vuote.");
            return;
        }
        setValidationError(null);
        setSavingDB(true);
        setError(null);
        try {
            setModal({ message: 'Salvataggio su DB in corso...', spinner: true });
            const response = await fetch(`/api/admin/schemas/${schema.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                },
                body: JSON.stringify({ analyzer_id, patterns, validation_rules: parsedValidationRules }),
            });
            const respText = await response.text();
            if (!response.ok) {
                const errorData = respText ? JSON.parse(respText) : {};
                setModal({ message: errorData.detail || 'Errore nel salvataggio su DB', onClose: () => setModal(null) });
                throw new Error(errorData.detail || "Errore nel salvataggio su DB");
            }
            setModal(null);
            setSaveNotification({ type: 'success', message: '✅ Salvataggio su DB completato con successo.' });
            setTimeout(() => setSaveNotification(null), 5000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Errore sconosciuto");
        } finally {
            setSavingDB(false);
        }
    };

    const handleUpload = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    };

    const handleFileSelected = async (e: Event) => {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (!analyzer_id) {
            setError("Analyzer ID mancante. Impossibile analizzare il file.");
            return;
        }

        setAnalyzing(true);
        setError(null);
        setAnalyzeResult("");
        setModal({ message: `Analisi del file "${file.name}" in corso...`, spinner: true });

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("analyzer_id", analyzer_id);

            const response = await fetch("/api/analyzers/analyze", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                },
                body: formData,
            });

            const respText = await response.text();
            if (!response.ok) {
                const errorData = respText ? JSON.parse(respText) : {};
                const detail = errorData.detail || "Errore durante l'analisi del PDF";
                setModal({ message: detail, onClose: () => setModal(null) });
                setError(detail);
                return;
            }

            const data = JSON.parse(respText);
            const fields = data.fields || data;
            setAnalyzeResult(JSON.stringify(fields, null, 2));
            setModal({ message: "Analisi completata con successo!" });
            setTimeout(() => setModal(null), 2000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Errore sconosciuto";
            setError(msg);
            setModal({ message: msg, onClose: () => setModal(null) });
        } finally {
            setAnalyzing(false);
        }
    };

    const handleValidate = async () => {
        const activeData = testMode === "paste" ? pasteResult : analyzeResult;
        if (!activeData || !schema.id) return;

        const setActiveValidationResult = testMode === "paste" ? setPasteValidationResult : setUploadValidationResult;

        setValidating(true);
        setError(null);
        setActiveValidationResult("");
        setModal({ message: 'Validazione in corso...', spinner: true });

        try {
            const jsonData = JSON.parse(activeData);

            const response = await fetch("/api/analyzers/validate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                },
                body: JSON.stringify({
                    schema_id: schema.id,
                    json_data: jsonData,
                }),
            });

            const respText = await response.text();
            if (!response.ok) {
                const errorData = respText ? JSON.parse(respText) : {};
                const detail = errorData.detail || "Errore durante la validazione";
                setModal({ message: detail, onClose: () => setModal(null) });
                setError(detail);
                return;
            }

            const result = JSON.parse(respText);
            setActiveValidationResult(JSON.stringify(result, null, 2));

            const isValid = result.is_valid;
            const errorCount = result.error_fields?.length || 0;
            const validCount = result.valid_fields?.length || 0;
            const msg = isValid
                ? `Validazione superata! ${validCount} campi validi.`
                : `Validazione completata: ${errorCount} errori, ${validCount} campi validi.`;
            setModal({ message: msg, onClose: () => setModal(null) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Errore sconosciuto";
            setError(msg);
            setModal({ message: msg, onClose: () => setModal(null) });
        } finally {
            setValidating(false);
        }
    };

    const handleImproveRules = async () => {
        if (!improvePrompt.trim() || !schema.id) return;
        let currentRules;
        try {
            currentRules = JSON.parse(validationRules);
        } catch {
            setImproveError("Le Validation Rules non sono un JSON valido. Correggile prima di usare l'AI.");
            return;
        }
        setImprovingRules(true);
        setImproveError(null);
        try {
            const response = await fetch(`/api/admin/schemas/${schema.id}/improve-rules`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                },
                body: JSON.stringify({ prompt: improvePrompt, current_rules: currentRules }),
            });
            const data = await response.json();
            if (!response.ok) {
                setImproveError(data.detail || "Errore nella chiamata AI");
                return;
            }
            setValidationRules(JSON.stringify(data.improved_rules, null, 2));
            setImproveModalOpen(false);
            setImprovePrompt("");
            setImproveError(null);
        } catch (err) {
            setImproveError(err instanceof Error ? err.message : "Errore sconosciuto");
        } finally {
            setImprovingRules(false);
        }
    };

    return (
        <div style={{ border: '2px solid #007bff', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#f8f9fa', margin: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%' }}>
            <input
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#1976d2' }}>
                    Modifica Schema: {schema.name || schema.analyzer_id}
                </h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving || savingDB || !validateJson(validationRules) || !validationRules.trim()}
                        style={{ padding: '0.45rem 1.1rem', backgroundColor: saving ? '#6c757d' : '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.95rem', fontWeight: 'bold' }}
                        title="Salva validation_rules nel file YAML + analyzer_id/patterns nel DB"
                    >
                        {saving ? 'Salvataggio...' : '💾 Salva su YAML'}
                    </button>
                    <button
                        onClick={handleSaveDB}
                        disabled={savingDB || saving || !validateJson(validationRules) || !validationRules.trim()}
                        style={{ padding: '0.45rem 1.1rem', backgroundColor: savingDB ? '#6c757d' : '#0d6efd', color: 'white', border: 'none', borderRadius: '4px', cursor: savingDB ? 'not-allowed' : 'pointer', fontSize: '0.95rem', fontWeight: 'bold' }}
                        title="Salva tutte le modifiche (analyzer_id, patterns, validation_rules) nel DB"
                    >
                        {savingDB ? 'Salvataggio...' : '🗄️ Salva su DB'}
                    </button>
                    <button
                        onClick={onClose}
                        style={{ padding: '0.45rem 1.1rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 'bold' }}
                    >
                        Indietro
                    </button>
                </div>
            </div>

            {saveNotification && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: saveNotification.type === 'success' ? '#d4edda' : '#f8d7da', border: `1px solid ${saveNotification.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`, borderRadius: '4px', marginBottom: '0.5rem', color: saveNotification.type === 'success' ? '#155724' : '#721c24', fontWeight: 600 }}>
                    <span>{saveNotification.message}</span>
                    <button onClick={() => setSaveNotification(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'inherit', lineHeight: 1 }}>×</button>
                </div>
            )}
            {error && (
                <div style={{ color: '#dc3545', padding: '0.5rem', background: '#f8d7da', borderRadius: '4px', marginBottom: '0.5rem' }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                {/* Analyzer ID + Patterns */}
                <div>
                    <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>Analyzer ID:</label>
                    <input
                        value={analyzer_id}
                        readOnly
                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '1px solid #ced4da', background: '#e9ecef', color: '#888', boxSizing: 'border-box' }}
                    />
                </div>

                <div>
                    <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>Patterns:</label>
                    <input
                        value={patterns}
                        onInput={e => setPatterns((e.target as HTMLInputElement).value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ced4da', fontFamily: 'monospace', fontSize: '1rem', boxSizing: 'border-box' }}
                    />
                </div>

                {/* Side-by-side: Validation Rules | Test Panel */}
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'stretch', width: '100%' }}>

                    {/* LEFT: Validation Rules */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                            <label style={{ fontWeight: "bold" }}>Validation Rules (da file YAML):</label>
                            <button
                                onClick={() => { setImproveModalOpen(true); setImproveError(null); }}
                                disabled={loadingRules || !validationRules.trim()}
                                title="Migliora le Validation Rules con l'AI"
                                style={{ padding: "0.3rem 0.8rem", background: "#6f42c1", color: "#fff", border: "none", borderRadius: "4px", cursor: (loadingRules || !validationRules.trim()) ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: "bold", opacity: (loadingRules || !validationRules.trim()) ? 0.55 : 1 }}
                            >
                                🤖 AI Migliora Regole
                            </button>
                        </div>
                        {validationError && (
                            <div style={{ color: '#dc3545', marginBottom: '0.5rem' }}>{validationError}</div>
                        )}
                        {loadingRules ? (
                            <div style={{ padding: "1rem", color: "#6c757d", fontStyle: "italic" }}>Caricamento validation rules dal file...</div>
                        ) : (
                            <textarea
                                value={validationRules}
                                onChange={(e: Event) => setValidationRules((e.target as HTMLTextAreaElement).value)}
                                style={{ flex: 1, width: "100%", minHeight: "200px", padding: "0.5rem", border: "1px solid #ced4da", borderRadius: "4px", fontFamily: "monospace", fontSize: "1rem", resize: 'none', overflowY: "auto", boxSizing: 'border-box' }}
                            />
                        )}
                    </div>

                    {/* RIGHT: Test Panel */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                        {/* Title row with tabs on the right */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontWeight: 'bold', margin: 0 }}>Test Dati Estratti:</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => {
                                        // Se già in upload e c'è un risultato, re-click → reset per nuovo upload
                                        if (testMode === "upload" && analyzeResult) {
                                            setAnalyzeResult("");
                                            setUploadValidationResult("");
                                        }
                                        // Se vengo da paste, semplicemente torno a upload (analyzeResult precedente preservato)
                                        setTestMode("upload");
                                        setPasteError(null);
                                    }}
                                    style={{ padding: '0.3rem 0.75rem', borderRadius: '4px', border: testMode === "upload" ? '2px solid #0d6efd' : '1px solid #ced4da', background: testMode === "upload" ? '#e7f0ff' : '#f8f9fa', fontWeight: testMode === "upload" ? 'bold' : 'normal', cursor: 'pointer', fontSize: '0.9rem' }}
                                >
                                    📄 Upload PDF
                                </button>
                                <button
                                    onClick={() => { setTestMode("paste"); setPasteError(null); }}
                                    style={{ padding: '0.3rem 0.75rem', borderRadius: '4px', border: testMode === "paste" ? '2px solid #0d6efd' : '1px solid #ced4da', background: testMode === "paste" ? '#e7f0ff' : '#f8f9fa', fontWeight: testMode === "paste" ? 'bold' : 'normal', cursor: 'pointer', fontSize: '0.9rem' }}
                                >
                                    📋 Incolla JSON
                                </button>
                            </div>
                        </div>

                        {/* Upload mode: textarea with overlaid button when no data yet */}
                        {testMode === "upload" && (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {analyzeResult && (
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', color: '#495057' }}>
                                        Dati estratti dal PDF:
                                    </label>
                                )}
                                <div style={{ position: 'relative' }}>
                                    <textarea
                                        value={analyzeResult}
                                        readOnly
                                        placeholder={analyzeResult ? '' : 'I dati estratti dal PDF appariranno qui...'}
                                        style={{ width: "100%", height: "200px", padding: "0.5rem", border: "1px solid #ced4da", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.9rem", resize: "none", overflowY: "auto", backgroundColor: "#fff", boxSizing: 'border-box', color: analyzeResult ? 'inherit' : '#adb5bd' }}
                                    />
                                    {!analyzeResult && (
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', pointerEvents: 'none' }}>
                                            <button
                                                onClick={handleUpload}
                                                disabled={analyzing || !analyzer_id}
                                                style={{ pointerEvents: 'all', padding: "0.6rem 1.4rem", backgroundColor: analyzing ? "#6c757d" : "#0d6efd", color: "white", border: "none", borderRadius: "4px", cursor: analyzing ? "not-allowed" : "pointer", fontSize: "0.95rem", fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}
                                            >
                                                {analyzing ? "Analisi in corso..." : "📄 Carica PDF e analizza"}
                                            </button>
                                            {!analyzer_id && (
                                                <div style={{ pointerEvents: 'none', fontSize: '0.82rem', color: '#6c757d', fontStyle: 'italic' }}>Analyzer ID mancante</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Paste mode */}
                        {testMode === "paste" && (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {pasteError && (
                                    <div style={{ color: '#dc3545', marginBottom: '0.4rem', fontSize: '0.9rem' }}>{pasteError}</div>
                                )}
                                <textarea
                                    value={pasteResult}
                                    onInput={(e: Event) => {
                                        const val = (e.target as HTMLTextAreaElement).value;
                                        setPasteResult(val);
                                        setPasteValidationResult("");
                                        if (val.trim()) {
                                            try { JSON.parse(val); setPasteError(null); }
                                            catch { setPasteError("JSON non valido"); }
                                        } else {
                                            setPasteError(null);
                                        }
                                    }}
                                    placeholder={'Incolla qui il JSON con i dati estratti dal documento:\n\n{\n  "field": "value",\n  ...\n}'}
                                    style={{ width: "100%", height: "200px", padding: "0.5rem", border: pasteError ? "2px solid #dc3545" : "1px solid #ced4da", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.9rem", resize: "none", overflowY: "auto", boxSizing: 'border-box' }}
                                />
                            </div>
                        )}

                        {/* Validate button */}
                        <button
                            onClick={handleValidate}
                            disabled={validating || !(testMode === "paste" ? pasteResult.trim() && !pasteError : analyzeResult.trim())}
                            style={{ padding: "0.75rem 1rem", backgroundColor: (validating || !(testMode === "paste" ? pasteResult.trim() && !pasteError : analyzeResult.trim())) ? "#6c757d" : "#ff9800", color: "white", border: "none", borderRadius: "4px", cursor: (validating || !(testMode === "paste" ? pasteResult.trim() && !pasteError : analyzeResult.trim())) ? "not-allowed" : "pointer", fontSize: "1rem", fontWeight: "bold" }}
                        >
                            {validating ? "Validazione in corso..." : "✅ Applica Regole di Validazione"}
                        </button>

                        {/* Validation result for active tab — below the button */}
                        {(() => {
                            const activeResult = testMode === "paste" ? pasteValidationResult : uploadValidationResult;
                            if (!activeResult) return null;
                            return (
                                <div style={{ marginTop: "0.25rem" }}>
                                    <ValidationResultDisplay resultJson={activeResult} />
                                </div>
                            );
                        })()}
                    </div>
                </div>


            </div>

            {modal && <Modal message={modal.message} spinner={modal.spinner} onClose={modal.onClose} />}

            {/* AI Improve Rules Modal */}
            {improveModalOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.35)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 4px 24px rgba(0,0,0,0.22)", padding: "2rem", minWidth: "480px", maxWidth: "90vw", width: "560px", display: "flex", flexDirection: "column", gap: "1rem", position: "relative", overflow: "hidden" }}>

                        {/* Spinner overlay durante l'elaborazione */}
                        {improvingRules && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.88)", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", borderRadius: "12px" }}>
                                <div style={{ width: "48px", height: "48px", border: "5px solid #e0d4f7", borderTop: "5px solid #6f42c1", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
                                <div style={{ color: "#6f42c1", fontWeight: 600, fontSize: "1rem" }}>Elaborazione in corso...</div>
                                <div style={{ color: "#888", fontSize: "0.82rem" }}>L&apos;AI sta analizzando e migliorando le regole</div>
                                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                            </div>
                        )}

                        <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#6f42c1" }}>🤖 Migliora Regole con AI</div>
                        <div style={{ fontSize: "0.9rem", color: "#555" }}>
                            Descrivi il problema da correggere o il miglioramento da apportare alle Validation Rules attuali.
                            L&apos;AI restituirà una versione aggiornata pronta da testare.
                        </div>
                        <textarea
                            value={improvePrompt}
                            onInput={(e: Event) => setImprovePrompt((e.target as HTMLTextAreaElement).value)}
                            placeholder="Es: Il campo 'codice_fiscale' non valida correttamente i codici fiscali di 16 caratteri..."
                            disabled={improvingRules}
                            style={{ width: "100%", minHeight: "120px", padding: "0.6rem", border: "1px solid #ced4da", borderRadius: "6px", fontFamily: "sans-serif", fontSize: "0.95rem", resize: "vertical", boxSizing: "border-box" }}
                        />
                        {improveError && (
                            <div style={{ color: "#c0392b", background: "#fdf3f3", border: "1px solid #f5c6cb", borderRadius: "6px", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}>
                                {improveError}
                            </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                            <button
                                onClick={() => { setImproveModalOpen(false); setImprovePrompt(""); setImproveError(null); }}
                                disabled={improvingRules}
                                style={{ padding: "0.5rem 1.2rem", background: "#6c757d", color: "#fff", border: "none", borderRadius: "6px", cursor: improvingRules ? "not-allowed" : "pointer", fontWeight: "bold" }}
                            >
                                Annulla
                            </button>
                            <button
                                onClick={handleImproveRules}
                                disabled={improvingRules || !improvePrompt.trim()}
                                style={{ padding: "0.5rem 1.4rem", background: improvingRules || !improvePrompt.trim() ? "#9b77c7" : "#6f42c1", color: "#fff", border: "none", borderRadius: "6px", cursor: (improvingRules || !improvePrompt.trim()) ? "not-allowed" : "pointer", fontWeight: "bold", minWidth: "120px" }}
                            >
                                {improvingRules ? "⏳ Elaborazione..." : "✨ Applica AI"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
