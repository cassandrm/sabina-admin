import { Handlers } from "$fresh/server.ts";

// Legacy per-rule validate endpoint removed – use POST /api/admin/cross-rules/validate instead
export const handler: Handlers = {
    POST: () => new Response(JSON.stringify({ detail: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }),
};
