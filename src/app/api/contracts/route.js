import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CONTRACTS = "contracts";
const INVOICES = "invoices";
const JOBS = "jobs";
const CLIENTS = "clients";

const serialize = (doc) => ({
  _id: doc.id,
  id: doc.id,
  clientId: doc.client_id || "",
  clientName: doc.client_name || "",
  jobId: doc.job_id || "",
  jobTitle: doc.job_title || "",
  invoiceId: doc.invoice_id || "",
  invoiceNumber: doc.invoice_number || "",
  amount: doc.amount || "",
  status: doc.status || "Draft",
  contractLanguage: doc.contract_language || "en",
  contractCategory: doc.contract_category || "",
  contractOption: doc.contract_option || "",
  body: doc.body || "",
  createdAt: doc.created_at || null,
  updatedAt: doc.updated_at || null,
});

function toId(value) {
  const id = String(value || "").trim();
  return id || null;
}

function formatDate(value) {
  if (!value) return "Sin fecha definida";
  return String(value);
}

function buildContractBody({ clientName, job, invoice }) {
  return [
    "CONTRATO DE SERVICIO",
    "",
    `Cliente: ${clientName || "No definido"}`,
    `Trabajo: ${job?.title || "No definido"}`,
    `Servicio: ${job?.service || "No definido"}`,
    `Factura asociada: ${invoice?.invoice_number || invoice?.invoiceNumber || "Pendiente"}`,
    `Monto acordado: $${invoice?.amount || (invoice?.total_cents ? Number(invoice.total_cents) / 100 : "") || job?.price || "0"}`,
    `Fecha objetivo: ${formatDate(invoice?.due_date || invoice?.dueDate || job?.due_date || job?.dueDate)}`,
    "",
    "Alcance del servicio:",
    job?.scope_details ||
      job?.scopeDetails ||
      "Se realizara el trabajo descrito en la orden asociada.",
    "",
    "Condiciones:",
    "1. El contratista ejecutara el trabajo segun el alcance acordado.",
    "2. El cliente aceptara el trabajo una vez revisado y aprobado.",
    "3. El pago se regira por la factura vinculada a este contrato.",
    "4. Cualquier cambio adicional debera aprobarse por ambas partes.",
    "",
    "Estado inicial del contrato: Draft",
  ].join("\n");
}

function buildManualContractDoc({
  tenantId,
  userId,
  linkedClient,
  body,
  job,
  invoice,
  jobTitle,
  amount,
  status,
  contractLanguage,
  contractCategory,
  contractOption,
}) {
  const now = new Date().toISOString();

  return {
    tenant_id: tenantId,
    user_id: userId || null,
    client_id: linkedClient?.id || "",
    client_name: linkedClient?.name || "",
    job_id: job?.id || "",
    job_title: job?.title || String(jobTitle || "").trim() || "Contrato manual",
    invoice_id: invoice?.id || "",
    invoice_number: invoice?.invoice_number || invoice?.invoiceNumber || "",
    amount: String(
      invoice?.amount ||
        (invoice?.total_cents ? Number(invoice.total_cents) / 100 : "") ||
        job?.price ||
        String(amount || "").trim(),
    ),
    status: String(status || "Draft").trim() || "Draft",
    contract_language: String(contractLanguage || "en").trim() || "en",
    contract_category: String(contractCategory || "").trim(),
    contract_option: String(contractOption || "").trim(),
    body: String(body || "").trim(),
    created_by: userId,
    created_at: now,
    updated_at: now,
  };
}

