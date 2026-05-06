import { DEFAULT_PLATFORM_FEATURE_FLAGS } from "@/lib/platform-feature-flags";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

const PRESETS = {
  growth: {
    name: "Growth",
    description: "Maximize growth visibility and user support.",
    enabledKeys: [
      "platform_activity_feed",
      "platform_stripe_overview",
      "platform_support_queue",
      "platform_ai_ops",
      "platform_email_ops",
      "platform_system_health",
      "platform_internal_controls",
      "platform_security_watch",
      "feature_website_builder",
      "feature_estimate_builder",
      "feature_ai_description",
      "feature_ai_invoice_assistant",
      "feature_admin_ai_assistant",
    ],
  },
  security: {
    name: "Security",
    description: "Prioritize threat watch, system health, and controlled operations.",
    enabledKeys: [
      "platform_security_watch",
      "platform_system_health",
      "platform_internal_controls",
      "platform_stripe_overview",
      "platform_activity_feed",
      "feature_website_builder",
      "feature_estimate_builder",
      "feature_ai_description",
      "feature_ai_invoice_assistant",
    ],
  },
  lean: {
    name: "Lean",
    description: "Reduce dashboard noise to core finance and reliability modules.",
    enabledKeys: [
      "platform_stripe_overview",
      "platform_system_health",
      "platform_security_watch",
      "feature_website_builder",
      "feature_estimate_builder",
    ],
  },
};

const KEYWORD_MAP = [
  { key: "platform_activity_feed", terms: ["activity", "feed", "contractor"] },
  { key: "platform_stripe_overview", terms: ["stripe", "payments", "revenue", "mrr"] },
  { key: "platform_security_watch", terms: ["security", "auth", "failed login", "threat"] },
  { key: "platform_support_queue", terms: ["support", "tickets", "feedback"] },
  { key: "platform_ai_ops", terms: ["ai", "assistant", "automation"] },
  { key: "platform_email_ops", terms: ["email", "delivery", "campaign"] },
  { key: "platform_system_health", terms: ["health", "uptime", "monitoring"] },
  { key: "platform_internal_controls", terms: ["controls", "admin", "internal"] },
  { key: "feature_website_builder", terms: ["website builder", "website"] },
  { key: "feature_estimate_builder", terms: ["estimate builder", "estimating", "estimates"] },
  { key: "feature_ai_description", terms: ["ai description", "description ai", "rewrite"] },
  { key: "feature_ai_invoice_assistant", terms: ["invoice ai", "invoice assistant"] },
  { key: "feature_admin_ai_assistant", terms: ["admin ai", "owner ai", "assistant"] },
];

function forbidden() {
  return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

function detectPreset(prompt) {
  const q = String(prompt || "").toLowerCase();
  if (q.includes("growth") || q.includes("crecer") || q.includes("expansion")) return "growth";
  if (q.includes("security") || q.includes("seguridad") || q.includes("hardening")) return "security";
  if (q.includes("lean") || q.includes("minimal") || q.includes("ligero") || q.includes("minimalista")) return "lean";
  return null;
}

function inferRecommendations(prompt) {
  const q = String(prompt || "").toLowerCase();
  const flags = DEFAULT_PLATFORM_FEATURE_FLAGS.map((f) => ({
    key: f.key,
    enabled: f.enabled,
    reason: "Default platform baseline.",
  }));

  const presetKey = detectPreset(q);
  if (presetKey) {
    const preset = PRESETS[presetKey];
    const enabledSet = new Set(preset.enabledKeys);
    return {
      mode: preset.name,
      summary: preset.description,
      recommendations: flags.map((f) => ({
        key: f.key,
        enabled: enabledSet.has(f.key),
        reason: enabledSet.has(f.key)
          ? `${preset.name} preset keeps this module on.`
          : `${preset.name} preset hides this module for focus.`,
      })),
    };
  }

  const explicitEnable = q.includes("enable") || q.includes("activar") || q.includes("on");
  const explicitDisable = q.includes("disable") || q.includes("desactivar") || q.includes("off");

  const allAiRequested = q.includes("all ai") || q.includes("todas las ai") || q.includes("all artificial intelligence");
  if (allAiRequested && (explicitEnable || explicitDisable)) {
    const aiKeys = new Set([
      "platform_ai_ops",
      "feature_ai_description",
      "feature_ai_invoice_assistant",
      "feature_admin_ai_assistant",
    ]);

    for (const row of flags) {
      if (!aiKeys.has(row.key)) continue;
      row.enabled = explicitEnable;
      row.reason = explicitEnable
        ? "Prompt requested enabling all AI features."
        : "Prompt requested disabling all AI features.";
    }

    return {
      mode: "Custom",
      summary: "AI applied a bulk all-AI feature command from your prompt.",
      recommendations: flags,
    };
  }

  for (const map of KEYWORD_MAP) {
    const hit = map.terms.some((term) => q.includes(term));
    if (!hit) continue;

    const row = flags.find((f) => f.key === map.key);
    if (!row) continue;

    if (explicitDisable) {
      row.enabled = false;
      row.reason = "Prompt requested disabling this module.";
    } else {
      row.enabled = true;
      row.reason = "Prompt requested enabling this module.";
    }
  }

  return {
    mode: "Custom",
    summary: "AI interpreted your prompt and suggested a custom feature set.",
    recommendations: flags,
  };
}

export async function POST(request) {
  try {
    const access = await getAuthenticatedTenantContext(request);
    if (!access.authenticated || access.role !== "super_admin") {
      return forbidden();
    }

    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, error: "prompt is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const suggestion = inferRecommendations(prompt);
    return new Response(
      JSON.stringify({ success: true, data: suggestion }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/admin/feature-flags/ai]", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed to generate AI suggestion" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
