import { Handlers } from "$fresh/server.ts";

const BACKEND_URL = Deno.env.get("BACKEND_URL") || "http://localhost:8002";

export const handler: Handlers = {
    async POST(req, ctx) {
        const { id } = ctx.params;
        const auth = req.headers.get("Authorization") || "";
        const body = await req.json();

        const response = await fetch(`${BACKEND_URL}/admin/schemas/${id}/improve-rules`, {
            method: "POST",
            headers: {
                "Authorization": auth,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },
};
