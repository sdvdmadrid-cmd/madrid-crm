import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const TABLE = "platform_feature_flags";

export const DEFAULT_PLATFORM_FEATURE_FLAGS = [
  {
    key: "platform_activity_feed",
    enabled: true,
    description: "Cross-tenant contractor activity feed in owner dashboard.",
  },
  {
    key: "platform_stripe_overview",
    enabled: true,
    description: "Stripe and payment operations module in owner dashboard.",
  },
  {
    key: "platform_security_watch",
    enabled: true,
    description: "Failed auth attempts and security watch module.",
  },
  {
    key: "platform_support_queue",
    enabled: true,
    description: "Support queue module powered by product feedback.",
  },
  {
    key: "platform_ai_ops",
    enabled: true,
    description: "Internal AI operations and assistant controls.",
  },
  {
    key: "platform_email_ops",
    enabled: true,
    description: "Email reliability and delivery controls.",
  },
  {
    key: "platform_system_health",
    enabled: true,
    description: "System health monitoring module.",
  },
  {
    key: "platform_internal_controls",
    enabled: true,
    description: "Internal admin controls section.",
  },
  {
    key: "feature_website_builder",
    enabled: true,
    description: "Enable Website Builder pages and APIs.",
  },
  {
    key: "feature_estimate_builder",
    enabled: true,
    description: "Enable Estimate Builder pages and APIs.",
  },
  {
    key: "feature_ai_description",
    enabled: true,
    description: "Enable AI description generation endpoints.",
  },
  {
    key: "feature_ai_invoice_assistant",
    enabled: true,
    description: "Enable AI invoice assistant endpoint.",
  },
  {
    key: "feature_admin_ai_assistant",
    enabled: true,
    description: "Enable owner Admin AI assistant module and endpoint.",
  },
];

function mergeFlags(rows = []) {
  const byKey = new Map((rows || []).map((row) => [row.key, row]));

  return DEFAULT_PLATFORM_FEATURE_FLAGS.map((def) => {
    const persisted = byKey.get(def.key);
    return {
      key: def.key,
      description: persisted?.description || def.description,
      enabled:
        typeof persisted?.enabled === "boolean"
          ? persisted.enabled
          : def.enabled,
      updatedAt: persisted?.updated_at || null,
      updatedBy: persisted?.updated_by || null,
      source: persisted ? "database" : "default",
    };
  });
}

export async function listPlatformFeatureFlags() {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("key,enabled,description,updated_by,updated_at");

  if (error) {
    throw new Error(error.message);
  }

  return mergeFlags(data || []);
}

export async function getPlatformFeatureFlagMap() {
  const flags = await listPlatformFeatureFlags();
  return flags.reduce((acc, flag) => {
    acc[flag.key] = flag.enabled === true;
    return acc;
  }, {});
}

export async function isPlatformFeatureEnabled(key, fallback = true) {
  const normalized = String(key || "").trim();
  if (!normalized) return Boolean(fallback);
  const map = await getPlatformFeatureFlagMap();
  if (!(normalized in map)) {
    return Boolean(fallback);
  }
  return map[normalized] === true;
}

export async function upsertPlatformFeatureFlag({ key, enabled, description = "", updatedBy = "super_admin" }) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    throw new Error("Feature flag key is required");
  }

  const { error } = await supabaseAdmin.from(TABLE).upsert(
    {
      key: normalizedKey,
      enabled: enabled === true,
      description: String(description || "").slice(0, 400),
      updated_by: String(updatedBy || "super_admin").slice(0, 120),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}
