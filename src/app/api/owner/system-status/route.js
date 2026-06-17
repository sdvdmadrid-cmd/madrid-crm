import { getAuthenticatedTenantContext } from "@/lib/tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { WEBSITE_MEDIA_BUCKET } from "@/lib/website-media-storage";
import { getTurnstileStatus } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * Aggregated infrastructure health view, owner-only.
 * Replaces the dev-facing banner that used to show in the website builder.
 */
export async function GET(request) {
  const { authenticated, role } = await getAuthenticatedTenantContext(request);
  if (!authenticated || role !== "super_admin") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const out = {
    openai: { ok: false, hint: "" },
    storage: { ok: false, bucket: WEBSITE_MEDIA_BUCKET, hint: "" },
    turnstile: { ok: false, hint: "" },
    email: { ok: false, hint: "" },
    stripe: { ok: false, hint: "" },
  };

  out.openai.ok = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
  if (!out.openai.ok) {
    out.openai.hint =
      "Set OPENAI_API_KEY in Vercel → Project Settings → Environment Variables (Production) and redeploy.";
  }

  try {
    const { data, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      out.storage.hint = `Supabase storage error: ${error.message}`;
    } else if (Array.isArray(data)) {
      out.storage.ok = data.some(
        (b) => b.id === WEBSITE_MEDIA_BUCKET || b.name === WEBSITE_MEDIA_BUCKET,
      );
      if (!out.storage.ok) {
        out.storage.hint = `Create a public bucket named "${WEBSITE_MEDIA_BUCKET}" in Supabase Storage. It holds website-builder gallery photos and hero images.`;
      }
    }
  } catch (err) {
    out.storage.hint = `Storage check failed: ${err?.message || String(err)}`;
  }

  const turnstile = getTurnstileStatus();
  out.turnstile.ok = turnstile.mode === "production";
  out.turnstile.mode = turnstile.mode;
  if (!out.turnstile.ok) {
    out.turnstile.hint =
      turnstile.mode === "test_rejected"
        ? "Production is using Cloudflare test keys. Replace NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY with real production keys."
        : turnstile.mode === "misconfigured"
          ? "Turnstile keys are missing or invalid. Configure NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY."
          : "Turnstile is disabled.";
  }

  const emailProvider = String(process.env.EMAIL_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (emailProvider === "resend") {
    out.email.ok = Boolean(String(process.env.RESEND_API_KEY || "").trim());
    if (!out.email.ok) {
      out.email.hint =
        "EMAIL_PROVIDER=resend but RESEND_API_KEY is missing. Add it to Vercel and redeploy.";
    }
  } else if (emailProvider && emailProvider !== "mock") {
    out.email.ok = true;
  } else {
    out.email.hint = "EMAIL_PROVIDER is not set (or is mock). Emails will not be sent.";
  }
  out.email.provider = emailProvider || "(unset)";

  out.stripe.ok = Boolean(
    String(process.env.STRIPE_SECRET_KEY || "").trim() &&
      String(process.env.STRIPE_WEBHOOK_SECRET || "").trim() &&
      String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim(),
  );
  out.stripe.webhookSecretCount = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS,
    process.env.STRIPE_WEBHOOK_SECRETS,
  ].filter((value) => String(value || "").trim()).length;
  if (!out.stripe.ok) {
    out.stripe.hint =
      "Stripe is missing one of: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.";
  } else {
    out.stripe.hint =
      "Live webhook URL: https://fieldbaseapp.net/api/payments/webhooks/stripe — signing secret must match Stripe Dashboard → Developers → Webhooks (live mode). During rotation, set STRIPE_WEBHOOK_SECRET_PREVIOUS to the old secret.";
  }
  out.stripe.connectEnabled =
    String(process.env.STRIPE_CONNECT_ENABLED || "").toLowerCase() === "true";

  const overallOk =
    out.openai.ok && out.storage.ok && out.turnstile.ok && out.email.ok && out.stripe.ok;

  return Response.json({
    success: true,
    data: {
      ok: overallOk,
      checks: out,
      generatedAt: new Date().toISOString(),
    },
  });
}
