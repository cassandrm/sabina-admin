import { Head } from "$fresh/runtime.ts";
import AuthGuard from "../islands/AuthGuard.tsx";
import CrossRuleEditor from "../islands/CrossRuleEditor.tsx";
import LogoutButton from "../islands/LogoutButton.tsx";

export default function CrossRulesPage() {
    return (
        <>
            <Head>
                <title>Admin - Regole Cross-Documento</title>
            </Head>
            <AuthGuard>
                <div class="admin-container">
                    <header class="admin-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <a
                                href="/"
                                style={{ color: "#6f42c1", textDecoration: "none", fontWeight: 600, fontSize: "0.9rem" }}
                            >
                                ← Document Types
                            </a>
                            <h1 style={{ margin: 0 }}>Regole di Validazione Cross-Documento</h1>
                        </div>
                        <LogoutButton />
                    </header>
                    <main class="admin-content">
                        <CrossRuleEditor />
                    </main>
                </div>
            </AuthGuard>
        </>
    );
}
