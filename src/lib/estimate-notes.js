/**
 * Canonical parser/serializer for the JSON blob stored in `estimates.notes`.
 *
 * The estimates table uses a single `notes` TEXT column to carry several
 * structured fields: scope text, address, client contact info, and an
 * append-only audit (sent/approved/declined/signature timestamps). Each
 * route previously had its own hand-rolled copy of the parse + stringify
 * logic, with subtle drifts that caused real bugs:
 *
 *  - The list endpoint dropped `audit.signature` so the kanban detail
 *    panel never rendered the customer's typed signature.
 *  - The contract route read `parsed.note` (a key that never existed)
 *    instead of `parsed.noteText`, so every generated contract had an
 *    empty scope-of-work block from notes.
 *  - The public view route stripped `signature.ip` for customer-facing
 *    payloads; the authenticated view returned it. Centralizing both
 *    behaviors lets callers opt into the right shape.
 *
 * The kind discriminator (`"estimate_pipeline"`) is preserved so legacy
 * plain-text notes still flow through (returned verbatim as `noteText`).
 */

export const ESTIMATE_NOTES_KIND = "estimate_pipeline";

/**
 * Default empty audit object. New estimates start with all timestamps
 * blank and `signature: null`.
 */
export function createEmptyAudit() {
  return {
    sentAt: "",
    approvedAt: "",
    declinedAt: "",
    changesRequestedAt: "",
    resentAt: "",
    resendCount: 0,
    signature: null,
  };
}

function normalizeSignature(signature) {
  if (!signature || typeof signature !== "object") return null;
  return {
    name: String(signature.name || ""),
    signedAt: String(signature.signedAt || ""),
    ip: String(signature.ip || ""),
  };
}

/**
 * Parse the JSON blob stored in `estimates.notes` into the canonical
 * shape consumed by every route. Legacy plain-text notes round-trip via
 * the `noteText` field.
 */
export function parseEstimateNotes(notes) {
  const raw = String(notes || "").trim();
  if (!raw) {
    return {
      address: "",
      noteText: "",
      clientEmail: "",
      clientPhone: "",
      requestedItems: null,
      audit: createEmptyAudit(),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.kind === ESTIMATE_NOTES_KIND) {
      const requestedItems = Array.isArray(parsed.requestedItems)
        ? parsed.requestedItems
        : null;
      return {
        // Several routes pre-existing pre-fix used `parsed.note` instead
        // of `parsed.noteText`. Fall back so any rogue legacy rows
        // (likely none, but defensive) still surface their text.
        address: String(parsed.address || ""),
        noteText: String(parsed.noteText ?? parsed.note ?? ""),
        clientEmail: String(parsed.clientEmail || ""),
        clientPhone: String(parsed.clientPhone || ""),
        requestedItems,
        audit: {
          sentAt: String(parsed.audit?.sentAt || ""),
          approvedAt: String(parsed.audit?.approvedAt || ""),
          declinedAt: String(parsed.audit?.declinedAt || ""),
          changesRequestedAt: String(parsed.audit?.changesRequestedAt || ""),
          resentAt: String(parsed.audit?.resentAt || ""),
          resendCount: Number(parsed.audit?.resendCount || 0),
          signature: normalizeSignature(parsed.audit?.signature),
        },
      };
    }
  } catch {
    // Legacy plain-text notes — fall through to the verbatim path.
  }

  return {
    address: "",
    noteText: raw,
    clientEmail: "",
    clientPhone: "",
    requestedItems: null,
    audit: createEmptyAudit(),
  };
}

/**
 * Serialize a structured-notes object back into the canonical JSON blob.
 * Fields default to empty strings (not `undefined`), and the signature
 * sub-object is omitted entirely when absent so legacy parsers that
 * don't expect it continue to work.
 *
 * `requestedItems` is optional — only the public respond route writes it
 * when the customer requests changes, so we keep it out of the output
 * unless the caller passes a non-null value.
 */
