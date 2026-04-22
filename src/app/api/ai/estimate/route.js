import { generateEstimateSuggestion } from "@/lib/estimate-ai";
import {
  canWrite,
  forbiddenResponse,
  getTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export async function POST(request) {
  try {
    const { role, authenticated } = getTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const service = String(body.service || "").trim();
    const title = String(body.title || "").trim();

    if (!service && !title) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Service or title is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const estimate = generateEstimateSuggestion(body);

    return new Response(JSON.stringify({ success: true, data: estimate }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/ai/estimate][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
