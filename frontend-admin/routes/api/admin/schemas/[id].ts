import { Handlers } from "$fresh/server.ts";

const BACKEND_URL = Deno.env.get("BACKEND_URL") || "http://localhost:8002";

export const handler: Handlers = {
    async GET(req, ctx) {
        const { id } = ctx.params;
        const auth = req.headers.get("Authorization") || "";

        const response = await fetch(`${BACKEND_URL}/admin/schemas/${id}`, {
            headers: {
                "Authorization": auth,
            },
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },

    async PUT(req, ctx) {
        const { id } = ctx.params;
        const auth = req.headers.get("Authorization") || "";
        const body = await req.json();

        const response = await fetch(`${BACKEND_URL}/admin/schemas/${id}`, {
            method: "PUT",
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

    async DELETE(req, ctx) {
        const { id } = ctx.params;
        const auth = req.headers.get("Authorization") || "";

        const response = await fetch(`${BACKEND_URL}/admin/schemas/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": auth,
            },
        });

        if (response.status === 204 || response.ok) {
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "Content-Type": "application/json" },
        });
    },
};
