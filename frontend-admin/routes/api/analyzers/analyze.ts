import { Handlers } from "$fresh/server.ts";

const BACKEND_URL = Deno.env.get("BACKEND_URL") || "http://localhost:8002";

export const handler: Handlers = {
    async POST(req) {
        const auth = req.headers.get("Authorization") || "";

        // Forward the multipart form data as-is to the backend
        const formData = await req.formData();
        const backendFormData = new FormData();

        for (const [key, value] of formData.entries()) {
            backendFormData.append(key, value);
        }

        const response = await fetch(`${BACKEND_URL}/api/analyzers/analyze`, {
            method: "POST",
            headers: {
                "Authorization": auth,
            },
            body: backendFormData,
        });

        const data = await response.text();

        return new Response(data, {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },
};
