import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const SYSTEM_PROMPT =
  "You are a professional contractor assistant. " +
  "Output only the description text — no labels, bullet points, or markdown. " +
  "Be concise (2-4 sentences) and use formal, clear language.";

export async function POST(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const input = String(body.input || "").trim();

    if (!input) {
      return new Response(
        JSON.stringify({ success: false, error: "Input is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "OpenAI API key is not configured",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const openAiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Rewrite this into a professional contractor estimate description: ${input}`,
            },
          ],
          max_tokens: 200,
          temperature: 0.6,
        }),
      },
    );

    if (!openAiRes.ok) {
      const errBody = await openAiRes.json().catch(() => ({}));
      const message =
        errBody?.error?.message || `OpenAI error ${openAiRes.status}`;
      return new Response(JSON.stringify({ success: false, error: message }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const json = await openAiRes.json();
    const description = json.choices?.[0]?.message?.content?.trim() || "";

    if (!description) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No description returned from AI",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: { description } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/ai/description][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
