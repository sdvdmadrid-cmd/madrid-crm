import "server-only";

import { getOpenAiClient } from "@/lib/openai-client";
import { checkAiRateLimit, getRequestIp, recordAiRateLimitAttempt } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/legal-enforcement";
import { normalizeAiErrorCode } from "@/lib/ai-errors";

const DEFAULT_MODEL = String(process.env.OPENAI_MODEL_DEFAULT || "gpt-4.1-mini").trim();
const STRONG_MODEL = String(process.env.OPENAI_MODEL_STRONG || "gpt-4.1").trim();
const MONTHLY_SPEND_CAP_USD = Number(process.env.AI_MONTHLY_SPEND_CAP_USD || 250);
const MAX_REQUEST_TOKENS = Number(process.env.AI_MAX_TOKENS_HARD_LIMIT || 1600);
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 18000);
const MAX_RETRIES = Number(process.env.AI_RETRY_LIMIT || 2);
const SPEND_ALERT_THRESHOLDS = [70, 85, 100];
const SPEND_CACHE_TTL_MS = 60_000;
/** @type {Map<string, { spend: number, expiresAt: number }>} */
const tenantSpendCache = new Map();

async function getTenantMonthlySpendUsdCached(tenantId) {
  const tenantKey = String(tenantId || "unknown").trim() || "unknown";
  const hit = tenantSpendCache.get(tenantKey);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.spend;
  }

  const spend = await getTenantMonthlySpendUsd(tenantId);
  tenantSpendCache.set(tenantKey, {
    spend,
    expiresAt: Date.now() + SPEND_CACHE_TTL_MS,
  });
  return spend;
}

function recordTenantSpendEstimate(tenantId, totalSpendUsd) {
  const tenantKey = String(tenantId || "unknown").trim() || "unknown";
  tenantSpendCache.set(tenantKey, {
    spend: Number(totalSpendUsd || 0),
    expiresAt: Date.now() + SPEND_CACHE_TTL_MS,
  });
}

const MODEL_COST_PER_1K = {
  "gpt-4.1-mini": { input: 0.0004, output: 0.0016 },
  "gpt-4.1": { input: 0.002, output: 0.008 },
};

function clampMaxTokens(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 300;
  return Math.max(64, Math.min(MAX_REQUEST_TOKENS, Math.round(n)));
}

function chooseModel(modelTier = "mini") {
  return modelTier === "strong" ? STRONG_MODEL : DEFAULT_MODEL;
}

function estimateCostUsd(model, usage) {
  const price = MODEL_COST_PER_1K[model] || MODEL_COST_PER_1K["gpt-4.1-mini"];
  const inputTokens = Number(usage?.prompt_tokens || 0);
  const outputTokens = Number(usage?.completion_tokens || 0);
  const inputCost = (inputTokens / 1000) * price.input;
  const outputCost = (outputTokens / 1000) * price.output;
  return Number((inputCost + outputCost).toFixed(6));
}

async function getTenantMonthlySpendUsd(tenantId) {
  const tenantKey = String(tenantId || "unknown").trim() || "unknown";
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("metadata")
    .eq("tenant_id", tenantKey)
    .eq("action", "ai.request.completed")
    .gte("created_at", monthStart)
    .limit(5000);

  if (error) {
    console.error("[ai-service] monthly spend query failed", error);
    return 0;
  }

  return Number(
    (data || []).reduce((sum, row) => {
      const cost = Number(row?.metadata?.estimatedCostUsd || 0);
      return sum + (Number.isFinite(cost) ? cost : 0);
    }, 0).toFixed(6),
  );
}

function toMonthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function computeUtilizationPercent(spendUsd) {
  if (!Number.isFinite(MONTHLY_SPEND_CAP_USD) || MONTHLY_SPEND_CAP_USD <= 0) {
    return 0;
  }
  return Number(((Number(spendUsd || 0) / MONTHLY_SPEND_CAP_USD) * 100).toFixed(2));
}

async function hasMonthlyThresholdAlert(tenantId, threshold) {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("id,metadata")
    .eq("tenant_id", tenantId)
    .eq("action", "ai.spend.alert")
    .gte("created_at", toMonthStartIso())
    .limit(400);

  if (error) {
    console.error("[ai-service] threshold alert lookup failed", error);
    return false;
  }

  return (data || []).some(
    (row) => Number(row?.metadata?.thresholdPercent || 0) === Number(threshold),
  );
}

async function emitSpendThresholdAlerts({ tenantId, userId, totalSpendUsd }) {
  const utilizationPercent = computeUtilizationPercent(totalSpendUsd);

  for (const threshold of SPEND_ALERT_THRESHOLDS) {
    if (utilizationPercent < threshold) continue;
    const alreadyLogged = await hasMonthlyThresholdAlert(tenantId, threshold);
    if (alreadyLogged) continue;

    await writeAuditLog({
      userId,
      tenantId,
      action: "ai.spend.alert",
      metadata: {
        thresholdPercent: threshold,
        utilizationPercent,
        spendUsd: Number(totalSpendUsd || 0),
        capUsd: MONTHLY_SPEND_CAP_USD,
      },
    });
  }
}

