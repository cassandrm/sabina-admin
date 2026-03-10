// Helper for accessing Deno in a browser-safe way
const getDenoEnv = (key: string, defaultValue: string): string => {
    try {
        if (typeof globalThis !== "undefined" && (globalThis as any).Deno?.env) {
            return (globalThis as any).Deno.env.get(key) || defaultValue;
        }
    } catch {
        // Ignore errors if Deno is not available
    }
    return defaultValue;
};

export const API_CONFIG = {
    BACKEND_URL: getDenoEnv("BACKEND_URL", "http://localhost:8002"),
    VERSION: getDenoEnv("VERSION", "dev"),
    API_KEY: "development-test-key",
    headers: {
        "X-API-Key": "development-test-key",
        "Content-Type": "application/json",
    }
};
