/**
 * Landscaping & hardscaping service catalog for public sites and lead forms.
 */

export const LANDSCAPING_INDUSTRY_KEY = "landscaping_hardscaping";

/** Full dropdown list for Request a Quote (landscaping companies only). */
export const LANDSCAPING_REQUEST_SERVICE_OPTIONS = [
  "Lawn Maintenance",
  "Weekly Lawn Service",
  "Mulch Installation",
  "Rock Installation",
  "Sod Installation",
  "New Lawn Installation",
  "Overseeding",
  "Aeration",
  "Spring Cleanup",
  "Fall Cleanup",
  "Shrub Trimming",
  "Bush Removal",
  "Tree Planting",
  "Tree Removal",
  "Landscape Design",
  "Landscape Renovation",
  "Drainage Solutions",
  "Grading",
  "French Drain Installation",
  "Downspout Extensions",
  "Retaining Walls",
  "Paver Patio Installation",
  "Walkways",
  "Fire Pits",
  "Outdoor Lighting",
  "Hardscape Repair",
  "Snow Removal",
  "Commercial Landscaping",
  "HOA Maintenance",
  "Irrigation",
  "Other",
];

const LANDSCAPING_SERVICE_DESCRIPTIONS = {
  "Lawn Maintenance":
    "Reliable mowing, edging, and turf care to keep your lawn healthy and sharp.",
  "Weekly Lawn Service":
    "Scheduled weekly visits for consistent curb appeal all season.",
  "Mulch Installation":
    "Fresh mulch, crisp bed edges, and weed control for polished planting beds.",
  "Rock Installation":
    "Decorative rock and stone ground cover with proper fabric and drainage prep.",
  "Sod Installation":
    "Premium sod with grading and prep for an instant, healthy lawn.",
  "New Lawn Installation":
    "Complete lawn establishment from soil prep through final sod or seed.",
  Overseeding:
    "Thicken thin turf and restore color with professional overseeding.",
  Aeration:
    "Core aeration to relieve compaction and improve root growth.",
  "Spring Cleanup":
    "Seasonal bed refresh, debris removal, and prep for spring growth.",
  "Fall Cleanup":
    "Leaf removal, bed cutback, and winter-ready property cleanup.",
  "Shrub Trimming":
    "Shape and maintain shrubs for clean lines and healthy growth.",
  "Bush Removal":
    "Safe removal of overgrown or unwanted shrubs and stumps.",
  "Tree Planting":
    "Select and install trees sized for your property and long-term health.",
  "Tree Removal":
    "Professional tree removal with attention to safety and property protection.",
  "Landscape Design":
    "Custom outdoor living concepts, plant palettes, and layout plans.",
  "Landscape Renovation":
    "Transform tired yards with full redesigns and phased upgrades.",
  "Drainage Solutions":
    "Move water away from structures with swales, drains, and grading.",
  Grading:
    "Site grading for proper slope, drainage, and lawn performance.",
  "French Drain Installation":
    "Buried drain systems to protect foundations and low areas.",
  "Downspout Extensions":
    "Route roof runoff safely away from beds and foundations.",
  "Retaining Walls":
    "Structural and decorative walls for slopes and outdoor levels.",
  "Paver Patio Installation":
    "Premium paver patios with base prep built for Wisconsin freeze-thaw.",
  Walkways:
    "Paver and stone walkways that connect your outdoor spaces.",
  "Fire Pits":
    "Custom fire features for year-round gathering spaces.",
  "Outdoor Lighting":
    "Low-voltage lighting for safety, ambiance, and architectural accent.",
  "Hardscape Repair":
    "Reset, relevel, and restore settled pavers and stone work.",
  "Snow Removal":
    "Commercial and residential snow clearing when you need it.",
  "Commercial Landscaping":
    "Grounds maintenance and enhancements for businesses and retail sites.",
  "HOA Maintenance":
    "Reliable HOA landscape programs with clear communication and schedules.",
  Irrigation:
    "Irrigation tune-ups, repairs, and seasonal system care.",
  Other:
    "Tell us about your project — we provide custom estimates for unique jobs.",
};

/** @param {string} name */
function landscapingDescription(name) {
  return (
    LANDSCAPING_SERVICE_DESCRIPTIONS[name] ||
    "Professional outdoor work tailored to your property. Every project starts with a free estimate."
  );
}

export function isLandscapingIndustryKey(industryKey) {
  const key = String(industryKey || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    key === LANDSCAPING_INDUSTRY_KEY ||
    key === "landscaping" ||
    key === "landscape" ||
    key === "lawn_care" ||
    key === "hardscaping"
  );
}

export function getLandscapingRequestServiceOptions() {
  return [...LANDSCAPING_REQUEST_SERVICE_OPTIONS];
}

/** Services shown on the public site (no pricing — custom estimates only). */
export function buildLandscapingDefaultServices() {
  return LANDSCAPING_REQUEST_SERVICE_OPTIONS.filter((name) => name !== "Other").map(
    (name) => ({
      name,
      description: landscapingDescription(name),
    }),
  );
}

export function getRequestServiceOptionsForIndustry(industryKey) {
  if (isLandscapingIndustryKey(industryKey)) {
    return getLandscapingRequestServiceOptions();
  }
  return null;
}
