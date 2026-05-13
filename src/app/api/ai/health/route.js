import { getAuthenticatedTenantContext } from "@/lib/tenant";
import { checkOpenAiHealth } from "@/lib/ai-service";
import { buildAiErrorPayload, normalizeAiErrorCode } from "@/lib/ai-errors";

export async function GET(request) {
  try {
    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated || access.role !== "super_admin") {
      return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const health = await checkOpenAiHealth();
    return Response.json({
      success: true,
      data: {
        ok: health.ok,
        model: health.model,
        responseTimeMs: health.responseTimeMs,
        usage: health.usage,
      },
    });
  } catch (error) {
    const code = normalizeAiErrorCode(error?.code, error?.status, error?.message);
    return Response.json(
      buildAiErrorPayload({
        code,
        language: "en",
        status: Number(error?.status || 502),
        technicalMessage: error?.message || "OpenAI health check failed",
      }),
      { status: Number(error?.status || 502) },
    );
  }
}
