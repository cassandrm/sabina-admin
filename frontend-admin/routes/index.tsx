import { Head } from "$fresh/runtime.ts";
import AuthGuard from "../islands/AuthGuard.tsx";
import DocumentTypesDashboard from "../islands/DocumentTypesDashboard.tsx";
import LogoutButton from "../islands/LogoutButton.tsx";

export default function AdminPage() {
    return (
        <>
            <Head>
                <title>Admin - Document Types Management</title>
            </Head>
            <AuthGuard>
                <div class="admin-container">
                    <header class="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1>Document Types Management</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <a
                                href="/cross-rules"
                                style={{
                                    padding: '0.5rem 1.1rem',
                                    background: '#6f42c1',
                                    color: '#fff',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                }}
                            >
                                🔗 Regole Cross-Documento
                            </a>
                            <LogoutButton />
                        </div>
                    </header>
                    <main class="admin-content">
                        <DocumentTypesDashboard />
                    </main>
                </div>
            </AuthGuard>
        </>
    );
}
