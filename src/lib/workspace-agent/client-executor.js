/**
 * Execute workspace agent actions on the client (Website Builder bridge, navigation, CRM, etc.)
 */

/** Coerce unknown summary payloads to a string array (dev-only shape warnings). */
export function normalizeAgentSummaries(value, label = "summaries") {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (value != null && typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.warn(
      `[workspace-agent] Expected ${label} to be an array, received:`,
      typeof value,
      value,
    );
  }
  return [];
}

export async function executeWorkspaceActions(actions = [], helpers = {}) {
  const summaries = [];
  const {
    applyWebsitePatches,
    navigate,
    showNotice,
    apiFetch,
    getJsonOrThrow,
    runGenerateFull,
    generateHeroImage,
    generateHeroImagesBatch,
    generateGalleryImages,
    removeGalleryImage,
    removeHeroImage,
  } = helpers;
  const safeActions = Array.isArray(actions) ? actions : [];

  for (let actionIndex = 0; actionIndex < safeActions.length; actionIndex += 1) {
    const action = safeActions[actionIndex];
    const type = String(action?.type || "").trim();
    const payload = action?.payload && typeof action.payload === "object" ? action.payload : {};
    const summary = String(action?.summary || "").trim();

    if (type === "website.generateFull" && runGenerateFull) {
      await runGenerateFull();
      summaries.push(summary || "Generated complete website");
      continue;
    }

    if (type === "website.generateHeroImage" && generateHeroImage) {
      const heroBatch = [];
      while (
        actionIndex < safeActions.length &&
        String(safeActions[actionIndex]?.type || "").trim() === "website.generateHeroImage"
      ) {
        const item = safeActions[actionIndex];
        heroBatch.push(
          item?.payload && typeof item.payload === "object" ? item.payload : {},
        );
        actionIndex += 1;
      }
      actionIndex -= 1;

      try {
        if (generateHeroImagesBatch && heroBatch.length > 1) {
          const count = await generateHeroImagesBatch(heroBatch);
          summaries.push(summary || `Generated ${count} hero image(s)`);
        } else {
          for (const heroPayload of heroBatch) {
            await generateHeroImage(heroPayload);
          }
          summaries.push(
            summary ||
              (heroBatch.length > 1
                ? `Generated ${heroBatch.length} hero image(s)`
                : "Generated hero image"),
          );
        }
      } catch (err) {
        summaries.push(err?.message || "Hero image generation failed");
      }
      continue;
    }

    if (type === "website.generateGalleryImages" && generateGalleryImages) {
      try {
        const count = await generateGalleryImages(payload);
        summaries.push(summary || `Generated ${count} gallery image(s)`);
      } catch (err) {
        summaries.push(err?.message || "Gallery image generation failed");
      }
      continue;
    }

    if (type === "website.removeGalleryImage" && removeGalleryImage) {
      removeGalleryImage(payload);
      summaries.push(summary || "Removed gallery image");
      continue;
    }

    if (type === "website.removeHeroImage" && removeHeroImage) {
      removeHeroImage(payload);
      summaries.push(summary || "Removed hero image");
      continue;
    }

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
  const server = normalizeAgentSummaries(serverSummaries, "serverSummaries");
  const client = normalizeAgentSummaries(clientSummaries, "clientSummaries");
  return [...new Set([...server, ...client])];
}
