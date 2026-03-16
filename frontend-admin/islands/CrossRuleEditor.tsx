import { useEffect, useRef, useState } from "preact/hooks";
import type { CrossCheck, CrossRuleEntry, CrossRuleValidationResult } from "../utils/api.ts";
import {
    getCrossRules,
    saveCrossRules,
    getFieldsForAnalyzers,
    getAllDocumentTypes,
    validateCrossChecks,
} from "../utils/api.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocOption { analyzer_id: string; label: string; }
type EditingIdx = number | "new" | null; // index into rules[], or "new", or null

// ─── Helpers  ─────────────────────────────────────────────────────────────────

function fixEncoding(str: string): string {
    if (!str) return str;
    let result = str;
    for (let i = 0; i < 3; i++) {
        try {
            const bytes = new Uint8Array(result.length);
            for (let j = 0; j < result.length; j++) bytes[j] = result.charCodeAt(j) & 0xff;
            const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            if (decoded === result) break;
            result = decoded;
        } catch { break; }
    }
    return result;
}
function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return "—";
    return fixEncoding(String(v));
}

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

interface EditFormProps {
    initial: CrossRuleEntry | null;          // null = new rule
    docOptions: DocOption[];
    onCancel: () => void;
    onApply: (rule: CrossRuleEntry) => void; // apply to in-memory list
}

