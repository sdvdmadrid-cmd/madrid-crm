const OPS_TRIGGER =
  /\b(create|schedule|book|find|search|show|list|send|invoice|estimate|contract|appointment|job|client|unpaid|tomorrow)\b/i;

export function shouldRunOperationsAgent({ message, agentMode, pageId }) {
  if (!agentMode) return false;
  const text = String(message || "").trim();
  if (!text || text.startsWith("/help")) return false;
  if (text.startsWith("/") && /^(audit|seo|services|pricing|gallery|hero)\b/i.test(text.slice(1))) {
    return false;
  }
  if (pageId === "website_builder" && /\b(website|site|seo|hero|gallery|pricing)\b/i.test(text)) {
    return false;
  }
  return OPS_TRIGGER.test(text);
}
