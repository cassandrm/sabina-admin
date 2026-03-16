import { Handlers } from "$fresh/server.ts";

// Legacy per-rule endpoints removed – all CRUD is now via /api/admin/cross-rules (GET/PUT)
export const handler: Handlers = {
    GET: () => new Response(JSON.stringify({ detail: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }),
    PUT: () => new Response(JSON.stringify({ detail: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }),
    DELETE: () => new Response(JSON.stringify({ detail: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }),
};