function shouldRetry(code, status, attempt) {
  if (attempt >= MAX_RETRIES) return false;
  if (code === "network_timeout") return true;
  if (code === "rate_limit_exceeded") return true;
  return status >= 500;
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function languageFromRequest(request, fallback = "en") {
  const header = String(request?.headers?.get?.("accept-language") || "").toLowerCase();
  if (header.includes("es")) return "es";
  if (header.includes("pl")) return "pl";
  return fallback;
}

export async function runAiCompletion({
  request,
  tenantId,
  userId,
  feature,
  modelTier = "mini",
  messages,
  temperature = 0.3,
  maxTokens = 300,
}) {
  const startedAt = Date.now();
  const featureName = String(feature || "unknown").trim() || "unknown";
  const tenantKey = String(tenantId || userId || "unknown").trim() || "unknown";
  const actor = String(userId || "system").trim() || "system";
  const ip = request ? getRequestIp(request) : "unknown";
  const model = chooseModel(modelTier);
  const normalizedMaxTokens = clampMaxTokens(maxTokens);

  const rate = await checkAiRateLimit({ tenantId: tenantKey, ip, feature: featureName });
  if (!rate.allowed) {
    await recordAiRateLimitAttempt({ tenantId: tenantKey, ip, feature: featureName });
    const err = new Error("AI throttled by rate limit");
    err.aiCode = "throttled";
    err.status = 429;
    throw err;
  }

  const monthlySpend = await getTenantMonthlySpendUsdCached(tenantKey);
  void emitSpendThresholdAlerts({
    tenantId: tenantKey,
    userId: actor,
    totalSpendUsd: monthlySpend,
  });
  if (monthlySpend >= MONTHLY_SPEND_CAP_USD) {
    const err = new Error("Monthly AI spend cap reached");
    err.aiCode = "monthly_cap_reached";
    err.status = 429;
    throw err;
  }

  void writeAuditLog({
    userId: actor,
    tenantId: tenantKey,
    action: "ai.request.started",
    metadata: {
      feature: featureName,
      model,
      maxTokens: normalizedMaxTokens,
      monthlySpendUsd: monthlySpend,
      monthlyCapUsd: MONTHLY_SPEND_CAP_USD,
    },
  }).catch(() => {});

  const client = getOpenAiClient();

  let attempt = 0;
  while (true) {
    try {
      const completion = await client.chat.completions.create(
        {
          model,
          messages,
          temperature,
          max_tokens: normalizedMaxTokens,
        },
        {
          timeout: REQUEST_TIMEOUT_MS,
        },
      );

      const text = String(completion?.choices?.[0]?.message?.content || "").trim();
      const usage = completion?.usage || {};
      const estimatedCostUsd = estimateCostUsd(model, usage);
      const responseTimeMs = Date.now() - startedAt;
      const totalSpendUsd = Number((monthlySpend + estimatedCostUsd).toFixed(6));
      const utilizationPercent = computeUtilizationPercent(totalSpendUsd);
      recordTenantSpendEstimate(tenantKey, totalSpendUsd);

      void writeAuditLog({
        userId: actor,
        tenantId: tenantKey,
        action: "ai.request.completed",
        metadata: {
          status: "ok",
          feature: featureName,
          model,
          usage,
          estimatedCostUsd,
          totalSpendUsd,
          utilizationPercent,
          monthlyCapUsd: MONTHLY_SPEND_CAP_USD,
          responseTimeMs,
          finishReason: completion?.choices?.[0]?.finish_reason || null,
        },
      }).catch(() => {});

      void emitSpendThresholdAlerts({
        tenantId: tenantKey,
        userId: actor,
        totalSpendUsd,
      });

      console.info("[ai-service] completed", {
        feature: featureName,
        tenantId: tenantKey,
        model,
        responseTimeMs,
        estimatedCostUsd,
        totalTokens: Number(usage?.total_tokens || 0),
      });

      return {
        text,
        model,
        usage,
        estimatedCostUsd,
        responseTimeMs,
        finishReason: completion?.choices?.[0]?.finish_reason || null,
      };
    } catch (error) {
      const status = Number(error?.status || 0);
      const message = String(error?.message || "AI request failed");
      const rawCode = error?.code || error?.error?.code || error?.name;
      const aiCode = normalizeAiErrorCode(rawCode, status, message);

      if (shouldRetry(aiCode, status, attempt)) {
        attempt += 1;
        await waitMs(250 * attempt);
        continue;
      }

      const responseTimeMs = Date.now() - startedAt;
      await recordAiRateLimitAttempt({ tenantId: tenantKey, ip, feature: featureName });

      await writeAuditLog({
        userId: actor,
        tenantId: tenantKey,
        action: "ai.request.failed",
        metadata: {
          status: "error",
          feature: featureName,
          model,
          aiCode,
          statusCode: status || null,
          responseTimeMs,
          message: message.slice(0, 300),
        },
      });

      console.error("[ai-service] failed", {
        feature: featureName,
        tenantId: tenantKey,
        model,
        aiCode,
        status,
        responseTimeMs,
        message,
      });

      const wrapped = new Error(message);
      wrapped.aiCode = aiCode;
      wrapped.status = status || 502;
      throw wrapped;
    }
  }
}

export async function checkOpenAiHealth() {
  const client = getOpenAiClient();
  const startedAt = Date.now();

  const completion = await client.chat.completions.create(
    {
      model: DEFAULT_MODEL,
      messages: [{ role: "user", content: "Respond with OK" }],
      max_tokens: 8,
      temperature: 0,
    },
    { timeout: 8000 },
  );

  return {
    ok: true,
    model: DEFAULT_MODEL,
    responseTimeMs: Date.now() - startedAt,
    text: String(completion?.choices?.[0]?.message?.content || "").trim(),
    usage: completion?.usage || {},
  };
}

export function getRequestLanguage(request, fallback = "en") {
  return languageFromRequest(request, fallback);
}
