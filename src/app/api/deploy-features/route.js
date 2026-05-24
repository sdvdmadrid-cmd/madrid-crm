const BUILD_SHA = String(
  process.env.NEXT_PUBLIC_BUILD_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "unknown",
).slice(0, 12);

const SHIPPED_FEATURES = [
  "public_contractor_websites_/site/slug",
  "website_builder_publish",
  "lead_inbox",
  "settings_stripe_connect",
  "multi_tenant_workspace_branding",
  "estimate_public_jwt_tokens",
  "deterministic_super_admin_owner_experience",
];

export async function GET() {
  return Response.json({
    success: true,
    buildSha: BUILD_SHA,
    features: SHIPPED_FEATURES,
    note:
      "Platform owners always load Mission Control interface. Contractor UI is role-scoped and no longer forced via preview cookie.",
  });
}