function RuleEditForm({ initial, docOptions, onCancel, onApply }: EditFormProps) {
    const [labelName, setLabelName] = useState(initial?.label_name ?? "");
    const [selectedIds, setSelectedIds] = useState<string[]>(
        initial?.analyzer_ids?.slice(0, 2) ?? []
    );
    const [fieldsByAnalyzer, setFieldsByAnalyzer] = useState<Record<string, string[]>>({});
    const [loadingFields, setLoadingFields] = useState(false);
    const [checks, setChecks] = useState<CrossCheck[]>(
        initial?.checks?.length ? initial.checks : [{ field: "", compare_with: "", check: "equals_ignorecase", message: "" }]
    );
    const [err, setErr] = useState<string | null>(null);

    const idA = selectedIds[0] ?? null;
    const idB = selectedIds[1] ?? null;
    const labelA = docOptions.find((d) => d.analyzer_id === idA)?.label ?? idA ?? "Documento A";
    const labelB = docOptions.find((d) => d.analyzer_id === idB)?.label ?? idB ?? "Documento B";

    // Load fields whenever selected pair changes
    useEffect(() => {
        if (selectedIds.length === 0) { setFieldsByAnalyzer({}); return; }
        setLoadingFields(true);
        getFieldsForAnalyzers(selectedIds)
            .then(setFieldsByAnalyzer)
            .catch(() => setFieldsByAnalyzer({}))
            .finally(() => setLoadingFields(false));
    }, [selectedIds.join(",")]);

    const fieldsA = (idA ? fieldsByAnalyzer[idA] ?? [] : []).map((f) => ({ value: `${idA}.${f}`, label: f }));
    const fieldsB = (idB ? fieldsByAnalyzer[idB] ?? [] : []).map((f) => ({ value: `${idB}.${f}`, label: f }));

    // Exactly 2 documents: toggle selection, max 2
    const toggleAnalyzer = (id: string) => {
        setSelectedIds((prev) => {
            if (prev.includes(id)) return prev.filter((a) => a !== id);
            if (prev.length < 2) return [...prev, id];
            // already 2: replace the second
            return [prev[0], id];
        });
    };

    const AUTO_MSG_PREFIX = "I valori di ";
    const isAutoMsg = (msg: string | undefined) => !msg || msg.startsWith(AUTO_MSG_PREFIX);

    const buildAutoMsg = (fieldVal: string, compareVal: string) => {
        const fLabel = fieldVal.includes(".") ? fieldVal.split(".").slice(1).join(".") : fieldVal;
        const cLabel = compareVal.includes(".") ? compareVal.split(".").slice(1).join(".") : compareVal;
        if (!fLabel || !cLabel) return "";
        return `${AUTO_MSG_PREFIX}«${fLabel}» e «${cLabel}» devono corrispondere`;
    };

    const updateCheck = (i: number, key: keyof CrossCheck, val: string) =>
        setChecks((p) => p.map((c, idx) => {
            if (idx !== i) return c;
            const updated = { ...c, [key]: val };
            // Auto-update message only if it was auto-generated or empty
            if ((key === "field" || key === "compare_with") && isAutoMsg(c.message)) {
                const newMsg = buildAutoMsg(
                    key === "field" ? val : c.field,
                    key === "compare_with" ? val : c.compare_with,
                );
                updated.message = newMsg;
            }
            return updated;
        }));

    const handleApply = () => {
        if (!labelName.trim()) { setErr("Inserire un nome per la regola."); return; }
        if (selectedIds.length < 2) { setErr("Selezionare esattamente 2 documenti."); return; }
        const valid = checks.filter((c) => c.field && c.compare_with);
        if (!valid.length) { setErr("Definire almeno una coppia di campi."); return; }
        onApply({ label_name: labelName.trim(), analyzer_ids: selectedIds, checks: valid });
    };

    return (
        <div style={{ background: "#f3eeff", border: "2px solid #6f42c1", borderRadius: "8px", padding: "1.25rem", marginTop: "0.5rem" }}>
            {err && <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "4px", padding: "0.5rem 0.75rem", marginBottom: "0.75rem", color: "#856404", fontSize: "0.88rem" }}>{err}</div>}

            {/* Label */}
            <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.9rem", display: "block", marginBottom: "0.3rem" }}>Nome regola</label>
                <input value={labelName} onInput={(e) => setLabelName((e.target as HTMLInputElement).value)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem", boxSizing: "border-box" }} />
            </div>

            {/* Analyzer selection – exactly 2 */}
            <div style={{ marginBottom: "0.85rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.9rem", display: "block", marginBottom: "0.4rem" }}>
                    Documenti coinvolti (esattamente 2)
                    {selectedIds.length === 2 && (
                        <span style={{ marginLeft: "0.5rem", fontSize: "0.78rem", color: "#6f42c1" }}>
                            → A: <b>{labelA}</b> &nbsp; B: <b>{labelB}</b>
                        </span>
                    )}
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {docOptions.map((doc) => {
                        const pos = selectedIds.indexOf(doc.analyzer_id); // -1, 0, or 1
                        const checked = pos >= 0;
                        const badge = pos === 0 ? " [A]" : pos === 1 ? " [B]" : "";
                        return (
                            <label key={doc.analyzer_id} style={{
                                display: "flex", alignItems: "center", gap: "0.3rem",
                                padding: "0.3rem 0.7rem", borderRadius: "20px", cursor: "pointer",
                                border: `2px solid ${checked ? "#6f42c1" : "#dee2e6"}`,
                                background: checked ? "#e9d8fd" : "#fff",
                                color: checked ? "#6f42c1" : "#555", fontWeight: checked ? 600 : 400, fontSize: "0.85rem", userSelect: "none",
                            }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleAnalyzer(doc.analyzer_id)} style={{ display: "none" }} />
                                {checked ? "✔ " : ""}{doc.label}{badge}
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* Check pairs */}
            <div style={{ marginBottom: "0.85rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.9rem", display: "block", marginBottom: "0.4rem" }}>
                    Confronti (equals, ignora maiusc./minusc.)
                </label>
                {loadingFields && <div style={{ fontSize: "0.85rem", color: "#6f42c1", marginBottom: "0.4rem" }}>Caricamento campi...</div>}

                {/* Column headers */}
                {selectedIds.length === 2 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8rem 1fr 1.8rem", gap: "0.4rem", marginBottom: "0.2rem" }}>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6f42c1", paddingLeft: "0.3rem" }}>{labelA}</div>
                        <div />
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#6f42c1", paddingLeft: "0.3rem" }}>{labelB}</div>
                        <div />
                    </div>
                )}

                {checks.map((c, i) => (
                    <div key={i} style={{ marginBottom: "0.6rem" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8rem 1fr 1.8rem", gap: "0.4rem", alignItems: "center" }}>
                            <select value={c.field} onChange={(e) => updateCheck(i, "field", (e.target as HTMLSelectElement).value)}
                                style={{ padding: "0.35rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.82rem" }}>
                                <option value="">— Campo —</option>
                                {fieldsA.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            <span style={{ color: "#6f42c1", fontWeight: 700, fontSize: "0.82rem", textAlign: "center" }}>==</span>
                            <select value={c.compare_with} onChange={(e) => updateCheck(i, "compare_with", (e.target as HTMLSelectElement).value)}
                                style={{ padding: "0.35rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.82rem" }}>
                                <option value="">— Campo —</option>
                                {fieldsB.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            <button onClick={() => setChecks((p) => p.filter((_, idx) => idx !== i))}
                                disabled={checks.length === 1}
                                style={{ background: checks.length === 1 ? "#dee2e6" : "#dc3545", color: "#fff", border: "none", borderRadius: "4px", padding: "0.28rem 0.5rem", cursor: checks.length === 1 ? "default" : "pointer", fontSize: "0.82rem" }}>
                                🗑
                            </button>
                        </div>
                        <input type="text" value={c.message ?? ""} onInput={(e) => updateCheck(i, "message", (e.target as HTMLInputElement).value)}
                            placeholder="Messaggio di errore (opzionale)"
                            style={{ marginTop: "0.25rem", width: "100%", padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.8rem", boxSizing: "border-box", color: "#555" }} />
                    </div>
                ))}
                <button onClick={() => setChecks((p) => [...p, { field: "", compare_with: "", check: "equals_ignorecase", message: "" }])}
                    style={{ fontSize: "0.82rem", background: "#6f42c1", color: "#fff", border: "none", borderRadius: "4px", padding: "0.3rem 0.8rem", cursor: "pointer" }}>
                    ➕ Aggiungi confronto
                </button>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button onClick={onCancel} style={{ padding: "0.4rem 1rem", background: "#6c757d", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.88rem" }}>Annulla</button>
                <button onClick={handleApply} style={{ padding: "0.4rem 1.1rem", background: "#6f42c1", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.88rem", fontWeight: 700 }}>✔ Applica</button>
            </div>
        </div>
    );
}

// ─── Doc Input Card (shared by global test panel) ────────────────────────────

interface DocInputCardProps {
    aid: string;
    docLabel: string;
    loadedJson: string | null;
    onLoaded: (json: string) => void;
    onClear: () => void;
}

function DocInputCard({ aid, docLabel, loadedJson, onLoaded, onClear }: DocInputCardProps) {
    const [mode, setMode] = useState<"pdf" | "json">("pdf");
    const [jsonDraft, setJsonDraft] = useState("");
    const [jsonErr, setJsonErr] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = () => { if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.click(); } };

    const handleFile = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        setAnalyzing(true);
        try {
            const fd = new FormData();
            fd.append("file", file); fd.append("analyzer_id", aid);
            const r = await fetch("/api/analyzers/analyze", {
                method: "POST",
                headers: { "Authorization": `Bearer ${localStorage.getItem("authToken")}` },
                body: fd,
            });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Errore analisi PDF"); }
            const data = await r.json();
            onLoaded(JSON.stringify(data.fields || data, null, 2));
        } catch (err) { alert(err instanceof Error ? err.message : "Errore upload"); }
        finally { setAnalyzing(false); }
    };

    const handleJsonApply = () => {
        try { JSON.parse(jsonDraft); onLoaded(jsonDraft); setJsonErr(""); }
        catch (e) { setJsonErr("JSON non valido: " + (e instanceof Error ? e.message : e)); }
    };

    const tabStyle = (active: boolean) => ({
        padding: "0.2rem 0.65rem", fontSize: "0.78rem", cursor: "pointer", border: "1px solid #e65c00",
        background: active ? "#e65c00" : "#fff", color: active ? "#fff" : "#e65c00",
        fontWeight: active ? 700 : 400,
    } as const);

    const loaded = !!loadedJson;

    return (
        <div style={{ flex: "1 1 280px", border: `2px solid ${loaded ? "#e65c00" : "#dee2e6"}`, borderRadius: "6px", padding: "0.75rem", background: loaded ? "#fff3e0" : "#fafafa" }}>
            <input type="file" accept="application/pdf" ref={fileInputRef} style={{ display: "none" }} onChange={handleFile} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#e65c00" }}>{loaded ? "✅ " : "📄 "}{docLabel}</span>
                {!loaded && (
                    <div style={{ display: "flex", borderRadius: "4px", overflow: "hidden" }}>
                        <button onClick={() => { setMode("pdf"); }} style={{ ...tabStyle(mode === "pdf"), borderRadius: "4px 0 0 4px" }}>PDF</button>
                        <button onClick={() => { setMode("json"); }} style={{ ...tabStyle(mode === "json"), borderRadius: "0 4px 4px 0", borderLeft: "none" }}>JSON</button>
                    </div>
                )}
            </div>
            {loaded ? (
                <>
                    <div style={{ fontSize: "0.75rem", fontFamily: "monospace", background: "#fff", border: "1px solid #f0c080", borderRadius: "3px", padding: "0.3rem", maxHeight: "60px", overflowY: "auto", whiteSpace: "pre-wrap", marginBottom: "0.4rem" }}>
                        {loadedJson!.slice(0, 200)}{loadedJson!.length > 200 ? "…" : ""}
                    </div>
                    <button onClick={onClear} style={{ fontSize: "0.75rem", background: "none", border: "1px solid #999", borderRadius: "4px", padding: "0.15rem 0.5rem", cursor: "pointer" }}>🔄 Ricarica</button>
                </>
            ) : mode === "pdf" ? (
                <button onClick={handleUpload} disabled={analyzing}
                    style={{ width: "100%", padding: "0.4rem", background: analyzing ? "#aaa" : "#e65c00", color: "#fff", border: "none", borderRadius: "4px", cursor: analyzing ? "default" : "pointer", fontSize: "0.82rem" }}>
                    {analyzing ? "⏳ Analisi..." : "📤 Carica PDF"}
                </button>
            ) : (
                <>
                    <textarea value={jsonDraft} onInput={(e) => setJsonDraft((e.target as HTMLTextAreaElement).value)}
                        placeholder={'{\n  "Azienda": { "CodiceFiscale": "..." }\n}'}
                        rows={5}
                        style={{ width: "100%", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.4rem", borderRadius: "4px", border: "1px solid #ccc", boxSizing: "border-box", resize: "vertical" }} />
                    {jsonErr && <div style={{ color: "#c0392b", fontSize: "0.75rem", marginTop: "0.2rem" }}>{jsonErr}</div>}
                    <button onClick={handleJsonApply}
                        style={{ marginTop: "0.4rem", width: "100%", padding: "0.35rem", background: "#e65c00", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}>
                        ✔ Usa questo JSON
                    </button>
                </>
            )}
        </div>
    );
}

// ─── Global Test Panel ────────────────────────────────────────────────────────

interface GlobalTestPanelProps {
    rules: CrossRuleEntry[];
    docOptions: DocOption[];
    onClose: () => void;
}

function GlobalTestPanel({ rules, docOptions, onClose }: GlobalTestPanelProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loadedDocs, setLoadedDocs] = useState<Record<string, string>>({});
    const [result, setResult] = useState<CrossRuleValidationResult | null>(null);
    const [validating, setValidating] = useState(false);
    const [testErr, setTestErr] = useState<string | null>(null);

    const idA = selectedIds[0] ?? null;
    const idB = selectedIds[1] ?? null;

    const toggleDoc = (id: string) => {
        setSelectedIds((prev) => {
            if (prev.includes(id)) return prev.filter((a) => a !== id);
            if (prev.length < 2) return [...prev, id];
            return [prev[0], id]; // replace second
        });
        setLoadedDocs({});
        setResult(null);
    };

    // Rules that involve exactly the selected pair (both analyzer_ids present)
    const matchingRules = selectedIds.length === 2
        ? rules.filter((r) => {
            const aids = r.analyzer_ids;
            return aids.includes(selectedIds[0]) && aids.includes(selectedIds[1]);
        })
        : [];

    const allChecks = matchingRules.flatMap((r) => r.checks);
    const allLoaded = selectedIds.length === 2 && selectedIds.every((id) => !!loadedDocs[id]);

    const handleValidate = async () => {
        setValidating(true); setTestErr(null); setResult(null);
        try {
            const docs: Record<string, unknown> = {};
            for (const [id, s] of Object.entries(loadedDocs)) {
                try { docs[id] = JSON.parse(s); } catch { docs[id] = {}; }
            }
            setResult(await validateCrossChecks(allChecks, docs));
        } catch (err) { setTestErr(err instanceof Error ? err.message : "Errore"); }
        finally { setValidating(false); }
    };

    return (
        <div style={{ border: "2px solid #e65c00", borderRadius: "8px", padding: "1rem", background: "#fff8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#e65c00" }}>🧪 Test Cross-Documento</span>
                <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: "1.1rem" }}>✕</button>
            </div>

            {/* Document selector */}
            <div style={{ marginBottom: "0.85rem" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem", color: "#555" }}>
                    Seleziona 2 documenti da confrontare:
                    {selectedIds.length === 2 && (
                        <span style={{ marginLeft: "0.5rem", fontWeight: 400, color: "#e65c00" }}>
                            → {matchingRules.length} {matchingRules.length === 1 ? "regola applicabile" : "regole applicabili"}
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {docOptions.map((doc) => {
                        const pos = selectedIds.indexOf(doc.analyzer_id);
                        const checked = pos >= 0;
                        const badge = pos === 0 ? " [A]" : pos === 1 ? " [B]" : "";
                        return (
                            <label key={doc.analyzer_id} style={{
                                display: "flex", alignItems: "center", gap: "0.3rem",
                                padding: "0.3rem 0.7rem", borderRadius: "20px", cursor: "pointer",
                                border: `2px solid ${checked ? "#e65c00" : "#dee2e6"}`,
                                background: checked ? "#fff0e6" : "#fff",
                                color: checked ? "#e65c00" : "#555", fontWeight: checked ? 700 : 400, fontSize: "0.85rem", userSelect: "none",
                            }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleDoc(doc.analyzer_id)} style={{ display: "none" }} />
                                {checked ? "✔ " : ""}{doc.label}{badge}
                            </label>
                        );
                    })}
                </div>
                {selectedIds.length === 2 && matchingRules.length === 0 && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "4px", padding: "0.4rem 0.6rem" }}>
                        Nessuna regola cross-documento definita per questa coppia di documenti.
                    </div>
                )}
            </div>

            {/* Doc input cards */}
            {selectedIds.length === 2 && matchingRules.length > 0 && (
                <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
                        {selectedIds.map((aid) => (
                            <DocInputCard key={aid}
                                aid={aid}
                                docLabel={docOptions.find((d) => d.analyzer_id === aid)?.label ?? aid}
                                loadedJson={loadedDocs[aid] ?? null}
                                onLoaded={(json) => { setLoadedDocs((p) => ({ ...p, [aid]: json })); setResult(null); }}
                                onClear={() => { setLoadedDocs((p) => { const n = { ...p }; delete n[aid]; return n; }); setResult(null); }}
                            />
                        ))}
                    </div>

                    {testErr && <div style={{ background: "#f8d7da", border: "1px solid #f5c6cb", borderRadius: "4px", padding: "0.5rem 0.75rem", marginBottom: "0.5rem", color: "#721c24", fontSize: "0.85rem" }}>{testErr}</div>}

                    <button onClick={handleValidate} disabled={!allLoaded || validating}
                        title={!allLoaded ? "Carica entrambi i documenti prima di validare" : ""}
                        style={{ padding: "0.5rem 1.2rem", background: !allLoaded || validating ? "#6c757d" : "#e65c00", color: "#fff", border: "none", borderRadius: "4px", cursor: !allLoaded || validating ? "default" : "pointer", fontWeight: 700, fontSize: "0.9rem" }}>
                        {validating ? "⏳ Validazione..." : `✅ Applica ${allChecks.length} Regole Cross`}
                    </button>

                    {result && (
                        <div style={{ marginTop: "0.75rem" }}>
                            <div style={{ padding: "0.5rem 0.75rem", borderRadius: "5px", fontWeight: 700, textAlign: "center", marginBottom: "0.5rem",
                                background: result.is_valid ? "#d4edda" : "#f8d7da", border: `1px solid ${result.is_valid ? "#c3e6cb" : "#f5c6cb"}`, color: result.is_valid ? "#155724" : "#721c24", fontSize: "0.9rem" }}>
                                {result.is_valid ? `✅ Tutte le ${result.valid_rules.length} verifiche superate` : `❌ ${result.error_rules.length} errori — ${result.valid_rules.length} ok`}
                            </div>
                            {result.error_rules.map((r, i) => (
                                <div key={i} style={{ padding: "0.4rem 0.6rem", marginBottom: "0.3rem", borderRadius: "5px", background: "#fff5f5", border: "1px solid #f5c6cb", fontSize: "0.82rem" }}>
                                    <div style={{ fontWeight: 600, color: "#c0392b", marginBottom: "0.2rem" }}>⚠ {r.error || r.label}</div>
                                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                                        <span><b>A</b> <code style={{ fontSize: "0.78rem" }}>{r.field}</code> = <span style={{ background: "#fddede", padding: "0 4px", borderRadius: "3px" }}>{fmtVal(r.value_a)}</span></span>
                                        <span><b>B</b> <code style={{ fontSize: "0.78rem" }}>{r.compare_with}</code> = <span style={{ background: "#fddede", padding: "0 4px", borderRadius: "3px" }}>{fmtVal(r.value_b)}</span></span>
                                    </div>
                                </div>
                            ))}
                            {result.valid_rules.map((r, i) => (
                                <div key={i} style={{ padding: "0.4rem 0.6rem", marginBottom: "0.3rem", borderRadius: "5px", background: "#f0fff4", border: "1px solid #b7efc5", fontSize: "0.82rem" }}>
                                    <div style={{ fontWeight: 600, color: "#1a7a3c", marginBottom: "0.2rem" }}>✔ {r.label}</div>
                                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                                        <span><b>A</b> <code style={{ fontSize: "0.78rem" }}>{r.field}</code> = <span style={{ background: "#d4f5de", padding: "0 4px", borderRadius: "3px" }}>{fmtVal(r.value_a)}</span></span>
                                        <span><b>B</b> <code style={{ fontSize: "0.78rem" }}>{r.compare_with}</code> = <span style={{ background: "#d4f5de", padding: "0 4px", borderRadius: "3px" }}>{fmtVal(r.value_b)}</span></span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CrossRuleEditor() {
    const [rules, setRules] = useState<CrossRuleEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [editingIdx, setEditingIdx] = useState<EditingIdx>(null);
    const [showGlobalTest, setShowGlobalTest] = useState(false);
    const [docOptions, setDocOptions] = useState<DocOption[]>([]);
    const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

    useEffect(() => {
        if (!notification) return;
        const t = setTimeout(() => setNotification(null), 3000);
        return () => clearTimeout(t);
    }, [notification]);

    useEffect(() => {
        getAllDocumentTypes()
            .then((d) => setDocOptions(d.schemas.map((s) => ({ analyzer_id: s.analyzer_id, label: s.label || s.analyzer_id }))))
            .catch(() => setDocOptions([]));

        getCrossRules()
            .then((d) => setRules(d.rules))
            .catch((err) => setNotification({ type: "error", message: "Errore: " + (err?.message || err) }))
            .finally(() => setLoading(false));
    }, []);

    const handleApply = (rule: CrossRuleEntry) => {
        setRules((prev) => {
            if (editingIdx === "new") return [...prev, rule];
            const next = [...prev];
            next[editingIdx as number] = rule;
            return next;
        });
        setEditingIdx(null);
        setDirty(true);
    };

    const handleDelete = (idx: number) => {
        setRules((p) => p.filter((_, i) => i !== idx));
        if (editingIdx === idx) setEditingIdx(null);
        setDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveCrossRules(rules);
            setDirty(false);
            setNotification({ type: "success", message: "cross_rules.yaml salvato con successo." });
        } catch (err) {
            setNotification({ type: "error", message: "Errore salvataggio: " + (err instanceof Error ? err.message : err) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
            {notification && (
                <div style={{ padding: "0.6rem 1rem", borderRadius: "4px", display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: notification.type === "success" ? "#d4edda" : "#f8d7da",
                    color: notification.type === "success" ? "#155724" : "#721c24",
                    border: `1px solid ${notification.type === "success" ? "#c3e6cb" : "#f5c6cb"}` }}>
                    <span>{notification.message}</span>
                    <button onClick={() => setNotification(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "inherit" }}>✕</button>
                </div>
            )}

            {/* Header bar */}
            <div style={{ background: "#6f42c1", borderRadius: "8px", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>
                    Regole di Validazione Cross-Documento
                    {dirty && <span style={{ marginLeft: "0.6rem", fontSize: "0.75rem", background: "#ffc107", color: "#333", borderRadius: "10px", padding: "0.1rem 0.5rem" }}>modificato</span>}
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={handleSave} disabled={saving || !dirty}
                        style={{ padding: "0.35rem 1rem", background: saving || !dirty ? "rgba(255,255,255,0.4)" : "#fff", color: saving || !dirty ? "#ddd" : "#6f42c1", border: "none", borderRadius: "4px", cursor: saving || !dirty ? "default" : "pointer", fontWeight: 700, fontSize: "0.88rem" }}>
                        {saving ? "Salvataggio..." : "💾 Salva YAML"}
                    </button>
                    <button
                        onClick={() => { setShowGlobalTest((v) => !v); setEditingIdx(null); }}
                        style={{ padding: "0.35rem 1rem", background: showGlobalTest ? "#e65c00" : "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.5)", borderRadius: "4px", cursor: "pointer", fontSize: "0.88rem" }}>
                        🧪 Test
                    </button>
                    <button onClick={() => { setEditingIdx("new"); setShowGlobalTest(false); }}
                        disabled={editingIdx !== null}
                        style={{ padding: "0.35rem 1rem", background: editingIdx !== null ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.5)", borderRadius: "4px", cursor: editingIdx !== null ? "default" : "pointer", fontSize: "0.88rem" }}>
                        ➕ Nuova Regola
                    </button>
                </div>
            </div>

            {/* Global test panel */}
            {showGlobalTest && (
                <GlobalTestPanel rules={rules} docOptions={docOptions} onClose={() => setShowGlobalTest(false)} />
            )}

            {loading && <div style={{ padding: "2rem", textAlign: "center", color: "#888" }}>Caricamento...</div>}

            {/* Rule list */}
            {!loading && rules.map((rule, idx) => (
                <div key={idx} style={{ border: "1px solid #d0b8f0", borderRadius: "8px", overflow: "hidden" }}>
                    {/* Rule header row */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.7rem 1rem", background: "#faf5ff", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, color: "#6f42c1", minWidth: "2rem" }}>#{idx + 1}</span>
                        <span style={{ fontWeight: 600, flex: 1 }}>{rule.label_name}</span>
                        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                            {rule.analyzer_ids.map((a) => {
                                const docLabel = docOptions.find((d) => d.analyzer_id === a)?.label ?? a;
                                return <span key={a} style={{ background: "#ede0ff", color: "#6f42c1", border: "1px solid #d0b8f0", borderRadius: "12px", padding: "0.1rem 0.55rem", fontSize: "0.78rem" }}>{docLabel}</span>;
                            })}
                        </div>
                        <span style={{ fontSize: "0.78rem", color: "#888" }}>{rule.checks.length} {rule.checks.length === 1 ? "regola" : "regole"}</span>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                            <button onClick={() => { setEditingIdx(editingIdx === idx ? null : idx); }}
                                style={{ padding: "0.2rem 0.5rem", background: editingIdx === idx ? "#6f42c1" : "#fff", color: editingIdx === idx ? "#fff" : "#6f42c1", border: "1px solid #6f42c1", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}>
                                ✏️ Edit
                            </button>
                            <button onClick={() => handleDelete(idx)}
                                style={{ padding: "0.2rem 0.5rem", background: "#fff", color: "#dc3545", border: "1px solid #dc3545", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}>
                                🗑️ Del
                            </button>
                        </div>
                    </div>

                    {/* Checks summary */}
                    {editingIdx !== idx && (
                        <div style={{ padding: "0.5rem 1rem 0.6rem", background: "#fff" }}>
                            {rule.checks.map((c, ci) => (
                                <div key={ci} style={{ fontSize: "0.8rem", color: "#555", marginBottom: "0.2rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                                    <code style={{ background: "#f3eeff", padding: "0 4px", borderRadius: "3px" }}>{c.field}</code>
                                    <span style={{ color: "#6f42c1", fontWeight: 700 }}>==</span>
                                    <code style={{ background: "#f3eeff", padding: "0 4px", borderRadius: "3px" }}>{c.compare_with}</code>
                                    {c.message && <span style={{ color: "#888", fontStyle: "italic" }}>({c.message})</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Inline edit form */}
                    {editingIdx === idx && (
                        <div style={{ padding: "0 0.75rem 0.75rem" }}>
                            <RuleEditForm initial={rule} docOptions={docOptions}
                                onCancel={() => setEditingIdx(null)}
                                onApply={(r) => handleApply(r)} />
                        </div>
                    )}
                </div>
            ))}

            {/* Empty state */}
            {!loading && rules.length === 0 && editingIdx !== "new" && (
                <div style={{ padding: "2rem", textAlign: "center", color: "#888", fontStyle: "italic", border: "1px dashed #ccc", borderRadius: "8px" }}>
                    Nessuna regola cross-documento. Clicca "➕ Nuova Regola" per iniziare.
                </div>
            )}

            {/* New rule form */}
            {editingIdx === "new" && (
                <div style={{ border: "1px solid #d0b8f0", borderRadius: "8px", padding: "0.75rem" }}>
                    <div style={{ fontWeight: 700, color: "#6f42c1", marginBottom: "0.5rem", fontSize: "0.95rem" }}>➕ Nuova Regola</div>
                    <RuleEditForm initial={null} docOptions={docOptions}
                        onCancel={() => setEditingIdx(null)}
                        onApply={(r) => handleApply(r)} />
                </div>
            )}
        </div>
    );
}
