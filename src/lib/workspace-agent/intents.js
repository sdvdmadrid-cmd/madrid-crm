/**
 * Natural-language intent detection for workspace agent commands.
 */

const INTENT_RULES = [
  {
    id: "website.remove_pricing",
    patterns: [
      /remove\s+(all\s+)?pricing/i,
      /hide\s+pric/i,
      /no\s+pricing/i,
      /strip\s+pric/i,
      /without\s+pric/i,
    ],
  },
  {
    id: "website.landscaping_catalog",
    patterns: [
      /landscap(ing)?\s+(service|categor)/i,
      /add\s+(landscap|lawn|hardscape)/i,
      /service\s+catalog/i,
      /more\s+services/i,
      /quote\s+form\s+services/i,
    ],
  },
  {
    id: "website.fix_gallery",
    patterns: [
      /fix\s+.*gallery/i,
      /gallery\s+.*(load|broken|image|photo)/i,
      /broken\s+.*(image|photo|gallery)/i,
    ],
  },
  {
    id: "website.improve_hero",
    patterns: [
      /redesign\s+.*hero/i,
      /improve\s+.*hero/i,
      /hero\s+section/i,
      /better\s+headline/i,
    ],
  },
  {
    id: "website.improve_quote_form",
    patterns: [
      /quote\s+request/i,
      /request\s+(a\s+)?quote\s+form/i,
      /lead\s+form/i,
      /improve\s+.*form/i,
    ],
  },
  {
    id: "website.improve_seo",
    patterns: [/\bseo\b/i, /search\s+engine/i, /meta\s+(title|description)/i],
  },
  {
    id: "website.mobile_layout",
    patterns: [/mobile\s+layout/i, /responsive/i, /phone\s+view/i],
  },
  {
    id: "website.analyze",
    patterns: [
      /analyze\s+(my\s+)?(site|website)/i,
      /what.*(wrong|missing|improve)/i,
      /audit\s+(my\s+)?(site|website)/i,
    ],
  },
  {
    id: "crm.summary",
    patterns: [/crm\s+summary/i, /pipeline\s+summary/i],
  },
  {
    id: "crm.summarize_leads",
    patterns: [
      /summar(y|ize)\s+.*leads?/i,
      /new\s+leads?/i,
      /lead\s+inbox/i,
      /show\s+.*leads?/i,
    ],
  },
  {
    id: "crm.mark_new_contacted",
    patterns: [
      /mark\s+.*(new\s+)?leads?\s+.*contacted/i,
      /mark\s+all\s+new\s+.*contacted/i,
      /set\s+leads?\s+to\s+contacted/i,
    ],
  },
  {
    id: "schedule.parse",
    patterns: [/schedule\s+/i, /book\s+.*(appointment|job)/i],
  },
  {
    id: "estimate.draft",
    patterns: [/estimate\s+for/i, /draft\s+estimate/i],
  },
];

export function detectWorkspaceIntents(message) {
  const text = String(message || "").trim();
  if (!text) return [];

  const matched = [];
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      matched.push(rule.id);
    }
  }
  return [...new Set(matched)];
}

export function intentRequiresConfirmation(intentIds = []) {
  const major = new Set([
    "website.landscaping_catalog",
    "website.remove_pricing",
  ]);
  return intentIds.some((id) => major.has(id));
}
