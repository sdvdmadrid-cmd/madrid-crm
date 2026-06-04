import "server-only";

import { buildClientInsertRow, serializeClient } from "@/lib/client-records";
import { generateContractAssistant } from "@/lib/document-ai";
import { deliverEstimateNotifications } from "@/lib/estimate-notifications";
import {
  buildAuditForCreate,
  parseEstimateNotes,
  stringifyEstimateNotes,
} from "@/lib/estimate-notes";
import { serializeEstimateBase } from "@/lib/estimate-serializer";
import { fetchInvoicePartyDbFields } from "@/lib/invoice-party";
import { normalizeInvoiceLineItemsForSave } from "@/lib/invoice-line-items";
import {
  computeInvoicePaymentState,
  normalizeMoney,
} from "@/lib/invoice-payments";
import { resolveAddressFromText } from "@/lib/places-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUuid } from "@/lib/supabase-db";
import { isPastYmd, isValidYmd } from "@/lib/local-date";
import { validateAppointmentLocationPayload } from "@/lib/appointment-address";
import {
  estimateRefInvoiceNumber,
  isMissingEstimateIdColumnError,
} from "@/lib/contract-estimate-link";
import {
  nextEstimateNumberForTenant,
  nextInvoiceNumberForTenant,
  parseEstimateItems,
  scoreTextMatch,
} from "./helpers.js";

function recomputeSubtotal(services) {
  if (!Array.isArray(services)) return 0;
  let cents = 0;
  for (const service of services) {
    const qty = Number(service?.qty || 1) || 1;
    const unit = Number(service?.unitPrice ?? service?.price ?? 0) || 0;
    const explicit = service?.price !== undefined ? Number(service.price) : NaN;
    const lineTotal = Number.isFinite(explicit) ? explicit : unit * qty;
    if (!Number.isFinite(lineTotal)) continue;
    cents += Math.round(lineTotal * 100);
  }
  return cents / 100;
}