export function stringifyEstimateNotes({
  address = "",
  noteText = "",
  clientEmail = "",
  clientPhone = "",
  requestedItems = null,
  audit = {},
} = {}) {
  const signature = normalizeSignature(audit.signature);
  return JSON.stringify({
    kind: ESTIMATE_NOTES_KIND,
    address: String(address || ""),
    noteText: String(noteText || ""),
    clientEmail: String(clientEmail || ""),
    clientPhone: String(clientPhone || ""),
    ...(Array.isArray(requestedItems) ? { requestedItems } : {}),
    audit: {
      sentAt: String(audit.sentAt || ""),
      approvedAt: String(audit.approvedAt || ""),
      declinedAt: String(audit.declinedAt || ""),
      changesRequestedAt: String(audit.changesRequestedAt || ""),
      resentAt: String(audit.resentAt || ""),
      resendCount: Number(audit.resendCount || 0),
      ...(signature ? { signature } : {}),
    },
  });
}

/**
 * Build an initial audit block for a freshly-created estimate. The
 * relevant timestamp is set based on the create-time status; everything
 * else stays blank.
 */
export function buildAuditForCreate(status, nowIso) {
  const audit = createEmptyAudit();
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "sent") audit.sentAt = nowIso;
  if (normalized === "approved") audit.approvedAt = nowIso;
  if (normalized === "declined") audit.declinedAt = nowIso;
  if (normalized === "changes_requested") audit.changesRequestedAt = nowIso;
  return audit;
}

/**
 * Compute the audit block for an existing estimate transitioning from
 * `previousStatus` to `nextStatus`. Carries existing timestamps and the
 * customer signature forward so a contractor edit doesn't accidentally
 * wipe the audit trail.
 *
 * Behavior:
 *   - sent: stamps sentAt on first send; subsequent sent-after-changes
 *     transitions bump resendCount and stamp resentAt.
 *   - approved / declined / changes_requested: stamp the matching field.
 */
export function buildAuditForStatusTransition(existingAudit, previousStatus, nextStatus, nowIso) {
  const audit = {
    sentAt: String(existingAudit?.sentAt || ""),
    approvedAt: String(existingAudit?.approvedAt || ""),
    declinedAt: String(existingAudit?.declinedAt || ""),
    changesRequestedAt: String(existingAudit?.changesRequestedAt || ""),
    resentAt: String(existingAudit?.resentAt || ""),
    resendCount: Number(existingAudit?.resendCount || 0),
    signature: normalizeSignature(existingAudit?.signature),
  };

  const prev = String(previousStatus || "").trim().toLowerCase();
  const next = String(nextStatus || "").trim().toLowerCase();
  if (!next || next === prev) return audit;

  if (next === "sent") {
    if (!audit.sentAt) {
      audit.sentAt = nowIso;
    } else if (prev === "changes_requested") {
      audit.resentAt = nowIso;
      audit.resendCount += 1;
    }
  }
  if (next === "approved") audit.approvedAt = nowIso;
  if (next === "declined") audit.declinedAt = nowIso;
  if (next === "changes_requested") audit.changesRequestedAt = nowIso;

  return audit;
}

/**
 * Strip the customer's signature IP before sending the audit shape over
 * a public (token-gated, not authenticated) response. The IP is only
 * useful for the contractor's audit log; leaking it back to the customer
 * adds no value and is a small privacy improvement.
 */
export function redactAuditForPublic(audit) {
  if (!audit || typeof audit !== "object") return audit;
  const signature =
    audit.signature && typeof audit.signature === "object"
      ? {
          name: String(audit.signature.name || ""),
          signedAt: String(audit.signature.signedAt || ""),
        }
      : null;
  // Always include the `signature` key (null or object) so the public
  // /api/estimates/:id endpoint shape stays stable for any client that
  // destructures `audit.signature` without optional chaining.
  return {
    sentAt: String(audit.sentAt || ""),
    approvedAt: String(audit.approvedAt || ""),
    declinedAt: String(audit.declinedAt || ""),
    changesRequestedAt: String(audit.changesRequestedAt || ""),
    resentAt: String(audit.resentAt || ""),
    resendCount: Number(audit.resendCount || 0),
    signature,
  };
}
