import { Head } from "$fresh/runtime.ts";
import AuthGuard from "../islands/AuthGuard.tsx";
import DocumentTypesDashboard from "../islands/DocumentTypesDashboard.tsx";

export default function AdminPage() {
    return (
        <>
            <Head>
                <title>Admin - Document Types Management</title>
            </Head>
            <AuthGuard>
                <div class="admin-container">
                    <header class="admin-header">
                        <h1>Document Types Management</h1>
                    </header>
                    <main class="admin-content">
                        <DocumentTypesDashboard />
                    </main>
                </div>
            </AuthGuard>
        </>
    );
}
