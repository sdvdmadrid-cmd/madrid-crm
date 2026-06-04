/**
 * Execute workspace agent actions on the client (Website Builder bridge, navigation, CRM, etc.)
 */

export async function executeWorkspaceActions(actions = [], helpers = {}) {
  const summaries = [];
  const { applyWebsitePatches, navigate, showNotice, apiFetch, getJsonOrThrow } = helpers;

  for (const action of actions) {
    const type = String(action?.type || "").trim();
    const payload = action?.payload && typeof action.payload === "object" ? action.payload : {};
    const summary = String(action?.summary || "").trim();

    if (type === "website.applyPatches" && applyWebsitePatches) {
      applyWebsitePatches(payload);
      summaries.push(summary || "Applied website draft updates");
      continue;
    }

    if (type === "navigate" && payload.path && navigate) {
      navigate(String(payload.path));
      summaries.push(summary || `Opened ${payload.path}`);
      continue;
    }

    if (type === "crm.updateLeadStatus" && apiFetch && getJsonOrThrow && payload.leadId) {
      try {
        const res = await apiFetch(`/api/lead-inbox/leads/${encodeURIComponent(payload.leadId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: payload.status || "contacted" }),
        });
        await getJsonOrThrow(res, "Lead update failed");
        summaries.push(summary || "Updated lead status");
      } catch (err) {
        summaries.push(err?.message || "Lead update failed");
      }
      continue;
    }

    if (type === "crm.batchUpdateLeadStatus" && apiFetch && getJsonOrThrow) {
      const ids = Array.isArray(payload.leadIds) ? payload.leadIds : [];
      const status = payload.status || "contacted";
      let ok = 0;
      for (const leadId of ids) {
        try {
          const res = await apiFetch(`/api/lead-inbox/leads/${encodeURIComponent(leadId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          await getJsonOrThrow(res, "Lead update failed");
          ok += 1;
        } catch {
          /* continue other leads */
        }
      }
      summaries.push(summary || `Marked ${ok} lead(s) as ${status}`);
      continue;
    }

    if (type === "notice" && showNotice) {
      showNotice(summary || payload.message || "Done");
      summaries.push(summary || "Notification shown");
      continue;
    }

    if (type === "ops.openUrl" && payload.url && typeof window !== "undefined") {
      const url = String(payload.url).startsWith("/")
        ? `${window.location.origin}${payload.url}`
        : String(payload.url);
      window.open(url, "_blank", "noopener,noreferrer");
      summaries.push(summary || "Opened document");
      continue;
    }
  }

  return summaries;
}

export function mergeAgentSummaries(serverSummaries = [], clientSummaries = []) {
  return [...new Set([...serverSummaries, ...clientSummaries].filter(Boolean))];
}
