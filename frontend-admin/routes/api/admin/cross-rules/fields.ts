import { Handlers } from "$fresh/server.ts";

const BACKEND_URL = Deno.env.get("BACKEND_URL") || "http://localhost:8002";

export const handler: Handlers = {
    async GET(req) {
        const auth = req.headers.get("Authorization") || "";
        const url = new URL(req.url);
        const analyzerIds = url.searchParams.get("analyzer_ids") || "";

        const backendUrl = `${BACKEND_URL}/admin/cross-rules/fields?analyzer_ids=${encodeURIComponent(analyzerIds)}`;
        const response = await fetch(backendUrl, {
            headers: { "Authorization": auth },
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },
};
