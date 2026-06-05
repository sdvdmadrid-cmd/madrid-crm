import { randomUUID } from "crypto";
import { detectWorkspaceIntents, intentRequiresConfirmation } from "./intents.js";
import { executeWebsiteIntents } from "./website-executor.js";
import { executeCrmIntents } from "./crm-executor.js";
import { buildWorkspaceAgentSystemPrompt } from "./prompt.js";
import { parseAgentStructuredResponse } from "./parse-response.js";
import { runAiCompletion } from "../ai-service.js";
import {
  runOperationsAgent,
  shouldRunOperationsAgent,
} from "./operations-agent.js";
import { executeWorkspaceTool } from "./tools/execute.js";
import { resolveAgentMessage } from "./slash-commands.js";
import { generateHeroCopyPatches } from "./hero-copy.js";
import { patchRequiresConfirmation, isHeroOnlyPatch } from "./patch-risk.js";
import { normalizeAgentSummaries } from "./client-executor.js";

function safeSummaries(value) {
  return normalizeAgentSummaries(value);
}

function buildPlanFromExecutor(result, title = "Confirm changes") {
  return {
    id: randomUUID(),
    title,
    steps: result.planSteps?.length ? result.planSteps : ["Apply suggested workspace changes"],
    actions: result.actions,
    patches: result.patches,
    summaries: safeSummaries(result.summaries),
  };
}

function mergeAnswer(parts = []) {
  return parts.filter(Boolean).join("\n\n").trim();
}

