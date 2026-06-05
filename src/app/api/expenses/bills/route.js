import {
  createExpenseBill,
  expenseBillsToCsv,
  listExpenseBills,
} from "@/lib/bills-expenses-service";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request) {
  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { searchParams } = new URL(request.url);
    const format = String(searchParams.get("format") || "").toLowerCase();

    const bills = await listExpenseBills({
      tenantDbId,
      role,
      status: searchParams.get("status") || undefined,
      vendorId: searchParams.get("vendorId") || undefined,
      jobId: searchParams.get("jobId") || undefined,
    });

    if (format === "csv") {
      const csv = expenseBillsToCsv(bills);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="bills-expenses.csv"',
        },
      });
    }

    return json({ success: true, data: bills });
  } catch (error) {
    console.error("[api/expenses/bills][GET]", error);
    return json({ success: false, error: error.message }, 500);
  }
}

export async function POST(request) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = await request.json();
    const bill = await createExpenseBill({ tenantDbId, role, userId, body });
    return json({ success: true, data: bill }, 201);
  } catch (error) {
    console.error("[api/expenses/bills][POST]", error);
    return json({ success: false, error: error.message }, 500);
  }
}
