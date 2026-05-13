import "server-only";
import crypto from "node:crypto";
import { writeAuditLog } from "@/lib/legal-enforcement";
import { getRequestIp } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const QUOTE_SIGNATURE_AUDIT_ACTION = "quote.signature.completed";
const MAX_SIGNATURE_DATA_URL_LENGTH = 600_000;

function normalizeText(value, maxLength = 300) {
  return String(value || "").trim().slice(0, maxLength);
}

export function sanitizeSignatureDrawDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > MAX_SIGNATURE_DATA_URL_LENGTH) return "";
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw)) {
    return "";
  }
  return raw;
}

function computeQuoteTotal(lineItems = [], fallbackAmount = 0) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return Number(fallbackAmount || 0);
  }
  return lineItems.reduce((sum, item) => {
    const total = Number(item?.total);
    if (Number.isFinite(total)) return sum + total;
    const qty = Number(item?.qty || item?.quantity || 0);
    const unitPrice = Number(item?.unitPrice || item?.price || 0);
    if (Number.isFinite(qty) && Number.isFinite(unitPrice)) {
      return sum + qty * unitPrice;
    }
    return sum;
  }, 0);
}

export function buildQuoteDocumentHash(quote = {}) {
  const payload = {
    quoteId: normalizeText(quote.id || quote.quote_id || "", 80),
    quoteToken: normalizeText(quote.quote_token || quote.quoteToken || "", 120),
    quoteNumber: normalizeText(quote.quote_number || quote.quoteNumber || "", 60),
    tenantId: normalizeText(quote.tenant_id || quote.tenantId || "", 80),
    title: normalizeText(quote.title || "", 200),
    clientName: normalizeText(quote.client_name || quote.clientName || "", 200),
    clientEmail: normalizeText(quote.client_email || quote.clientEmail || "", 200).toLowerCase(),
    scopeOfWork: normalizeText(quote.scope_of_work || quote.scopeDetails || "", 5_000),
    total: computeQuoteTotal(quote.line_items || quote.lineItems, quote.price || 0),
    lineItems: Array.isArray(quote.line_items || quote.lineItems)
      ? (quote.line_items || quote.lineItems).map((item) => ({
          id: normalizeText(item?.id || "", 80),
          name: normalizeText(item?.name || item?.description || "", 300),
          qty: Number(item?.qty || item?.quantity || 0),
          unitPrice: Number(item?.unitPrice || item?.price || 0),
          total: Number(item?.total || 0),
        }))
      : [],
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export async function createQuoteSignatureAuditRecord({
  request,
  quote,
  contactName,
  contactEmail,
  signatureText,
  signatureDrawDataUrl,
  acceptedElectronicConsent,
}) {
  const signedAt = new Date().toISOString();
  const signatureImage = sanitizeSignatureDrawDataUrl(signatureDrawDataUrl);
  const typedSignature = normalizeText(signatureText, 300);
  const signerName = normalizeText(contactName, 160);
  const signerEmail = normalizeText(contactEmail, 200).toLowerCase();
  const signatureMethod =
    signatureImage && typedSignature
      ? "drawn_and_typed"
      : signatureImage
        ? "drawn"
        : "typed";

  const metadata = {
    quoteId: normalizeText(quote?.id || quote?.quote_id || "", 80),
    quoteToken: normalizeText(quote?.quote_token || quote?.quoteToken || "", 120),
    quoteNumber: normalizeText(quote?.quote_number || quote?.quoteNumber || "", 60),
    tenantId: normalizeText(quote?.tenant_id || quote?.tenantId || "", 80),
    quoteTitle: normalizeText(quote?.title || "", 200),
    signerName,
    signerEmail,
    signatureText: typedSignature,
    signatureDrawDataUrl: signatureImage,
    signatureMethod,
    signedAt,
    acceptedElectronicConsent: acceptedElectronicConsent === true,
    ipAddress: normalizeText(getRequestIp(request), 120),
    userAgent: normalizeText(request.headers.get("user-agent") || "", 500),
    documentHash: buildQuoteDocumentHash(quote),
    totalAmount: computeQuoteTotal(quote?.line_items || quote?.lineItems, quote?.price || 0),
    legalStatement:
      "Electronic signature captured with signer consent, IP, user-agent, timestamp, and document hash.",
  };

  await writeAuditLog({
    userId: signerEmail || `public:${signerName || "unknown"}`,
    tenantId: metadata.tenantId || "public",
    action: QUOTE_SIGNATURE_AUDIT_ACTION,
    metadata,
  });

  return metadata;
}

export async function readLatestQuoteSignatureAudit({ quoteId, quoteToken, tenantId }) {
  let query = supabaseAdmin
    .from("audit_logs")
    .select("metadata, created_at")
    .eq("action", QUOTE_SIGNATURE_AUDIT_ACTION)
    .order("created_at", { ascending: false })
    .limit(1);

  const normalizedTenantId = normalizeText(tenantId, 80);
  if (normalizedTenantId) {
    query = query.eq("tenant_id", normalizedTenantId);
  }

  const normalizedQuoteId = normalizeText(quoteId, 80);
  const normalizedQuoteToken = normalizeText(quoteToken, 120);
  if (normalizedQuoteId) {
    query = query.contains("metadata", { quoteId: normalizedQuoteId });
  } else if (normalizedQuoteToken) {
    query = query.contains("metadata", { quoteToken: normalizedQuoteToken });
  }

  const { data, error } = await query;
  if (error) {
    console.error("[quote-signatures] readLatestQuoteSignatureAudit error", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  const metadata = row?.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return {
    quoteId: normalizeText(metadata.quoteId, 80),
    quoteToken: normalizeText(metadata.quoteToken, 120),
    quoteNumber: normalizeText(metadata.quoteNumber, 60),
    quoteTitle: normalizeText(metadata.quoteTitle, 200),
    signerName: normalizeText(metadata.signerName, 160),
    signerEmail: normalizeText(metadata.signerEmail, 200).toLowerCase(),
    signatureText: normalizeText(metadata.signatureText, 300),
    signatureDrawDataUrl: sanitizeSignatureDrawDataUrl(metadata.signatureDrawDataUrl),
    signatureMethod: normalizeText(metadata.signatureMethod, 60),
    signedAt: normalizeText(metadata.signedAt || row?.created_at || "", 80),
    ipAddress: normalizeText(metadata.ipAddress, 120),
    userAgent: normalizeText(metadata.userAgent, 500),
    documentHash: normalizeText(metadata.documentHash, 128),
    legalStatement: normalizeText(metadata.legalStatement, 300),
    acceptedElectronicConsent: metadata.acceptedElectronicConsent === true,
    totalAmount: Number(metadata.totalAmount || 0),
  };
}
