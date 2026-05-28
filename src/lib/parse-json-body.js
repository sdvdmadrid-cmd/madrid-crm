/**
 * Safe JSON-body parser for App Router POST/PATCH/PUT/DELETE handlers.
 *
 * The default `await request.json()` throws on malformed JSON and
 * happily returns `null` for a literal `null` body. Both shapes
 * previously made it past the parse boundary and into the route's
 * business logic, where `null.someField` blew up with an opaque
 * 500. This helper coerces both edge cases into a clean 400 with
 * a stable error shape.
 *
 * Usage:
 *
 *   import { parseJsonBody } from "@/lib/parse-json-body";
 *
 *   export async function POST(request) {
 *     const parsed = await parseJsonBody(request);
 *     if (!parsed.ok) return parsed.response;
 *     const body = parsed.body;
 *     ...
 *   }
 *
 * Returns:
 *   { ok: true, body: <plain object> }
 *   { ok: false, response: Response (400) }
 *
 * Non-object bodies (arrays, strings, numbers, booleans, null) are
 * rejected because every estimate / invoice / estimate-builder
 * route works against a flat key-value object. If a future route
 * legitimately wants to accept an array body, it should bypass
 * this helper.
 */
export async function parseJsonBody(request) {
  let parsed;
  try {
    parsed = await request.json();
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          success: false,
          error: "Request body must be a JSON object",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  return { ok: true, body: parsed };
}
