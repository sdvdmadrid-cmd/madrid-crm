const WEBSITE_ONLY_SLASH = new Set([
  "audit",
  "seo",
  "services",
  "pricing",
  "gallery",
  "hero",
  "images",
  "testimonials",
  "premium",
  "build",
]);

const OPS_SLASH = new Set([
  "estimate",
  "invoice",
  "schedule",
  "job",
  "client",
  "search",
  "payroll",
  "paid",
  "subscription",
  "calendar",
  "contract",
  "duplicate",
  "unpaid",
]);

const WEBSITE_ONLY_TEXT =
  /\b(website|site|seo|hero|gallery|testimonial|landing page|web page)\b/i;

const OPS_TRIGGER =
  /\b(create|schedule|book|find|search|show|list|send|invoice|estimate|contract|appointment|job|client|unpaid|tomorrow|payroll|paycheck|pay stub|w-?2|1099|withholding|run payroll|labor cost|profit|project p&l|reschedule|duplicate|subscription|trial|crew|convert|payment|record payment|approve|calendar|this week|next thursday|next tuesday|delete employee|remove employee)\b/i;

export function shouldRunOperationsAgent({ message, agentMode, pageId }) {
  if (!agentMode) return false;

  const text = String(message || "").trim();
  if (!text || text.startsWith("/help")) return false;

  if (text.startsWith("/")) {
    const cmd = text.slice(1).split(/\s/)[0].toLowerCase();
    if (OPS_SLASH.has(cmd)) return true;
    if (pageId === "website_builder" && WEBSITE_ONLY_SLASH.has(cmd)) return false;
    return true;
  }

  if (pageId === "website_builder" && WEBSITE_ONLY_TEXT.test(text) && !OPS_TRIGGER.test(text)) {
    return false;
  }

  return true;
}
