import "server-only";

import { getOpenAiClient } from "@/lib/openai-client";
import { uploadWebsiteImageFromDataUrl } from "@/lib/website-media-storage";

export const WEBSITE_IMAGE_MODEL = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim();
export const WEBSITE_IMAGE_SIZE = String(process.env.OPENAI_IMAGE_SIZE || "1024x1024").trim();
export const WEBSITE_IMAGE_DRAFT_SIZE = String(
  process.env.OPENAI_IMAGE_DRAFT_SIZE || "512x512",
).trim();
export const WEBSITE_IMAGE_BATCH_CONCURRENCY = Math.max(
  1,
  Math.min(6, Number(process.env.WEBSITE_IMAGE_BATCH_CONCURRENCY || 6)),
);
const IMAGE_MAX_RETRIES = Math.max(0, Math.min(3, Number(process.env.WEBSITE_IMAGE_RETRY_LIMIT || 2)));

function assertTrustedOpenAiImageUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("AI image URL is invalid");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("AI image URL must use HTTPS");
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = [
    "oaidalleapiprodscus.blob.core.windows.net",
    "cdn.openai.com",
    "files.openaiusercontent.com",
  ];

  if (!allowedHosts.includes(host)) {
    throw new Error("AI image URL host is not allowed");
  }

  return parsed.toString();
}

export async function urlToDataUrl(imageUrl) {
  const trustedUrl = assertTrustedOpenAiImageUrl(imageUrl);
  const response = await fetch(trustedUrl, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error("Unable to download AI image");
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 8 * 1024 * 1024) {
    throw new Error("AI image payload too large");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("AI image payload too large");
  }

  const mimeType = String(response.headers.get("content-type") || "image/png");
  if (!mimeType.toLowerCase().startsWith("image/")) {
    throw new Error("AI image payload is not an image");
  }

  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export function buildWebsiteImagePrompt({ pack, companyName, safePrompt, styleHint = "realistic" }) {
  const style = String(styleHint || "realistic").trim().slice(0, 40);
  return [
    pack.imagePromptPrefix,
    `Business: ${companyName || pack.label}.`,
    safePrompt,
    `Style: ${style}.`,
    "Photorealistic, sharp focus, natural lighting, professional composition.",
    "No logos, no text, no watermarks, no people's faces close-up.",
    `CRITICAL: Show ONLY ${pack.label} work — correct tools, materials, and setting.`,
  ].join(" ");
}

function isRetryableImageError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const msg = String(error?.message || "").toLowerCase();
  return (
    status === 429 ||
    status >= 500 ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up")
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAiImageGenerate(client, { prompt, size }, timeoutMs) {
  const baseBody = {
    model: WEBSITE_IMAGE_MODEL,
    prompt,
    size,
  };

  let lastError;
  for (let attempt = 0; attempt <= IMAGE_MAX_RETRIES; attempt += 1) {
    try {
      try {
        return await client.images.generate(
          { ...baseBody, response_format: "b64_json" },
          { timeout: timeoutMs },
        );
      } catch (formatError) {
        const formatMsg = String(formatError?.message || "").toLowerCase();
        if (
          formatMsg.includes("response_format") ||
          formatMsg.includes("unknown parameter")
        ) {
          return await client.images.generate(baseBody, { timeout: timeoutMs });
        }
        throw formatError;
      }
    } catch (error) {
      lastError = error;
      if (attempt >= IMAGE_MAX_RETRIES || !isRetryableImageError(error)) {
        throw error;
      }
      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError || new Error("AI image generation failed");
}

export async function generateWebsiteImage({
  tenantId,
  websiteSlug,
  pack,
  companyName,
  prompt,
  style = "realistic",
  mediaKind = "hero",
  draft = true,
}) {
  const safePrompt = String(prompt || "").trim();
  if (!safePrompt) {
    throw new Error("Image prompt is required");
  }

  const useDraftSize = draft !== false;
  const imageSize = useDraftSize ? WEBSITE_IMAGE_DRAFT_SIZE : WEBSITE_IMAGE_SIZE;
  const imageTimeoutMs = useDraftSize ? 20_000 : 50_000;
  const finalPrompt = buildWebsiteImagePrompt({
    pack,
    companyName,
    safePrompt,
    styleHint: style,
  });

  const client = getOpenAiClient();
  const response = await callOpenAiImageGenerate(
    client,
    { prompt: finalPrompt, size: imageSize },
    imageTimeoutMs,
  );

  const first = response?.data?.[0] || null;
  if (!first) {
    throw new Error("AI did not return an image");
  }

  let imageDataUrl = "";
  if (first.b64_json) {
    imageDataUrl = `data:image/png;base64,${first.b64_json}`;
  } else if (first.url) {
    imageDataUrl = await urlToDataUrl(String(first.url));
  }

  if (!imageDataUrl.startsWith("data:image/")) {
    throw new Error("AI did not return a valid image payload");
  }

  const kind = String(mediaKind || "hero").trim() === "gallery" ? "gallery" : "hero";
  let imageUrl = "";

  // Draft previews skip storage upload — persist on save via data URLs (much faster).
  if (!useDraftSize && websiteSlug) {
    imageUrl = await uploadWebsiteImageFromDataUrl({
      tenantId,
      slug: websiteSlug,
      dataUrl: imageDataUrl,
      kind,
    });
  }

  const persistedSrc =
    imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : imageDataUrl;

  return {
    imageDataUrl: persistedSrc,
    imageUrl: persistedSrc,
    persisted: persistedSrc.startsWith("http"),
    alt: safePrompt.slice(0, 160),
    mediaKind: kind,
  };
}

/** Generate multiple website images in parallel on the server (one cold start). */
export async function generateWebsiteImagesBatch({
  tenantId,
  websiteSlug,
  pack,
  companyName,
  prompts = [],
  style = "realistic",
  mediaKind = "gallery",
  draft = true,
  concurrency = WEBSITE_IMAGE_BATCH_CONCURRENCY,
}) {
  const list = (Array.isArray(prompts) ? prompts : [])
    .map((entry) => String(entry?.prompt || entry || "").trim())
    .filter(Boolean);

  if (list.length === 0) return [];

  const results = new Array(list.length);
  let nextIndex = 0;
  const poolSize = Math.max(1, Math.min(concurrency, list.length));

  async function worker() {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      const prompt = list[index];
      try {
        results[index] = {
          ok: true,
          promptIndex: index,
          ...(await generateWebsiteImage({
            tenantId,
            websiteSlug,
            pack,
            companyName,
            prompt,
            style,
            mediaKind,
            draft,
          })),
        };
      } catch (error) {
        results[index] = {
          ok: false,
          promptIndex: index,
          error: error instanceof Error ? error.message : "Image generation failed",
        };
      }
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results.filter((row) => row?.ok === true);
}
