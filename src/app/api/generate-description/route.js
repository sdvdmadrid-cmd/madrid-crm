import OpenAI from "openai";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

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

    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Rewrite this into a professional contractor estimate description: ${input}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.6,
    });

    const description = response.choices[0]?.message?.content?.trim() || "";

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
    console.error("[api/generate-description][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
