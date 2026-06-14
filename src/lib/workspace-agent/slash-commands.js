/**
 * Slash commands for the workspace assistant (/audit, /seo, …).
 */

export const SLASH_COMMAND_HELP = [
  { cmd: "/help", desc: "List all commands" },
  { cmd: "/build", desc: "Generate complete website from your industry template (Website Builder)" },
  { cmd: "/hero [tone]", desc: "Rewrite hero headline & subheadline (premium, friendly, bold)" },
  { cmd: "/images [count]", desc: "Generate AI gallery images (e.g. /images 6)" },
  { cmd: "/testimonials", desc: "Add customer testimonials section" },
  { cmd: "/premium", desc: "Apply premium look — colors, trust badges, hero tone" },
  { cmd: "/estimate …", desc: "Create estimate from natural language (action mode)" },
  { cmd: "/invoice …", desc: "Create invoice from job or client (action mode)" },
  { cmd: "/schedule …", desc: "Book calendar appointment (action mode)" },
  { cmd: "/job …", desc: "Create a job/project (action mode)" },
  { cmd: "/client …", desc: "Create or find a client (action mode)" },
  { cmd: "/search …", desc: "Search clients, jobs, invoices, estimates" },
  { cmd: "/payroll …", desc: "Payroll reports, run payroll, employee lookup" },
  { cmd: "/paid …", desc: "Record payment on an invoice" },
  { cmd: "/subscription", desc: "Explain trial and subscription status" },
  { cmd: "/duplicate", desc: "Find and remove duplicate payroll employees" },
  { cmd: "/calendar …", desc: "Show schedule for today, this week, or date range" },
  { cmd: "/contract …", desc: "Generate contract from estimate" },
  { cmd: "/unpaid", desc: "List unpaid invoices" },
  { cmd: "/audit", desc: "Analyze website completeness and issues" },
  { cmd: "/seo", desc: "Improve SEO title and meta description" },
  { cmd: "/services", desc: "Apply industry service catalog (Website Builder)" },
  { cmd: "/pricing", desc: "Remove pricing from service cards" },
  { cmd: "/gallery", desc: "Gallery loading guidance and fixes" },
  { cmd: "/leads", desc: "Summarize new leads in your inbox" },
  { cmd: "/leads contacted", desc: "Mark all new leads as contacted" },
];

const COMMANDS = {
  help: {
    intentIds: [],
    buildMessage: () => "",
    helpOnly: true,
  },
  build: {
    intentIds: ["website.build_full"],
    buildMessage: () => "Build my complete professional website from scratch with AI.",
  },
  audit: {
    intentIds: ["website.analyze"],
    buildMessage: () => "Analyze my website and list what is missing or broken.",
  },
  seo: {
    intentIds: ["website.improve_seo"],
    buildMessage: (args) =>
      args
        ? `Improve SEO for my website: ${args}`
        : "Improve SEO title and meta description for my public website.",
  },
  services: {
    intentIds: ["website.industry_services"],
    buildMessage: () => "Add the full industry service catalog to my website.",
  },
  pricing: {
    intentIds: ["website.remove_pricing"],
    buildMessage: () => "Remove all pricing from public service cards.",
  },
  gallery: {
    intentIds: ["website.fix_gallery"],
    buildMessage: () => "Fix gallery image loading on my public website.",
  },
  images: {
    intentIds: ["website.generate_gallery_images"],
    buildMessage: (args) => {
      const count = String(args || "3").trim() || "3";
      return `Generate ${count} AI gallery images for my business portfolio.`;
    },
  },
  testimonials: {
    intentIds: ["website.add_testimonials"],
    buildMessage: () => "Add a testimonials section with customer reviews.",
  },
  premium: {
    intentIds: ["website.premium_look", "website.improve_hero"],
    buildMessage: () =>
      "Make my website look more premium — update hero copy, colors, and trust badges.",
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
  estimate: {
    intentIds: [],
    buildMessage: (args) =>
      args
        ? `Create an estimate: ${args}`
        : "Help me create an estimate from the services catalog.",
  },
  invoice: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Create an invoice: ${args}` : "List unpaid invoices and help me bill a job.",
  },
  schedule: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Schedule an appointment: ${args}` : "What is on my calendar tomorrow?",
  },
  job: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Create a job: ${args}` : "Create a new job for a client.",
  },
  client: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Find or create client: ${args}` : "Search my clients.",
  },
  search: {
    intentIds: [],
    buildMessage: (args) => (args ? `Search the CRM for: ${args}` : "Search clients, jobs, and invoices."),
  },
  payroll: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Payroll action: ${args}` : "Show payroll summary and any errors this period.",
  },
  paid: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Record invoice payment: ${args}` : "Help me record a payment on an open invoice.",
  },
  subscription: {
    intentIds: [],
    buildMessage: () => "Explain my subscription and trial status.",
  },
  duplicate: {
    intentIds: [],
    buildMessage: (args) => {
      const sub = String(args || "").trim().toLowerCase();
      if (sub === "delete" || sub === "remove" || sub === "clean") {
        return "Find and delete safe duplicate payroll employees.";
      }
      return "Find duplicate payroll employees.";
    },
  },
  calendar: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Show calendar schedule: ${args}` : "What jobs and appointments are scheduled this week?",
  },
  contract: {
    intentIds: [],
    buildMessage: (args) =>
      args ? `Create contract: ${args}` : "Create a contract from the latest estimate.",
  },
  unpaid: {
    intentIds: [],
    buildMessage: () => "Show all unpaid invoices and outstanding balances.",
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