function uniqueIntents(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

/**
 * Run workspace agent turn (deterministic and/or AI).
 */
export async function runWorkspaceAgentTurn({
  request,
  tenantId,
  userId,
  message,
  history = [],
  context,
  snapshot = null,
  agentMode = true,
  confirmPlan = null,
  language = "en",
}) {
  const rawPrompt = String(message || "").trim();
  if (!rawPrompt && !confirmPlan) {
    return { error: "Message is required.", status: 400 };
  }

  if (confirmPlan && typeof confirmPlan === "object") {
    if (confirmPlan.type === "ai_tool" && confirmPlan.toolName) {
      const result = await executeWorkspaceTool(
        confirmPlan.toolName,
        { ...(confirmPlan.args || {}), confirmed: true },
        {
          tenantDbId: tenantId,
          userId,
          role: context?.authUser?.role || context?.role,
        },
      );
      const summaries = Array.isArray(confirmPlan.summaries)
        ? confirmPlan.summaries
        : result.preview
          ? [result.preview]
          : [];
      if (!result.ok) {
        return {
          answer: result.error || result.message || "Action was not completed.",
          actions: [],
          summaries: [],
          plan: null,
          requiresConfirmation: false,
          patches: null,
          source: "confirmed_ai_tool",
        };
      }
      return {
        answer: mergeAnswer([
          "Action completed.",
          summaries.length ? `**Done:**\n${summaries.map((s) => `• ${s}`).join("\n")}` : "",
          result.invoice?.invoiceNumber
            ? `Invoice ${result.invoice.invoiceNumber} created.`
            : "",
          result.estimate?.estimateNumber
            ? `Estimate ${result.estimate.estimateNumber} created.`
            : "",
        ]),
        actions: result.actions || [],
        summaries,
        plan: null,
        requiresConfirmation: false,
        patches: null,
        source: "confirmed_ai_tool",
      };
    }

    const actions = Array.isArray(confirmPlan.actions) ? confirmPlan.actions : [];
    const summaries = Array.isArray(confirmPlan.summaries)
      ? confirmPlan.summaries
      : actions.map((a) => a.summary).filter(Boolean);
    return {
      answer: mergeAnswer([
        "Changes applied as confirmed.",
        summaries.length ? `**Done:**\n${summaries.map((s) => `• ${s}`).join("\n")}` : "",
      ]),
      actions,
      summaries,
      plan: null,
      requiresConfirmation: false,
      patches: confirmPlan.patches || null,
      source: "confirmed_plan",
    };
  }

  const resolved = resolveAgentMessage(rawPrompt);
  if (resolved.helpText) {
    return {
      answer: resolved.helpText,
      actions: [],
      summaries: [],
      plan: null,
      requiresConfirmation: false,
      patches: null,
      source: "slash_help",
    };
  }

  const prompt = resolved.message || rawPrompt;
  const pageId = context?.page?.id || "general";
  const intents = uniqueIntents(detectWorkspaceIntents(prompt), resolved.intentIds);
  const onWebsite = pageId === "website_builder" && snapshot;
  const crm = context?.crm || null;

  if (
    shouldRunOperationsAgent({
      message: prompt,
      agentMode,
      pageId,
    })
  ) {
    const ops = await runOperationsAgent({
      request,
      tenantId,
      userId,
      message: prompt,
      history,
      context,
      language,
    });
    if (ops.handled) {
      return {
        answer: ops.answer,
        actions: agentMode ? ops.actions || [] : [],
        summaries: safeSummaries(ops.summaries),
        plan: ops.plan || null,
        requiresConfirmation: Boolean(ops.requiresConfirmation),
        patches: null,
        source: ops.source || "operations_agent",
      };
    }
  }

  const crmIntentIds = intents.filter((id) => id.startsWith("crm."));
  if (crmIntentIds.length > 0 || pageId === "lead_inbox") {
    const crmExec = executeCrmIntents(
      crmIntentIds.length ? crmIntentIds : intents,
      { message: prompt, crm },
    );
    if (crmExec.actions.length > 0 || crmExec.answerParts.length > 0) {
      const needsConfirm = crmExec.actions.some((a) => a.type === "crm.batchUpdateLeadStatus");
      if (needsConfirm && agentMode) {
        return {
          answer: mergeAnswer([
            mergeAnswer(crmExec.answerParts),
            "Tap **Apply plan** to update lead statuses.",
          ]),
          plan: {
            id: randomUUID(),
            title: "Update lead statuses",
            steps: crmExec.summaries,
            actions: crmExec.actions,
            patches: null,
            summaries: safeSummaries(crmExec.summaries),
          },
          actions: [],
          summaries: safeSummaries(crmExec.summaries),
          requiresConfirmation: true,
          patches: null,
          source: "crm_plan",
        };
      }
      return {
        answer: mergeAnswer(crmExec.answerParts),
        actions: agentMode ? crmExec.actions : [],
        summaries: safeSummaries(crmExec.summaries),
        plan: null,
        requiresConfirmation: false,
        patches: null,
        source: "crm",
      };
    }
  }

  if (onWebsite && intents.includes("website.improve_hero") && agentMode) {
    try {
      const hero = await generateHeroCopyPatches({
        request,
        tenantId,
        userId,
        snapshot,
        context,
        userMessage: prompt,
        language,
      });
      if (hero.patches) {
        const actions = [{ type: "website.applyPatches", payload: hero.patches }];
        return {
          answer: mergeAnswer([
            hero.answer,
            `**Done:**\n${hero.summaries.map((s) => `• ${s}`).join("\n")}`,
          ]),
          actions,
          summaries: safeSummaries(hero.summaries),
          plan: null,
          requiresConfirmation: false,
          patches: hero.patches,
          source: "hero_copy",
        };
      }
    } catch (error) {
      return {
        error: error?.message || "Hero copy generation failed",
        status: Number(error?.status || 502),
        aiCode: error?.aiCode || error?.code,
      };
    }
  }

  if (onWebsite && intents.length > 0) {
    const websiteIntents = intents.filter((id) => id.startsWith("website."));
    const exec = executeWebsiteIntents(websiteIntents, { context, snapshot });
    const needsConfirm =
      agentMode && intentRequiresConfirmation(websiteIntents) && exec.actions.length > 0;

    if (needsConfirm) {
      const plan = buildPlanFromExecutor(exec);
      return {
        answer: mergeAnswer([
          mergeAnswer(exec.answerParts),
          `**Plan:** ${plan.title}\n${plan.steps.map((s) => `• ${s}`).join("\n")}\n\nTap **Apply plan** to proceed.`,
        ]),
        plan,
        actions: [],
        summaries: safeSummaries(exec.summaries),
        requiresConfirmation: true,
        patches: null,
        source: "deterministic_plan",
      };
    }

    if (exec.actions.length > 0 || exec.summaries.length > 0 || exec.answerParts.length > 0) {
      return {
        answer: mergeAnswer([
          mergeAnswer(exec.answerParts),
          exec.summaries.length
            ? `**Done:**\n${exec.summaries.map((s) => `• ${s}`).join("\n")}`
            : "",
        ]),
        actions: agentMode ? exec.actions : [],
        summaries: safeSummaries(exec.summaries),
        plan: null,
        requiresConfirmation: false,
        patches: exec.patches,
        source: "deterministic",
      };
    }
  }

  const crossPageHints = [];
  if (intents.includes("schedule.parse") && pageId !== "scheduling") {
    crossPageHints.push({
      answer:
        "Open Calendar and describe the job — I'll parse date, client, and location.",
      actions: [{ type: "navigate", payload: { path: "/calendar" }, summary: "Opened Calendar" }],
      summaries: ["Opened Calendar"],
    });
  }
  if (crossPageHints.length === 1) {
    return {
      ...crossPageHints[0],
      plan: null,
      requiresConfirmation: false,
      patches: null,
      source: "navigate",
      actions: agentMode ? crossPageHints[0].actions : [],
    };
  }

  if (!agentMode) {
    return {
      answer: "Enable Agent Mode for automatic changes.",
      actions: [],
      summaries: [],
      plan: null,
      requiresConfirmation: false,
      patches: null,
      source: "agent_disabled",
    };
  }

  const systemPrompt = buildWorkspaceAgentSystemPrompt({ context, snapshot, language });
  const historyMessages = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-16)
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 4000),
    }));

  let raw = "";
  try {
    const response = await runAiCompletion({
      request,
      tenantId,
      userId,
      feature: "workspace_agent",
      modelTier: "mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: prompt },
      ],
      maxTokens: 1200,
      temperature: 0.35,
    });
    raw = response.text || "";
  } catch (error) {
    return {
      error: error?.message || "AI request failed",
      status: Number(error?.status || 502),
      aiCode: error?.aiCode || error?.code,
    };
  }

  const parsed = parseAgentStructuredResponse(raw);
  let actions = parsed.actions;
  const patches = parsed.patches || null;

  if (!actions.length && patches) {
    actions = [{ type: "website.applyPatches", payload: patches, summary: "Applied website updates" }];
  }

  const needsConfirm =
    parsed.requiresConfirmation ||
    (patches && patchRequiresConfirmation(patches) && !isHeroOnlyPatch(patches));

  if (needsConfirm && actions.length > 0) {
    return {
      answer: parsed.answer,
      plan: {
        id: randomUUID(),
        title: parsed.plan?.title || "Confirm AI changes",
        steps: parsed.plan?.steps?.length
          ? parsed.plan.steps
          : actions.map((a) => a.summary || a.type).filter(Boolean),
        actions,
        patches,
        summaries: safeSummaries(parsed.summaries),
      },
      actions: [],
      summaries: safeSummaries(parsed.summaries),
      requiresConfirmation: true,
      patches: null,
      source: "ai_plan",
    };
  }

  return {
    answer: parsed.answer,
    actions,
    summaries: safeSummaries(parsed.summaries),
    plan: null,
    requiresConfirmation: false,
    patches,
    source: "ai",
  };
}
