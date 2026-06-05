import {
  createJobExpense,
  deleteJobExpense,
  extractAmountFromReceiptText,
  listJobExpenses,
} from "@/lib/job-expense-service.js";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { authenticated, tenantDbId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    const { id: jobId } = await params;
    const expenses = await listJobExpenses(tenantDbId, jobId);
    return Response.json({ success: true, data: expenses });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role, userId } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id: jobId } = await params;
    const body = await request.json();

    if (body.ocrText && !body.amount) {
      const extracted = extractAmountFromReceiptText(body.ocrText);
      if (extracted) {
        body.amount = extracted;
        body.ocrData = { extractedAmount: extracted, source: "text_parse" };
      }
    }

    const expense = await createJobExpense(tenantDbId, userId, jobId, body);
    return Response.json({ success: true, data: expense });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const csrf = applyMutationCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { authenticated, tenantDbId, role } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const url = new URL(request.url);
    const expenseId = url.searchParams.get("expenseId");
    if (!expenseId) {
      return Response.json({ success: false, error: "expenseId required" }, { status: 400 });
    }

    await deleteJobExpense(tenantDbId, expenseId);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
