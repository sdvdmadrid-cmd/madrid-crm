/**
 * Pure helpers for public lead map markup (pin + optional rectangle area).
 */

export function normalizeMapMarkup(raw) {
  if (!raw || typeof raw !== "object") return null;

  const lat = Number(raw.lat ?? raw.latitude);
  const lng = Number(raw.lng ?? raw.longitude);
  const hasPin =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  let areaSqFt = Number(raw.areaSqFt ?? raw.area_sq_ft);
  if (!Number.isFinite(areaSqFt) || areaSqFt <= 0) areaSqFt = null;
  else areaSqFt = Math.round(Math.min(areaSqFt, 5_000_000));

  let bounds = null;
  const b = raw.bounds;
  if (b && typeof b === "object") {
    const north = Number(b.north);
    const south = Number(b.south);
    const east = Number(b.east);
    const west = Number(b.west);
    if (
      [north, south, east, west].every((n) => Number.isFinite(n)) &&
      north > south &&
      Math.abs(east - west) > 0
    ) {
      bounds = { north, south, east, west };
    }
  }

  if (!hasPin && !bounds && !areaSqFt) return null;

  return {
    lat: hasPin ? lat : null,
    lng: hasPin ? lng : null,
    areaSqFt,
    bounds,
    source: String(raw.source || "lead-map").slice(0, 40),
  };
}

/** Rough rectangle area in sq ft from lat/lng bounds (equirectangular). */
export function approxAreaSqFtFromBounds(bounds) {
  if (!bounds) return null;
  const { north, south, east, west } = bounds;
  const midLat = ((north + south) / 2) * (Math.PI / 180);
  const latFt = Math.abs(north - south) * 364000;
  const lngFt = Math.abs(east - west) * 365000 * Math.cos(midLat);
  const area = latFt * lngFt;
  if (!Number.isFinite(area) || area <= 0) return null;
  return Math.round(Math.min(area, 5_000_000));
}
