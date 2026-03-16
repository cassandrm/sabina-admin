import { Handlers } from "$fresh/server.ts";

const BACKEND_URL = Deno.env.get("BACKEND_URL") || "http://localhost:8002";

export const handler: Handlers = {
    async POST(req) {
        const auth = req.headers.get("Authorization") || "";
        const body = await req.text();
        const response = await fetch(`${BACKEND_URL}/admin/cross-rules/validate`, {
            method: "POST",
            headers: { "Authorization": auth, "Content-Type": "application/json" },
            body,
        });
        const data = await response.text();
        return new Response(data, {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },
};
