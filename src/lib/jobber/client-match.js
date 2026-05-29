import { supabaseAdmin } from "../supabase-admin-core.js";
import {
  normalizeEmailForMatch,
  normalizePhoneForMatch,
} from "../import-engine/client-import-validate.js";

/**
 * Link a Jobber client row to an existing CSV/imported client when possible.
 * Prefers email, then phone, then exact name (only when a single match exists).
 */
export async function findExistingClientToLink(row, tenantId) {
  const emailKey = normalizeEmailForMatch(row.email);
  if (emailKey) {
    const { data: emailMatches, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, jobber_id")
      .eq("tenant_id", tenantId)
      .ilike("email", row.email.trim())
      .limit(5);

    if (error) throw new Error(error.message);

    const candidates = (emailMatches || []).filter(
      (client) => !client.jobber_id || client.jobber_id === row.jobber_id,
    );
    if (candidates.length === 1) return candidates[0];
  }

  const phoneKey = normalizePhoneForMatch(row.phone);
  if (phoneKey) {
    const { data: phoneRows, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, phone, jobber_id")
      .eq("tenant_id", tenantId)
      .not("phone", "is", null)
      .limit(200);

    if (error) throw new Error(error.message);

    const candidates = (phoneRows || []).filter((client) => {
      if (client.jobber_id && client.jobber_id !== row.jobber_id) return false;
      return normalizePhoneForMatch(client.phone) === phoneKey;
    });

    if (candidates.length === 1) return candidates[0];
  }

  const nameKey = String(row.name || "").trim().toLowerCase();
  if (nameKey) {
    const { data: nameMatches, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, jobber_id")
      .eq("tenant_id", tenantId)
      .ilike("name", row.name.trim())
      .limit(5);

    if (error) throw new Error(error.message);

    const candidates = (nameMatches || []).filter(
      (client) => !client.jobber_id || client.jobber_id === row.jobber_id,
    );
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}