async function findClients(tenantId, query, limit = 8) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, email, phone, address, city, state, zip_code")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || [])
    .map((row) => ({
      ...serializeClient(row),
      score: Math.max(
        scoreTextMatch(row.name, query),
        scoreTextMatch(row.email, query),
        scoreTextMatch(row.phone, query),
        scoreTextMatch([row.address, row.city, row.state, row.zip_code].filter(Boolean).join(" "), query),
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function findByTable(tenantId, table, fields, query, limit = 8) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(fields)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(150);
  if (error) throw new Error(error.message);
  return (data || [])
    .map((row) => {
      const blob = fields
        .split(",")
        .map((f) => row[f.trim()])
        .filter(Boolean)
        .join(" ");
      return { row, score: scoreTextMatch(blob, query) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.row);
}

async function matchCatalogLineItems(tenantId, serviceNames = []) {
  const names = (Array.isArray(serviceNames) ? serviceNames : [])
    .map((n) => String(n || "").trim())
    .filter(Boolean);
  if (!names.length) return [];

  const { data, error } = await supabaseAdmin
    .from("services_catalog")
    .select("name, description, price_min, price_max, unit")
    .eq("tenant_id", tenantId)
    .limit(100);
  if (error) return [];

  const catalog = data || [];
  const lines = [];
  for (const wanted of names) {
    let best = null;
    let bestScore = 0;
    for (const row of catalog) {
      const score = scoreTextMatch(row.name, wanted);
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
    if (best && bestScore >= 40) {
      const price =
        Number(best.price_min || 0) > 0
          ? Number(best.price_min)
          : Number(best.price_max || 0) > 0
            ? Number(best.price_max)
            : 0;
      lines.push({
        name: best.name,
        description: best.description || "",
        qty: 1,
        unitPrice: price,
        price,
      });
    } else {
      lines.push({
        name: wanted,
        description: "",
        qty: 1,
        unitPrice: 0,
        price: 0,
      });
    }
  }
  return lines;
}

function buildScopeFromItems(items, fallbackNote) {
  if (!Array.isArray(items) || items.length === 0) {
    return fallbackNote || "Project scope as discussed.";
  }
  const lines = items
    .filter((it) => String(it?.name || "").trim().toLowerCase() !== "discount")
    .map((it) => {
      const name = String(it?.name || "Service");
      const qty = Number(it?.qty || 1);
      const price = Number(it?.price ?? it?.unitPrice ?? 0);
      return `- ${name} (qty ${qty}) — $${Number.isFinite(price) ? price.toFixed(2) : "0.00"}`;
    });
  if (fallbackNote) lines.push("", fallbackNote);
  return lines.join("\n");
}

/**
 * Execute a workspace operations tool (server-side).
 * @returns {Promise<object>} JSON-serializable result for the model
 */
export async function executeWorkspaceTool(toolName, args, ctx) {
  const tenantId = ctx.tenantDbId;
  const userId = ctx.userId;
  const actions = [];

  switch (toolName) {
    case "searchClients": {
      const clients = await findClients(tenantId, args.query || "");
      return { ok: true, clients };
    }
    case "searchJobs": {
      const jobs = await findByTable(
        tenantId,
        "jobs",
        "id, title, client_name, status, price, due_date",
        args.query || "",
      );
      return { ok: true, jobs };
    }
    case "searchEstimates": {
      const estimates = await findByTable(
        tenantId,
        "estimates",
        "id, estimate_number, client_name, status, total",
        args.query || "",
      );
      return { ok: true, estimates };
    }
    case "searchInvoices": {
      const statusFilter = String(args.status || "").trim().toLowerCase();
      let query = supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, client_name, status, amount, balance_due, due_date")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(150);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      let rows = data || [];
      if (statusFilter === "unpaid") {
        rows = rows.filter((r) =>
          ["unpaid", "partial", "overdue"].includes(String(r.status || "").toLowerCase()),
        );
      }
      const q = args.query || "";
      if (q) {
        rows = rows
          .map((row) => ({
            row,
            score: Math.max(
              scoreTextMatch(row.client_name, q),
              scoreTextMatch(row.invoice_number, q),
            ),
          }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((r) => r.row);
      }
      return { ok: true, invoices: rows.slice(0, 12) };
    }
    case "searchAppointments": {
      const rows = await findByTable(
        tenantId,
        "appointments",
        "id, title, client, date, time, location, status",
        args.query || "",
      );
      return { ok: true, appointments: rows };
    }
    case "createClient": {
      const body = {
        name: args.name,
        email: args.email,
        phone: args.phone,
        address: args.address,
        city: args.city,
        state: args.state,
        zipCode: args.zip || args.zipCode,
        notes: args.notes,
      };
      const row = buildClientInsertRow(body, tenantId, userId);
      const { data, error } = await supabaseAdmin
        .from("clients")
        .insert(row)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      const client = serializeClient(data);
      actions.push({
        type: "navigate",
        payload: { path: `/clients?clientId=${client.id}` },
        summary: `Opened client ${client.name}`,
      });
      return { ok: true, client, actions };
    }
    case "updateClient": {
      const id = String(args.clientId || "").trim();
      if (!id) return { ok: false, error: "clientId is required" };
      const patch = {};
      for (const key of ["name", "email", "phone", "address", "city", "state", "notes"]) {
        if (args[key] !== undefined) patch[key === "zip" ? "zip_code" : key] = String(args[key] || "").trim();
      }
      if (args.zip || args.zipCode) patch.zip_code = String(args.zip || args.zipCode || "").trim();
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("clients")
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, client: serializeClient(data) };
    }
    case "createEstimate": {
      const clientName = String(args.clientName || "").trim();
      if (!clientName) return { ok: false, error: "clientName is required" };

      let client = null;
      const matches = await findClients(tenantId, clientName, 3);
      if (matches.length) client = matches[0];

      const serviceNames = Array.isArray(args.lineItems)
        ? args.lineItems.map((l) => l.name || l)
        : String(args.servicesDescription || "")
            .split(/,| and /i)
            .map((s) => s.trim())
            .filter(Boolean);

      const services = await matchCatalogLineItems(tenantId, serviceNames);
      const subtotal = recomputeSubtotal(services);
      const tax = Math.max(0, Number(args.tax || 0) || 0);
      const total = Math.round((subtotal + tax) * 100) / 100;
      const nowIso = new Date().toISOString();
      const estimateNumber = await nextEstimateNumberForTenant(tenantId);
      const status = args.send === true ? "sent" : "draft";

      const notes = stringifyEstimateNotes({
        address: String(args.address || client?.address || "").trim(),
        noteText: String(args.notes || args.servicesDescription || "").trim(),
        serviceTitle: serviceNames[0] || "Services",
        clientUuid: client?.id || "",
        clientEmail: String(args.clientEmail || client?.email || "").trim(),
        clientPhone: String(args.clientPhone || client?.phone || "").trim(),
        audit: buildAuditForCreate(status, nowIso),
      });

      const { data, error } = await supabaseAdmin
        .from("estimates")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          created_by: userId,
          estimate_number: estimateNumber,
          client_name: clientName,
          status,
          items: services,
          subtotal,
          tax,
          total,
          notes,
          currency: "USD",
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const estimate = serializeEstimateBase(data);
      let delivery = null;
      if (args.send === true) {
        delivery = await deliverEstimateNotifications({
          estimate,
          sendChannels: { email: true, text: false },
          requestedStatus: "sent",
          contextLabel: "workspace-agent/createEstimate",
        });
      }

      actions.push({
        type: "navigate",
        payload: { path: `/estimates?estimateId=${estimate.id}` },
        summary: `Created estimate ${estimateNumber} for ${clientName}`,
      });

      return {
        ok: true,
        estimate: { ...estimate, delivery },
        offerSend: status !== "sent",
        actions,
      };
    }
    case "createJob": {
      const title = String(args.title || "").trim();
      if (!title) return { ok: false, error: "title is required" };
      const clientName = String(args.clientName || "").trim();
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("jobs")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          created_by: userId,
          title,
          client_name: clientName,
          client_id: normalizeUuid(args.clientId),
          description: String(args.description || "").trim(),
          service: String(args.service || "").trim(),
          status: String(args.status || "Pending").trim() || "Pending",
          price: String(args.price || "").trim(),
          due_date: String(args.dueDate || "").trim(),
          scope_details: String(args.scopeDetails || args.address || "").trim(),
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      actions.push({
        type: "navigate",
        payload: { path: `/jobs?jobId=${data.id}` },
        summary: `Created job ${title}`,
      });
      return { ok: true, job: { id: data.id, title: data.title, clientName: data.client_name }, actions };
    }
    case "createInvoice": {
      const jobQuery = String(args.jobTitle || args.jobQuery || "").trim();
      const clientName = String(args.clientName || "").trim();
      let job = null;
      if (jobQuery) {
        const jobs = await findByTable(tenantId, "jobs", "id, title, client_name, client_id, estimate_snapshot, price", jobQuery, 3);
        job = jobs[0] || null;
      }

      const lineItems = job?.estimate_snapshot?.services
        ? parseEstimateItems({ items: job.estimate_snapshot.services })
        : Array.isArray(args.lineItems)
          ? normalizeInvoiceLineItemsForSave(args.lineItems)
          : [];

      const amount = normalizeMoney(
        args.amount ||
          (lineItems.length ? recomputeSubtotal(lineItems) : job?.price || 0),
      );
      const amountCents = Math.round(amount * 100);
      const nowIso = new Date().toISOString();
      const invoiceNumber = await nextInvoiceNumberForTenant(tenantId);
      const clientId = normalizeUuid(args.clientId || job?.client_id);
      const resolvedName = clientName || job?.client_name || "";
      const partyFields = clientId
        ? await fetchInvoicePartyDbFields(supabaseAdmin, tenantId, clientId, {})
        : { client_phone: "", client_address: "", property_address: "", client_email: "" };

      const paymentState = computeInvoicePaymentState({ amount, payments: [] });
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          invoice_number: invoiceNumber,
          invoice_title: String(args.invoiceTitle || job?.title || "Service invoice").trim(),
          job_id: job?.id || normalizeUuid(args.jobId),
          client_id: clientId,
          client_name: resolvedName,
          client_email: partyFields.client_email || "",
          client_phone: partyFields.client_phone || "",
          client_address: partyFields.client_address || "",
          property_address: partyFields.property_address || "",
          amount,
          due_date: args.dueDate || null,
          items: lineItems,
          subtotal_cents: amountCents,
          tax_cents: 0,
          total_cents: amountCents,
          notes: String(args.notes || "").trim(),
          payments: paymentState.payments,
          paid_amount: paymentState.paidAmount,
          balance_due: paymentState.balanceDue,
          status: paymentState.status,
          created_by: userId,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      actions.push({
        type: "navigate",
        payload: { path: `/invoices?invoiceId=${data.id}` },
        summary: `Created invoice ${invoiceNumber}`,
      });
      return {
        ok: true,
        invoice: { id: data.id, invoiceNumber, clientName: resolvedName, amount },
        offerSend: true,
        actions,
      };
    }
    case "createContract": {
      const query = String(args.estimateQuery || args.jobTitle || args.clientName || "").trim();
      const estimates = await findByTable(
        tenantId,
        "estimates",
        "id, estimate_number, client_name, total, notes, items, tenant_id, job_id",
        query,
        3,
      );
      const estimate = estimates[0];
      if (!estimate) return { ok: false, error: "No matching estimate found for contract." };

      const parsedNotes = parseEstimateNotes(estimate.notes);
      const items = Array.isArray(estimate.items) ? estimate.items : [];
      const total = Number(estimate.total || 0);
      const scopeDetails = buildScopeFromItems(items, parsedNotes.noteText);
      const category = String(args.category || "Service").trim();
      const option = String(args.option || estimate.estimate_number || "").trim();
      const language = ["en", "es", "pl"].includes(String(args.language || "en").toLowerCase())
        ? String(args.language).toLowerCase()
        : "en";

      const { body: contractBody } = generateContractAssistant({
        language,
        category,
        option,
        clientName: estimate.client_name || "",
        jobTitle: option || category,
        amount: Number.isFinite(total) ? total.toFixed(2) : "0.00",
        scopeDetails,
        dueDate: "",
        status: "Draft",
        additionalTerms: String(args.additionalTerms || "").trim(),
      });

      const insertPayload = {
        tenant_id: String(estimate.tenant_id || tenantId),
        client_id: String(parsedNotes.clientUuid || "").trim(),
        client_name: estimate.client_name || "",
        job_id: String(estimate.job_id || "").trim(),
        job_title: option || category,
        estimate_id: String(estimate.id),
        invoice_id: "",
        invoice_number: "",
        amount: Number.isFinite(total) ? String(total) : "0",
        status: "Draft",
        contract_language: language,
        contract_category: category,
        contract_option: option,
        body: contractBody,
      };

      let { data: inserted, error: insertError } = await supabaseAdmin
        .from("contracts")
        .insert([insertPayload])
        .select("*")
        .maybeSingle();

      if (insertError && isMissingEstimateIdColumnError(insertError)) {
        const fallback = { ...insertPayload };
        delete fallback.estimate_id;
        fallback.invoice_number = estimateRefInvoiceNumber(estimate.id);
        ({ data: inserted, error: insertError } = await supabaseAdmin
          .from("contracts")
          .insert([fallback])
          .select("*")
          .maybeSingle());
      }
      if (insertError) throw new Error(insertError.message);

      actions.push({
        type: "navigate",
        payload: { path: `/contracts?contractId=${inserted.id}` },
        summary: `Created contract for ${estimate.client_name}`,
      });
      return { ok: true, contract: { id: inserted.id, clientName: estimate.client_name }, actions };
    }
    case "createAppointment": {
      const title = String(args.title || "Appointment").trim();
      const clientName = String(args.clientName || args.client || "").trim();
      const date = String(args.date || "").trim();
      const time = String(args.time || "").trim();
      if (!clientName) return { ok: false, error: "clientName is required" };
      if (!date || !isValidYmd(date)) return { ok: false, error: "date must be YYYY-MM-DD" };
      if (isPastYmd(date)) return { ok: false, error: "Cannot schedule in the past" };
      if (!time) return { ok: false, error: "time is required (HH:MM)" };

      let location = String(args.location || "").trim();
      let latitude = args.latitude;
      let longitude = args.longitude;
      let addressPlaceId = String(args.addressPlaceId || "").trim();

      if (location && (!addressPlaceId || latitude == null)) {
        const resolved = await resolveAddressFromText(location);
        if (!resolved.ok) return { ok: false, error: resolved.error };
        location = resolved.location;
        latitude = resolved.latitude;
        longitude = resolved.longitude;
        addressPlaceId = resolved.placeId;
      }

      const body = {
        title,
        clientName,
        date,
        time,
        endTime: args.endTime || "",
        location,
          notes: [args.notes, args.crew ? `Crew: ${args.crew}` : ""].filter(Boolean).join("\n"),
          status: args.status || "Scheduled",
        latitude,
        longitude,
        addressPlaceId,
      };
      const locErr = validateAppointmentLocationPayload(body);
      if (locErr) return { ok: false, error: locErr };

      const { data, error } = await supabaseAdmin
        .from("appointments")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          title,
          client: clientName,
          date,
          time,
          end_time: body.endTime || null,
          location,
          notes: String(body.notes || "").trim(),
          status: "scheduled",
          latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
          longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
          address_place_id: addressPlaceId || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      actions.push({
        type: "navigate",
        payload: { path: `/calendar?date=${date}` },
        summary: `Scheduled ${title} on ${date} at ${time}`,
      });
      return { ok: true, appointment: { id: data.id, date, time, location }, actions };
    }
    case "sendEstimate": {
      const id = String(args.estimateId || "").trim();
      if (!id) return { ok: false, error: "estimateId is required" };
      const { data, error } = await supabaseAdmin
        .from("estimates")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      const estimate = serializeEstimateBase(data);
      const delivery = await deliverEstimateNotifications({
        estimate,
        sendChannels: { email: args.viaEmail !== false, text: args.viaText === true },
        requestedStatus: "sent",
        contextLabel: "workspace-agent/sendEstimate",
      });
      return { ok: true, estimateId: id, delivery };
    }
    case "generatePDF": {
      const entity = String(args.entity || "").trim().toLowerCase();
      const id = String(args.id || "").trim();
      if (!id) return { ok: false, error: "id is required" };
      let path = "";
      if (entity === "invoice") path = `/api/invoices/${id}/pdf`;
      else if (entity === "estimate") path = `/api/estimates/${id}/pdf`;
      else return { ok: false, error: "entity must be invoice or estimate" };
      actions.push({
        type: "ops.openUrl",
        payload: { url: path },
        summary: `Opened ${entity} PDF`,
      });
      return { ok: true, pdfPath: path, actions };
    }
    default:
      return { ok: false, error: `Unknown tool: ${toolName}` };
  }
}
