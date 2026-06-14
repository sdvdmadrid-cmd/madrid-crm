import {
  approveTimeEntry,
  clockIn,
  clockOut,
  createManualTimeEntry,
  listTimeEntries,
} from "@/lib/payroll-time-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId") || undefined;
    const jobId = url.searchParams.get("jobId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = Number(url.searchParams.get("limit") || 100);
    const offset = Number(url.searchParams.get("offset") || 0);

    const result = await listTimeEntries({
      tenantDbId,
      employeeId,
      jobId,
      status,
      limit,
      offset,
    });

    return json({ success: true, data: result });
  } catch (error) {
    console.error("[api/payroll/time-entries][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId, role, userId  } = context;
        if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const action = String(body.action || "manual").toLowerCase();

    if (action === "clock_in") {
      const entry = await clockIn({
        tenantDbId,
        employeeId: body.employeeId,
        jobId: body.jobId,
        hourlyRate: body.hourlyRate,
        userId,
        metadata: body.metadata || {},
      });
      return json({ success: true, data: entry });
    }

    if (action === "clock_out") {
      const entry = await clockOut({
        tenantDbId,
        employeeId: body.employeeId,
        notes: body.notes || "",
      });
      return json({ success: true, data: entry });
    }

    if (action === "approve") {
      const entry = await approveTimeEntry({
        tenantDbId,
        entryId: body.entryId,
      });
      return json({ success: true, data: entry });
    }

    const entry = await createManualTimeEntry({
      tenantDbId,
      employeeId: body.employeeId,
      jobId: body.jobId,
      entryType: body.entryType || "regular",
      hours: body.hours,
      hourlyRate: body.hourlyRate,
      notes: body.notes || "",
      userId,
    });
    return json({ success: true, data: entry });
  } catch (error) {
    console.error("[api/payroll/time-entries][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
