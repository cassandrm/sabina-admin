/**
 * API client for Backend Admin
 */
import { API_CONFIG } from "./config.ts";

// ============ Auth Helpers ============

export function getAuthToken(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem("authToken");
}

export function getAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        ...API_CONFIG.headers,
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

export async function fetchWithAuth(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {}),
    };
    const response = await fetch(url, { ...options, headers });

    // Se riceviamo 401, la sessione è scaduta -> logout automatico
    if (response.status === 401) {
        console.warn("Session expired (401), redirecting to login...");
        if (typeof localStorage !== "undefined") {
            localStorage.removeItem("authToken");
            localStorage.removeItem("username");
        }
        if (typeof window !== "undefined") {
            window.location.href = "/login";
        }
        throw new Error("Session expired");
    }

    return response;
}

// ============ Document Types API ============

export interface DocumentType {
    id?: number;
    _id?: string;
    name?: string;
    label?: string;
    patterns?: string;
    analyzer_id: string;
    is_man_interesse?: boolean;
    validation_rules?: Record<string, unknown>;
}

export interface DocumentTypeListResponse {
    schemas: DocumentType[];
    total: number;
}

export async function getAllDocumentTypes(): Promise<DocumentTypeListResponse> {
    const response = await fetchWithAuth("/api/admin/schemas", {
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        let detail = "Failed to fetch document types";
        try {
            const errData = await response.json();
            if (errData && errData.detail) detail = errData.detail;
        } catch { }
        throw new Error(detail);
    }
    return response.json();
}

export async function getDocumentType(
    documentTypeId: number
): Promise<DocumentType> {
    const response = await fetchWithAuth(`/api/admin/schemas/${documentTypeId}`, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        throw new Error("Failed to fetch document type");
    }
    return response.json();
}

export async function updateDocumentType(
    documentTypeId: number,
    updates: Partial<Omit<DocumentType, "id">>
): Promise<DocumentType> {
    const response = await fetchWithAuth(`/api/admin/schemas/${documentTypeId}`, {
        method: "PUT",
        headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
    });
    if (!response.ok) {
        throw new Error("Failed to update document type");
    }
    return response.json();
}

export async function deleteDocumentType(
    documentTypeId: number
): Promise<void> {
    const response = await fetchWithAuth(`/api/admin/schemas/${documentTypeId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        throw new Error("Failed to delete document type");
    }
}

export async function createDocumentType(
    newType: Omit<DocumentType, "id">
): Promise<DocumentType> {
    const response = await fetchWithAuth("/api/admin/schemas", {
        method: "POST",
        headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(newType),
    });
    if (!response.ok) {
        let detail = "Failed to create document type";
        try {
            const errData = await response.json();
            if (errData && errData.detail) detail = errData.detail;
        } catch { }
        throw new Error(detail);
    }
    return response.json();
}

// ============ Analyzers API ============

export interface Analyzer {
    analyzer_id: string;
    description?: string;
}

export async function getAnalyzers(): Promise<Analyzer[]> {
    const response = await fetchWithAuth("/api/analyzers", {
        headers: getAuthHeaders(),
    });
    if (!response.ok) {
        return [];
    }
    const data = await response.json();
    return data.analyzers || [];
}
