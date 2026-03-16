import { Handlers } from "$fresh/server.ts";

const BACKEND_URL = Deno.env.get("BACKEND_URL") || "http://localhost:8002";

export const handler: Handlers = {
    async GET(req) {
        const auth = req.headers.get("Authorization") || "";
        const response = await fetch(`${BACKEND_URL}/admin/cross-rules`, {
            headers: { "Authorization": auth },
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },

    async PUT(req) {
        const auth = req.headers.get("Authorization") || "";
        const body = await req.text();
        const response = await fetch(`${BACKEND_URL}/admin/cross-rules`, {
            method: "PUT",
            headers: { "Authorization": auth, "Content-Type": "application/json" },
            body,
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },
};
