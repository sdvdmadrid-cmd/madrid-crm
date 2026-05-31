/**
 * CRM / lead inbox actions for the workspace agent (server-side planning).
 */

function findNewLeads(crm) {
  return (crm?.leads || []).filter((l) => l.status === "new");
}

export function executeCrmIntents(intentIds, { message, crm }) {
  const actions = [];
  const summaries = [];
  const answerParts = [];
  const newLeads = findNewLeads(crm);

  for (const intentId of intentIds) {
    if (intentId === "crm.summarize_leads") {
      if (!crm?.leads?.length) {
        answerParts.push("No website leads in your inbox yet. Leads appear when homeowners submit your quote form.");
      } else if (newLeads.length === 0) {
        answerParts.push(
          `You have **${crm.total}** lead(s) in the inbox; none are marked **new**. Latest statuses are up to date.`,
        );
      } else {
        const lines = newLeads.slice(0, 8).map((l) => {
          const svc = l.serviceNeeded ? ` — ${l.serviceNeeded}` : "";
          return `• **${l.name || "Unknown"}**${svc}${l.budgetRange ? ` (${l.budgetRange})` : ""}`;
        });
        answerParts.push(
          `**${newLeads.length} new lead(s)** need follow-up:\n${lines.join("\n")}${newLeads.length > 8 ? `\n…and ${newLeads.length - 8} more.` : ""}`,
        );
      }
      summaries.push(`Summarized ${newLeads.length} new lead(s)`);
    }

    if (intentId === "crm.mark_new_contacted") {
      if (newLeads.length === 0) {
        answerParts.push("No **new** leads to mark as contacted.");
      } else {
        const ids = newLeads.map((l) => l.id).filter(Boolean);
        actions.push({
          type: "crm.batchUpdateLeadStatus",
          payload: { leadIds: ids, status: "contacted" },
          summary: `Marked ${ids.length} lead(s) as contacted`,
        });
        summaries.push(`Marked ${ids.length} new lead(s) as contacted`);
        answerParts.push(
          `I'll mark **${ids.length}** new lead(s) as contacted. Open Lead Inbox to convert any into clients.`,
        );
      }
      actions.push({
        type: "navigate",
        payload: { path: "/lead-inbox" },
        summary: "Opened Lead Inbox",
      });
    }
  }

  if (
    !intentIds.length &&
    /\b(mark|set).*(contacted|contact)\b/i.test(String(message || "")) &&
    /\b(lead|inbox)\b/i.test(String(message || ""))
  ) {
    return executeCrmIntents(["crm.mark_new_contacted"], { message, crm });
  }

  if (
    !intentIds.length &&
    /\b(new\s+)?leads?\b/i.test(String(message || "")) &&
    /\b(summar|list|show|how many)\b/i.test(String(message || ""))
  ) {
    return executeCrmIntents(["crm.summarize_leads"], { message, crm });
  }

  return { actions, summaries, answerParts };
}
