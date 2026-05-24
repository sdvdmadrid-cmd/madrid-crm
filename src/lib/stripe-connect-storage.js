import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

const COMPANY_PROFILES = "company_profiles";
const JSON_KEY = "stripe_connect";

/** @typedef {'columns' | 'json'} ConnectStorageMode */

/** @type {ConnectStorageMode | null} */
let storageModeCache = null;

function isMissingConnectColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("stripe_connect_account_id") &&
    message.includes("does not exist")
  );
}

/** @returns {Promise<ConnectStorageMode>} */
export async function getConnectStorageMode() {
  if (storageModeCache) {
    return storageModeCache;
  }

  const { error } = await supabaseAdmin
    .from(COMPANY_PROFILES)
    .select("stripe_connect_account_id")
    .limit(1);

  if (error && isMissingConnectColumnError(error)) {
    storageModeCache = "json";
    return storageModeCache;
  }

  if (error) {
    throw new Error(error.message);
  }

  storageModeCache = "columns";
  return storageModeCache;
}

function normalizeConnectRecord(raw = {}) {
  const accountId = String(raw.account_id || raw.stripe_connect_account_id || "").trim();
  const chargesEnabled = Boolean(
    raw.charges_enabled ?? raw.stripe_connect_charges_enabled,
  );
  const payoutsEnabled = Boolean(
    raw.payouts_enabled ?? raw.stripe_connect_payouts_enabled,
  );
  const onboardedAt =
    raw.onboarded_at ?? raw.stripe_connect_onboarded_at ?? null;

  return {
    accountId,
    chargesEnabled,
    payoutsEnabled,
    onboardedAt,
    onboarded: Boolean(accountId) && chargesEnabled && payoutsEnabled,
  };
}

/**
 * @param {string} tenantId
 * @param {{ includeProfile?: boolean }} [options]
 */
export async function readConnectProfile(tenantId, options = {}) {
  const tenantKey = String(tenantId || "").trim();
  if (!tenantKey) {
    return {
      connect: normalizeConnectRecord({}),
      profile: null,
    };
  }

  const mode = await getConnectStorageMode();
  const selectColumns =
    mode === "columns"
      ? "stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_onboarded_at"
      : "service_catalog_preferences";

  const profileSelect = options.includeProfile
    ? `${selectColumns}, public_display_name, company_name`
    : selectColumns;

  const { data, error } = await supabaseAdmin
    .from(COMPANY_PROFILES)
    .select(profileSelect)
    .eq("tenant_id", tenantKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (mode === "columns") {
    return {
      connect: normalizeConnectRecord(data || {}),
      profile: data,
    };
  }

  const jsonConnect = data?.service_catalog_preferences?.[JSON_KEY] || {};
  return {
    connect: normalizeConnectRecord(jsonConnect),
    profile: data,
  };
}

/**
 * @param {string} tenantId
 * @param {{
 *   accountId?: string,
 *   chargesEnabled?: boolean,
 *   payoutsEnabled?: boolean,
 *   onboardedAt?: string | null,
 * }} patch
 */
export async function writeConnectProfile(tenantId, patch) {
  const tenantKey = String(tenantId || "").trim();
  if (!tenantKey) {
    throw new Error("tenantId is required");
  }

  const mode = await getConnectStorageMode();

  if (mode === "columns") {
    const row = {
      tenant_id: tenantKey,
    };
    if (patch.accountId !== undefined) {
      row.stripe_connect_account_id = patch.accountId;
    }
    if (patch.chargesEnabled !== undefined) {
      row.stripe_connect_charges_enabled = patch.chargesEnabled;
    }
    if (patch.payoutsEnabled !== undefined) {
      row.stripe_connect_payouts_enabled = patch.payoutsEnabled;
    }
    if (patch.onboardedAt !== undefined) {
      row.stripe_connect_onboarded_at = patch.onboardedAt;
    }

    const { error } = await supabaseAdmin
      .from(COMPANY_PROFILES)
      .upsert(row, { onConflict: "tenant_id" });

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { data: existingRow, error: readError } = await supabaseAdmin
    .from(COMPANY_PROFILES)
    .select("service_catalog_preferences")
    .eq("tenant_id", tenantKey)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  const preferences =
    existingRow?.service_catalog_preferences &&
    typeof existingRow.service_catalog_preferences === "object"
      ? existingRow.service_catalog_preferences
      : {};

  const current = preferences[JSON_KEY] || {};
  const nextConnect = { ...current };

  if (patch.accountId !== undefined) {
    nextConnect.account_id = patch.accountId;
  }
  if (patch.chargesEnabled !== undefined) {
    nextConnect.charges_enabled = patch.chargesEnabled;
  }
  if (patch.payoutsEnabled !== undefined) {
    nextConnect.payouts_enabled = patch.payoutsEnabled;
  }
  if (patch.onboardedAt !== undefined) {
    nextConnect.onboarded_at = patch.onboardedAt;
  }

  const { error } = await supabaseAdmin.from(COMPANY_PROFILES).upsert(
    {
      tenant_id: tenantKey,
      service_catalog_preferences: {
        ...preferences,
        [JSON_KEY]: nextConnect,
      },
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Webhook path when dedicated columns are unavailable.
 * @param {string} accountId
 * @param {string} [tenantId]
 * @param {{
 *   chargesEnabled: boolean,
 *   payoutsEnabled: boolean,
 *   onboardedAt: string | null,
 * }} status
 */
export async function updateConnectProfileByAccountId(
  accountId,
  tenantId,
  status,
) {
  const acct = String(accountId || "").trim();
  if (!acct) {
    return;
  }

  const mode = await getConnectStorageMode();

  if (mode === "columns") {
    let query = supabaseAdmin
      .from(COMPANY_PROFILES)
      .update({
        stripe_connect_charges_enabled: status.chargesEnabled,
        stripe_connect_payouts_enabled: status.payoutsEnabled,
        stripe_connect_onboarded_at: status.onboardedAt,
      })
      .eq("stripe_connect_account_id", acct);

    if (tenantId) {
      query = query.eq("tenant_id", String(tenantId).trim());
    }

    const { error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const tenantKey = String(tenantId || "").trim();
  if (tenantKey) {
    await writeConnectProfile(tenantKey, {
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      onboardedAt: status.onboardedAt,
    });
    return;
  }

  const { data: rows, error: listError } = await supabaseAdmin
    .from(COMPANY_PROFILES)
    .select("tenant_id, service_catalog_preferences");

  if (listError) {
    throw new Error(listError.message);
  }

  const match = (rows || []).find((row) => {
    const stored = row?.service_catalog_preferences?.[JSON_KEY]?.account_id;
    return String(stored || "").trim() === acct;
  });

  if (!match?.tenant_id) {
    return;
  }

  await writeConnectProfile(match.tenant_id, {
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
    onboardedAt: status.onboardedAt,
  });
}