async function findClient(tenantId, role, clientId, clientName) {
  if (clientId) {
    let byIdQuery = supabaseAdmin.from(CLIENTS).select("*").eq("id", clientId);
    if ((role || "").toLowerCase() !== "super_admin") {
      byIdQuery = byIdQuery.eq("tenant_id", tenantId);
    }
    const { data: byId } = await byIdQuery.maybeSingle();
    if (byId) return byId;
  }

  if (clientName) {
    let byNameQuery = supabaseAdmin
      .from(CLIENTS)
      .select("*")
      .eq("name", clientName)
      .limit(1);
    if ((role || "").toLowerCase() !== "super_admin") {
      byNameQuery = byNameQuery.eq("tenant_id", tenantId);
    }
    const { data } = await byNameQuery;
    return data?.[0] || null;
  }

  return null;
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    let query = supabaseAdmin
      .from(CONTRACTS)
      .select("*")
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/contracts][GET] Supabase query error", error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify((data || []).map(serialize)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/contracts][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function POST(request) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }
    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const invoiceId = toId(body.invoiceId);
    const directJobId = toId(body.jobId);
    const manualBody = String(body.body || "").trim();

    let invoice = null;
    if (invoiceId) {
      let invoiceQuery = supabaseAdmin
        .from(INVOICES)
        .select("*")
        .eq("id", invoiceId);
      if ((role || "").toLowerCase() !== "super_admin") {
        invoiceQuery = invoiceQuery.eq("tenant_id", tenantDbId);
      }
      const { data: invoiceData, error: invoiceError } =
        await invoiceQuery.maybeSingle();
      if (invoiceError) {
        throw new Error(invoiceError.message);
      }
      invoice = invoiceData;
    }

    if (invoiceId && !invoice) {
      return new Response(
        JSON.stringify({ success: false, error: "Invoice not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const existingContractId = toId(
      invoice?.contract_id || invoice?.contractId,
    );
    if (existingContractId) {
      let existingContractQuery = supabaseAdmin
        .from(CONTRACTS)
        .select("*")
        .eq("id", existingContractId);
      if ((role || "").toLowerCase() !== "super_admin") {
        existingContractQuery = existingContractQuery.eq(
          "tenant_id",
          tenantDbId,
        );
      }
      const { data: existingContract } =
        await existingContractQuery.maybeSingle();
      if (existingContract) {
        return new Response(
          JSON.stringify({ success: true, data: serialize(existingContract) }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    const derivedJobId = toId(invoice?.job_id || invoice?.jobId || "");
    const jobId = derivedJobId || directJobId;
    let job = null;

    if (jobId) {
      let jobQuery = supabaseAdmin.from(JOBS).select("*").eq("id", jobId);
      if ((role || "").toLowerCase() !== "super_admin") {
        jobQuery = jobQuery.eq("tenant_id", tenantDbId);
      }
      const { data: jobData, error: jobError } = await jobQuery.maybeSingle();
      if (jobError) {
        throw new Error(jobError.message);
      }
      job = jobData;
    }

    if ((invoiceId || directJobId) && !job) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Linked job not found for this contract",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const linkedClient = await findClient(
      tenantDbId,
      role,
      invoice?.client_id ||
        invoice?.clientId ||
        job?.client_id ||
        job?.clientId ||
        body.clientId,
      invoice?.client_name ||
        invoice?.clientName ||
        job?.client_name ||
        job?.clientName ||
        body.clientName,
    );

    const hasLinkedSource = Boolean(invoiceId || directJobId);
    if (!hasLinkedSource && !manualBody) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Provide invoiceId, jobId, or a custom contract body",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const contractDoc = hasLinkedSource
      ? {
          tenant_id: tenantDbId,
          user_id: userId || null,
          client_id:
            linkedClient?.id ||
            invoice?.client_id ||
            invoice?.clientId ||
            job?.client_id ||
            job?.clientId ||
            "",
          client_name:
            linkedClient?.name ||
            invoice?.client_name ||
            invoice?.clientName ||
            job?.client_name ||
            job?.clientName ||
            "",
          job_id: job?.id || "",
          job_title: job?.title || "",
          invoice_id: invoice?.id || "",
          invoice_number:
            invoice?.invoice_number || invoice?.invoiceNumber || "",
          amount: String(
            invoice?.amount ||
              (invoice?.total_cents ? Number(invoice.total_cents) / 100 : "") ||
              job?.price ||
              "",
          ),
          status: "Draft",
          contract_language:
            String(body.contractLanguage || "en").trim() || "en",
          contract_category: String(body.contractCategory || "").trim(),
          contract_option: String(body.contractOption || "").trim(),
          body: buildContractBody({
            clientName:
              linkedClient?.name ||
              invoice?.client_name ||
              invoice?.clientName ||
              job?.client_name ||
              job?.clientName,
            job,
            invoice,
          }),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: userId,
        }
      : buildManualContractDoc({
          tenantId: tenantDbId,
          userId,
          linkedClient,
          body: manualBody,
          job,
          invoice,
          jobTitle: body.jobTitle,
          amount: body.amount,
          status: body.status,
          contractLanguage: body.contractLanguage,
          contractCategory: body.contractCategory,
          contractOption: body.contractOption,
        });

    const { data: insertedContract, error: insertError } = await supabaseAdmin
      .from(CONTRACTS)
      .insert(contractDoc)
      .select("*")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    const contractId = insertedContract.id;

    if (invoice?.id) {
      await supabaseAdmin
        .from(INVOICES)
        .update({
          contract_id: contractId,
          contract_status: "Draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("tenant_id", tenantDbId);
    }

    if (job?.id) {
      await supabaseAdmin
        .from(JOBS)
        .update({
          contract_id: contractId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("tenant_id", tenantDbId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: serialize(insertedContract),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/contracts][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
