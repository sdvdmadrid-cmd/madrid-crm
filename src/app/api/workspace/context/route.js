import { buildWorkspaceContext } from "@/lib/platform-tenant";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(request) {
  const context = await getAuthenticatedTenantContext(request);
  if (!context.authenticated) {
    return unauthenticatedResponse();
  }

  const workspace = await buildWorkspaceContext(context);

  return new Response(
    JSON.stringify({
      success: true,
      data: workspace,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
