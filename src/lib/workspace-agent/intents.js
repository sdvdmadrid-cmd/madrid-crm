/**
 * Natural-language intent detection for workspace agent commands.
 */

const INTENT_RULES = [
  {
    id: "website.build_full",
    patterns: [
      /build\s+(my\s+)?(whole\s+)?(site|website)/i,
      /create\s+(my\s+)?(whole\s+)?(site|website)/i,
      /generate\s+(my\s+)?(whole\s+)?(site|website|full)/i,
      /make\s+(me\s+)?a\s+(new\s+)?website/i,
      /design\s+(my\s+)?website/i,
      /from\s+scratch/i,
      /single\s+prompt/i,
    ],
  },
  {
    id: "website.premium_look",
    patterns: [
      /more\s+premium/i,
      /look\s+premium/i,
      /high[\s-]end/i,
      /luxury/i,
      /upscale/i,
      /professional\s+look/i,
      /modern\s+design/i,
    ],
  },
  {
    id: "website.conversion_homepage",
    patterns: [
      /conversion/i,
      /convert\s+more\s+leads/i,
      /more\s+leads/i,
      /better\s+homepage/i,
      /lead[\s-]focused/i,
      /focus(ed)?\s+on\s+(leads|bookings|calls)/i,
    ],
  },
  {
    id: "website.add_testimonials",
    patterns: [
      /add\s+(a\s+)?testimonial/i,
      /testimonial\s+section/i,
      /customer\s+review/i,
      /social\s+proof/i,
      /add\s+reviews/i,
    ],
  },
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
    id: "website.industry_services",
    patterns: [
      /add\s+(my\s+)?services/i,
      /default\s+services/i,
      /industry\s+services/i,
      /service\s+list/i,
      /populate\s+services/i,
    ],
  },
  {
    id: "website.landscaping_catalog",
    patterns: [
      /landscap(ing)?\s+(service|categor)/i,
      /add\s+(landscap|lawn|hardscape)/i,
      /landscaping\s+catalog/i,
    ],
  },
  {
    id: "website.generate_gallery_images",
    patterns: [
      /generate\s+\d*\s*(gallery|portfolio|project)\s*(images?|photos?)/i,
      /create\s+\d*\s*(gallery|portfolio)\s*(images?|photos?)/i,
      /\d+\s+gallery\s+(images?|photos?)/i,
      /before\s+and\s+after\s+(gallery|images?)/i,
      /gallery\s+with\s+before/i,
    ],
  },
  {
    id: "website.generate_hero_image",
    patterns: [
      /generate\s+(a\s+)?(new\s+)?hero\s*(image|photo|banner)?/i,
      /create\s+(a\s+)?hero\s*(image|photo|banner)/i,
      /new\s+hero\s*(image|photo)/i,
    ],
  },
  {
    id: "website.replace_hero_image",
    patterns: [
      /replace\s+(the\s+)?hero\s*(image|photo|banner)?/i,
      /swap\s+(the\s+)?hero/i,
      /change\s+(the\s+)?hero\s*(image|photo|banner)/i,
      /update\s+(the\s+)?hero\s*(image|photo)/i,
    ],
  },
  {
    id: "website.remove_gallery_image",
    patterns: [
      /remove\s+(this\s+)?(gallery\s+)?(image|photo|picture)/i,
      /delete\s+(the\s+)?(second|third|fourth|\d+(?:st|nd|rd|th)?)\s*(gallery\s+)?(image|photo)/i,
      /delete\s+(the\s+)?(image|photo)\s+(in\s+)?(the\s+)?gallery/i,
      /remove\s+(the\s+)?(image|photo)\s+(that\s+shows|showing|of)/i,
    ],
  },
  {
    id: "website.remove_hero_image",
    patterns: [
      /remove\s+(the\s+)?hero\s*(image|photo)?/i,
      /delete\s+(the\s+)?hero\s*(image|photo)?/i,
      /clear\s+(the\s+)?hero\s*(image|slot)?/i,
    ],
  },
  {
    id: "website.match_brand_colors",
    patterns: [
      /brand\s+colou?rs?/i,
      /match\s+(the\s+)?(brand|theme|color)/i,
      /change\s+(all\s+)?buttons/i,
      /button\s+colou?rs?/i,
      /theme\s+colou?r/i,
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
      /rewrite\s+.*headline/i,
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
    patterns: [
      /\bseo\b/i,
      /search\s+engine/i,
      /meta\s+(title|description)/i,
      /local\s+seo/i,
      /rank\s+(in|for|on)/i,
    ],
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
    "website.industry_services",
    "website.remove_pricing",
    "website.build_full",
    "website.generate_gallery_images",
  ]);
  return intentIds.some((id) => major.has(id));
}
