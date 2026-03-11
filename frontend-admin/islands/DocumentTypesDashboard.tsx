import { useEffect, useState } from "preact/hooks";
import SchemaEditor from "./SchemaEditor.tsx";
import { JSX } from "preact/jsx-runtime";
import {
    getAllDocumentTypes,
    deleteDocumentType,
    createDocumentType,
    DocumentType,
    getAnalyzers,
} from "../utils/api.ts";
import { getAuthHeaders } from "../utils/api.ts";

export default function DocumentTypesDashboard() {
    const [selectedSchema, setSelectedSchema] = useState<DocumentType | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DocumentType | null>(null);
    const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
    const [newData, setNewData] = useState<DocumentType>({
        name: "",
        patterns: "",
        analyzer_id: "",
    });
    const [editing, setEditing] = useState(false);

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
    const [editingSchema, setEditingSchema] = useState<DocumentType | null>(null);
    const [analyzerList, setAnalyzerList] = useState<Array<{ analyzer_id: string; description?: string }>>([]);

    useEffect(() => {
        // Fetch analyzer list for dropdown
        getAnalyzers()
            .then(data => setAnalyzerList(data))
            .catch(() => setAnalyzerList([]));
    }, []);

    useEffect(() => {
        getAllDocumentTypes()
            .then((data) => {
                setDocumentTypes(data.schemas);
            })
            .catch((err) => {
                console.error("Error loading document types:", err);
            });
    }, []);

    const handleNewChange = (field: string, value: string) => {
        setNewData((prev: Record<string, string>) => ({ ...prev, [field]: value }));
    };

    const handleNewSave = async () => {
        setModal({ message: "Generazione regole di validazione e salvataggio in corso...", spinner: true });
        try {
            const created = await createDocumentType(newData);
            setModal({ message: "Salvataggio completato!", onClose: () => setModal(null) });
            getAllDocumentTypes().then((data) => setDocumentTypes(data.schemas));
            setNewData({
                name: "",
                patterns: "",
                analyzer_id: "",
            });
            setEditing(false);
        } catch (err) {
            setModal({ message: "Errore durante la creazione del documento: " + (err instanceof Error ? err.message : err), onClose: () => setModal(null) });
        }
    };

    return (
        <div className="document-types-dashboard" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', background: '#f7f7f7', minHeight: '100vh', height: 'auto', margin: 0, padding: '1rem', boxSizing: 'border-box', overflowX: 'hidden' }}>
            {modal && <Modal message={modal.message} spinner={modal.spinner} onClose={modal.onClose} />}


            {editingSchema ? (
                <SchemaEditor
                    schema={editingSchema}
                    onClose={() => {
                        setEditingSchema(null);
                        getAllDocumentTypes().then((data) => setDocumentTypes(data.schemas));
                    }}
                    onUpdated={() => {
                        setEditingSchema(null);
                        getAllDocumentTypes().then((data) => setDocumentTypes(data.schemas));
                    }}
                />
            ) : (
                <div style={{ border: '2px solid #007bff', borderRadius: '8px', padding: 0, backgroundColor: '#f8f9fa', margin: 0, maxWidth: '1700px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', overflowX: 'auto' }}>
                    <table style={{ width: '100%', maxWidth: '1700px', margin: 0, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#e9ecef' }}>
                                <th style={{ textAlign: 'center', padding: '0.75rem' }}>Nome</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem' }}>Analyzer ID</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem' }}>Patterns</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem' }}>Validazione</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documentTypes.map((docType: DocumentType) => (
                                <tr key={docType._id || docType.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                                    <td style={{ padding: '0.75rem' }}>{docType.name}</td>
                                    <td style={{ padding: '0.75rem' }}>{docType.analyzer_id}</td>
                                    <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                                        {docType.patterns && docType.patterns.trim() !== '' ? (
                                            <span style={{ color: '#1976d2', fontWeight: 600 }} title={docType.patterns}>✔️</span>
                                        ) : (
                                            <span style={{ color: '#aaa' }} title="Nessun pattern">—</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                                        {docType.validation_rules && Object.keys(docType.validation_rules).length > 0 ? (
                                            <span style={{ color: '#1976d2', fontWeight: 600 }} title="Validazione presente">✔️</span>
                                        ) : (
                                            <span style={{ color: '#aaa' }} title="Nessuna validazione">—</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                                        <button
                                            onClick={() => setEditingSchema(docType)}
                                            style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            ✏️ Edit
                                        </button>
                                        <button
                                            onClick={() => {
                                                setDeleteTarget(docType);
                                                setShowDeleteConfirm(true);
                                            }}
                                            style={{ padding: '0.25rem 0.5rem', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            🗑️ Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            <tr>
                                <td style={{ padding: '0.75rem' }}>
                                    <input
                                        value={newData.name || ""}
                                        onInput={(e: JSX.TargetedEvent<HTMLInputElement, Event>) => handleNewChange("name", e.currentTarget.value)}
                                        placeholder="Nome"
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ced4da' }}
                                    />
                                </td>
                                <td style={{ padding: '0.75rem' }}>
                                    <select
                                        value={newData.analyzer_id || ""}
                                        onChange={(e: JSX.TargetedEvent<HTMLSelectElement, Event>) => handleNewChange("analyzer_id", e.currentTarget.value)}
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem' }}
                                    >
                                        <option value="">Seleziona Analyzer</option>
                                        {analyzerList.map(analyzer => (
                                            <option key={analyzer.analyzer_id} value={analyzer.analyzer_id}>
                                                {analyzer.analyzer_id}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td style={{ padding: '0.75rem' }}>
                                    <input
                                        value={newData.patterns || ""}
                                        onInput={(e: JSX.TargetedEvent<HTMLInputElement, Event>) => handleNewChange("patterns", e.currentTarget.value)}
                                        placeholder="Patterns"
                                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ced4da' }}
                                    />
                                </td>
                                <td style={{ textAlign: 'center', padding: '0.75rem' }}></td>
                                <td style={{ padding: '0.75rem' }}>
                                    <button
                                        onClick={handleNewSave}
                                        style={{ padding: '0.5rem 1rem', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        ➕ Aggiungi
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {showDeleteConfirm && deleteTarget && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', padding: '2rem', minWidth: '320px', maxWidth: '90vw', textAlign: 'center' }}>
                        <h3>Conferma cancellazione</h3>
                        <p>Vuoi davvero cancellare il documento <b>{deleteTarget.name}</b>?</p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                            <button
                                style={{ padding: '0.75rem 1.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}
                                onClick={async () => {
                                    setShowDeleteConfirm(false);
                                    setDeleteTarget(null);
                                    const docId = typeof deleteTarget.id === 'number' ? deleteTarget.id : undefined;
                                    if (docId === undefined) {
                                        alert('Impossibile cancellare: id non trovato');
                                        return;
                                    }
                                    await deleteDocumentType(docId);
                                    getAllDocumentTypes().then((data) => setDocumentTypes(data.schemas));
                                }}
                            >
                                Elimina
                            </button>
                            <button
                                style={{ padding: '0.75rem 1.5rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontSize: '1rem', cursor: 'pointer' }}
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    setDeleteTarget(null);
                                }}
                            >
                                Annulla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
