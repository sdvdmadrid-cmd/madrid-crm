import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { MAX_UPLOAD_BATCH, normalizeGalleryPhoto } from "@/lib/website-gallery";
import { uploadWebsiteImageFromDataUrl } from "@/lib/website-media-storage";
import { supabaseAdmin } from "@/lib/supabase-admin";

const WEBSITE_TABLE = "contractor_websites";

export const maxDuration = 60;

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

export async function POST(request) {
  const websiteBuilderEnabled = await isPlatformFeatureEnabled(
    "feature_website_builder",
    true,
  );
  if (!websiteBuilderEnabled) {
    return Response.json(
      { success: false, error: "Website Builder is disabled." },
      { status: 403 },
    );
  }

  const access = await getAuthenticatedTenantContext(request);
  if (!access.authenticated) return unauthenticatedResponse();
  if (!canWrite(access.role)) return forbiddenResponse();

  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_UPLOAD_BATCH) : [];
  if (!items.length) {
    return Response.json({ success: false, error: "No images to upload" }, { status: 400 });
  }

  const { data: website } = await supabaseAdmin
    .from(WEBSITE_TABLE)
    .select("slug")
    .eq("tenant_id", access.tenantDbId)
    .maybeSingle();

  const slug = String(website?.slug || "site");

  const uploaded = await mapWithConcurrency(items, 3, async (item, index) => {
    const dataUrl = String(item?.dataUrl || item?.src || "").trim();
    if (!dataUrl.startsWith("data:image/") && !/^https?:\/\//i.test(dataUrl)) {
      return { success: false, error: "Invalid image", index };
    }

    const url = dataUrl.startsWith("data:image/")
      ? await uploadWebsiteImageFromDataUrl({
          tenantId: access.tenantDbId,
          slug,
          dataUrl,
          kind: `gallery-${item?.projectId || "upload"}`,
        })
      : dataUrl;

    if (!isPersistable(url)) {
      return { success: false, error: "Upload failed", index };
    }

    const photo = normalizeGalleryPhoto(
      {
        id: item?.id,
        src: url,
        thumbnail: url,
        alt: item?.alt,
        projectId: item?.projectId,
        kind: item?.kind,
        persisted: /^https?:\/\//i.test(url),
      },
      index,
    );

    return { success: true, photo, index };
  });

  const photos = uploaded.filter((r) => r?.success && r.photo).map((r) => r.photo);
  const failed = uploaded.filter((r) => !r?.success).length;

  return Response.json({
    success: photos.length > 0,
    data: { photos, failed, total: items.length },
    error: photos.length ? undefined : "All uploads failed. Check storage configuration.",
  });
}

function isPersistable(url) {
  const value = String(url || "").trim();
  return value.startsWith("data:image/") || /^https?:\/\//i.test(value);
}
