import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CAMPAIGNS = "email_campaigns";
const LOGS = "email_logs";

const serialize = (doc) => ({
  ...doc,
  _id: doc.id,
  campaignId: doc.campaign_id || undefined,
  createdAt: doc.created_at || null,
  completedAt: doc.completed_at || null,
});

export async function GET(request, { params }) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid campaign id" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const url = new URL(request.url);
    const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") || 100), 1),
      500,
    );

    let campaignQuery = supabaseAdmin.from(CAMPAIGNS).select("*").eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      campaignQuery = campaignQuery.eq("tenant_id", tenantDbId);
    }

    const { data: campaign, error: campaignError } =
      await campaignQuery.maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) {
      return new Response(
        JSON.stringify({ success: false, error: "Campaign not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let logsQuery = supabaseAdmin
      .from(LOGS)
      .select("*", { count: "exact" })
      .eq("campaign_id", id)
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      logsQuery = logsQuery.eq("tenant_id", tenantDbId);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    logsQuery = logsQuery.range(from, to);

    const { data: logs, count, error: logsError } = await logsQuery;
    if (logsError) throw new Error(logsError.message);

    const totalLogs = Number(count || 0);

    return new Response(
      JSON.stringify({
        success: true,
        campaign: serialize(campaign),
        logs: (logs || []).map(serialize),
        pagination: {
          page,
          limit,
          total: totalLogs,
          pages: Math.max(Math.ceil(totalLogs / limit), 1),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/email/campaigns/:id][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
