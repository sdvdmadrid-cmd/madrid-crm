import { getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse, unauthenticatedResponse } from "@/lib/tenant";
import { WEBSITE_MEDIA_BUCKET } from "@/lib/website-media-storage";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request) {
  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();

  const openai = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
  const supabaseUrl = Boolean(String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim());
  const serviceKey = Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());

  let storageReady = false;
  if (supabaseUrl && serviceKey) {
    try {
      const { data, error } = await supabaseAdmin.storage.listBuckets();
      if (!error && Array.isArray(data)) {
        storageReady = data.some(
          (b) => b.id === WEBSITE_MEDIA_BUCKET || b.name === WEBSITE_MEDIA_BUCKET,
        );
      }
    } catch {
      storageReady = false;
    }
  }

  const ready = openai && storageReady;

  return Response.json({
    success: true,
    data: {
      ready,
      openai,
      storageReady,
      bucket: WEBSITE_MEDIA_BUCKET,
    },
  });
}
