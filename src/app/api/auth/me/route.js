import { getTenantContext } from "@/lib/tenant";

export async function GET(request) {
  try {
    const session = getTenantContext(request);

    if (!session?.authenticated) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          userId: session.userId,
          tenantId: session.tenantId,
          tenantDbId: session.tenantDbId,
          email: session.email,
          name: session.name,
          role: session.role,
          capabilities: session.capabilities,
          businessType: session.businessType || session.industry || "",
          industry: session.businessType || session.industry || "",
          isSubscribed: session.isSubscribed === true,
          trialEndDate: session.trialEndDate || null,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/auth/me] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unable to load session",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
