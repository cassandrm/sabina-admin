import { useState, useRef, useEffect } from "preact/hooks";
import type { DocumentType } from "../utils/api.ts";

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
    const [error, setError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

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
    const [analyzing, setAnalyzing] = useState(false);
    const [validationResult, setValidationResult] = useState<string>("");
    const [validating, setValidating] = useState(false);
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
            setModal({ message: 'Salvataggio completato con successo!' });
            setTimeout(() => {
                setModal(null);
                onUpdated();
            }, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Errore sconosciuto");
        } finally {
            setSaving(false);
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
        if (!analyzeResult || !schema.id) return;

        setValidating(true);
        setError(null);
        setValidationResult("");
        setModal({ message: 'Validazione in corso...', spinner: true });

        try {
            const jsonData = JSON.parse(analyzeResult);

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
            setValidationResult(JSON.stringify(result, null, 2));

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

    return (
        <div style={{ border: '2px solid #007bff', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#f8f9fa', margin: 0, maxWidth: '1700px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%' }}>
            <input
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', marginTop: 0, color: '#1976d2' }}>
                Modifica Schema: {schema.name || schema.analyzer_id}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                <div>
                    <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>Analyzer ID:</label>
                    <input
                        value={analyzer_id}
                        readOnly
                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '6px', border: '1px solid #ced4da', background: '#e9ecef', color: '#888' }}
                    />
                </div>

                <div>
                    <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>Patterns:</label>
                    <input
                        value={patterns}
                        onInput={e => setPatterns((e.target as HTMLInputElement).value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ced4da', fontFamily: 'monospace', fontSize: '1rem' }}
                    />
                </div>

                <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Validation Rules (da file YAML):</label>
                    {validationError && (
                        <div style={{ color: '#dc3545', marginBottom: '0.5rem' }}>{validationError}</div>
                    )}
                    {loadingRules ? (
                        <div style={{ padding: "1rem", color: "#6c757d", fontStyle: "italic" }}>Caricamento validation rules dal file...</div>
                    ) : (
                    <textarea
                        value={validationRules}
                        onChange={(e: Event) => setValidationRules((e.target as HTMLTextAreaElement).value)}
                        rows={18}
                        style={{ width: "100%", minHeight: '340px', padding: "0.5rem", border: "1px solid #ced4da", borderRadius: "4px", fontFamily: "monospace", fontSize: "1rem", resize: 'vertical' }}
                    />
                    )}
                </div>

                {error && (
                    <div style={{ color: '#dc3545', padding: '0.5rem', background: '#f8d7da', borderRadius: '4px' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                    <button
                        onClick={handleSave}
                        disabled={saving || !validateJson(validationRules) || !validationRules.trim()}
                        style={{ flex: 1, padding: "0.75rem", backgroundColor: saving ? "#6c757d" : "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: saving ? "not-allowed" : "pointer", fontSize: "1rem" }}
                    >
                        {saving ? "Salvataggio..." : "💾 Salva Modifiche"}
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={analyzing || !analyzer_id}
                        style={{ flex: 1, padding: "0.75rem", backgroundColor: analyzing ? "#6c757d" : "#0d6efd", color: "white", border: "none", borderRadius: "4px", cursor: analyzing ? "not-allowed" : "pointer", fontSize: "1rem" }}
                    >
                        {analyzing ? "Analisi in corso..." : "📄 Upload PDF"}
                    </button>
                    <button
                        onClick={onClose}
                        style={{ flex: 1, padding: "0.75rem", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "1rem" }}
                    >
                        Annulla
                    </button>
                </div>

                {analyzeResult && (
                    <div style={{ marginTop: "1rem" }}>
                        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "#0d6efd" }}>
                            📋 Risultato Analisi PDF:
                        </label>
                        <textarea
                            value={analyzeResult}
                            readOnly
                            rows={20}
                            style={{ width: "100%", minHeight: "300px", padding: "0.5rem", border: "2px solid #0d6efd", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.9rem", resize: "vertical", backgroundColor: "#f0f7ff" }}
                        />
                        <button
                            onClick={handleValidate}
                            disabled={validating}
                            style={{ marginTop: "0.75rem", padding: "0.75rem 2rem", backgroundColor: validating ? "#6c757d" : "#ff9800", color: "white", border: "none", borderRadius: "4px", cursor: validating ? "not-allowed" : "pointer", fontSize: "1rem", fontWeight: "bold" }}
                        >
                            {validating ? "Validazione in corso..." : "✅ Applica Regole di Validazione"}
                        </button>
                    </div>
                )}

                {validationResult && (() => {
                    const parsed = JSON.parse(validationResult);
                    const isValid = parsed.is_valid;
                    return (
                        <div style={{ marginTop: "1rem" }}>
                            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: isValid ? "#28a745" : "#dc3545" }}>
                                {isValid ? "✅ Validazione Superata" : "❌ Risultato Validazione"}
                            </label>
                            <textarea
                                value={validationResult}
                                readOnly
                                rows={20}
                                style={{ width: "100%", minHeight: "300px", padding: "0.5rem", border: `2px solid ${isValid ? "#28a745" : "#dc3545"}`, borderRadius: "4px", fontFamily: "monospace", fontSize: "0.9rem", resize: "vertical", backgroundColor: isValid ? "#f0fff0" : "#fff0f0" }}
                            />
                        </div>
                    );
                })()}
            </div>

            {modal && <Modal message={modal.message} spinner={modal.spinner} onClose={modal.onClose} />}
        </div>
    );
}
