import { enforceSameOriginForMutation } from "@/lib/request-security";
import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";
import { resolveWeatherBatch, weatherPairKey } from "@/lib/weather-service";

export async function POST(request) {
  const csrfBlock = enforceSameOriginForMutation(request);
  if (csrfBlock) return csrfBlock;

  const { authenticated } = await getAuthenticatedTenantContext(request);
  if (!authenticated) return unauthenticatedResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const items = Array.isArray(body?.items) ? body.items.slice(0, 24) : [];
  const results = await resolveWeatherBatch(items);

  const clientResults = {};
  for (const item of items) {
    const location = String(item?.location || "").trim();
    const date = String(item?.date || "").trim();
    const key = weatherPairKey(location, date);
    if (key in results) {
      clientResults[`${location.toLowerCase().trim()}::${date}`] = results[key];
    }
  }

  return new Response(JSON.stringify({ results: clientResults }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
