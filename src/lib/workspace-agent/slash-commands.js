/**
 * Slash commands for the workspace assistant (/audit, /seo, …).
 */

export const SLASH_COMMAND_HELP = [
  { cmd: "/help", desc: "List all commands" },
  { cmd: "/audit", desc: "Analyze website completeness and issues" },
  { cmd: "/seo", desc: "Improve SEO title and meta description" },
  { cmd: "/services", desc: "Apply landscaping service catalog (Website Builder)" },
  { cmd: "/pricing", desc: "Remove pricing from service cards" },
  { cmd: "/gallery", desc: "Gallery loading guidance and fixes" },
  { cmd: "/hero [tone]", desc: "Rewrite hero headline & subheadline (premium, friendly, bold)" },
  { cmd: "/leads", desc: "Summarize new leads in your inbox" },
  { cmd: "/leads contacted", desc: "Mark all new leads as contacted" },
];

const COMMANDS = {
  help: {
    intentIds: [],
    buildMessage: () => "",
    helpOnly: true,
  },
  audit: {
    intentIds: ["website.analyze"],
    buildMessage: () => "Analyze my website and list what is missing or broken.",
  },
  seo: {
    intentIds: ["website.improve_seo"],
    buildMessage: () => "Improve SEO title and meta description for my public website.",
  },
  services: {
    intentIds: ["website.landscaping_catalog"],
    buildMessage: () => "Add the full landscaping service catalog to my website.",
  },
  pricing: {
    intentIds: ["website.remove_pricing"],
    buildMessage: () => "Remove all pricing from public service cards.",
  },
  gallery: {
    intentIds: ["website.fix_gallery"],
    buildMessage: () => "Fix gallery image loading on my public website.",
  },
  hero: {
    intentIds: ["website.improve_hero"],
    buildMessage: (args) => {
      const tone = String(args || "").trim() || "premium";
      return `Redesign the website hero section with a ${tone} tone — update headline, subheadline, and CTA.`;
    },
  },
  leads: {
    intentIds: ["crm.summarize_leads"],
    buildMessage: (args) => {
      const sub = String(args || "").trim().toLowerCase();
      if (sub === "contacted" || sub === "contact") {
        return "Mark all new website leads as contacted.";
      }
      return "Summarize my new leads and what I should do next.";
    },
    extraIntents: (args) => {
      const sub = String(args || "").trim().toLowerCase();
      if (sub === "contacted" || sub === "contact") {
        return ["crm.mark_new_contacted"];
      }
      return [];
    },
  },
};

export function formatSlashCommandHelp() {
  const lines = SLASH_COMMAND_HELP.map((row) => `• **${row.cmd}** — ${row.desc}`);
  return `**Slash commands**\n${lines.join("\n")}`;
}

/**
 * @returns {{ command: string, args: string, expandedMessage: string, intentIds: string[], helpText?: string } | null}
 */
export function parseSlashCommand(input) {
  const raw = String(input || "").trim();
  if (!raw.startsWith("/")) return null;

  const body = raw.slice(1).trim();
  if (!body) return null;

  const spaceIdx = body.indexOf(" ");
  const command = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1).trim();

  const def = COMMANDS[command];
  if (!def) {
    return {
      command,
      args,
      expandedMessage: raw,
      intentIds: [],
      unknown: true,
    };
  }

  if (def.helpOnly) {
    return {
      command,
      args,
      expandedMessage: "",
      intentIds: [],
      helpText: formatSlashCommandHelp(),
    };
  }

  const extra = def.extraIntents ? def.extraIntents(args) : [];
  return {
    command,
    args,
    expandedMessage: def.buildMessage(args),
    intentIds: [...def.intentIds, ...extra],
  };
}

export function resolveAgentMessage(input) {
  const slash = parseSlashCommand(input);
  if (!slash) {
    return { message: input, slash: null, intentIds: [] };
  }
  if (slash.helpText) {
    return { message: "", slash, intentIds: [], helpText: slash.helpText };
  }
  if (slash.unknown) {
    return {
      message: input,
      slash,
      intentIds: [],
      helpText: `Unknown command \`/${slash.command}\`. Type **/help** for available commands.`,
    };
  }
  return {
    message: slash.expandedMessage || input,
    slash,
    intentIds: slash.intentIds || [],
  };
}
