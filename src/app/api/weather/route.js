import { getAuthenticatedTenantContext, unauthenticatedResponse } from "@/lib/tenant";
import { resolveWeatherDay } from "@/lib/weather-service";
import { isValidYmd } from "@/lib/local-date";

export async function GET(request) {
  const { authenticated } = await getAuthenticatedTenantContext(request);
  if (!authenticated) return unauthenticatedResponse();

  const { searchParams } = new URL(request.url);
  const location = (searchParams.get("location") || "").trim();
  const date = (searchParams.get("date") || "").trim();

  if (!location || !date) {
    return new Response(
      JSON.stringify({ error: "location and date are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!isValidYmd(date)) {
    return new Response(
      JSON.stringify({ error: "date must be in YYYY-MM-DD format" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data, cache, error } = await resolveWeatherDay(location, date);
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Cache": cache || "MISS",
    },
  });
}
