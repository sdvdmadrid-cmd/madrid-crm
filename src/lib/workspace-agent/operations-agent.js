import "server-only";

import { getOpenAiClient } from "@/lib/openai-client";
import { runAiCompletion } from "@/lib/ai-service";
import { WORKSPACE_OPERATIONS_TOOLS } from "./tools/definitions.js";
import { executeWorkspaceTool } from "./tools/execute.js";
import { buildOperationsAgentSystemPrompt } from "./operations-prompt.js";

export { shouldRunOperationsAgent } from "./operations-intent.js";

const MAX_TOOL_TURNS = 8;

/**
 * Run tool-calling operations agent. Returns { handled, answer, actions, summaries }.
 */
export async function runOperationsAgent({
  request,
  tenantId,
  userId,
  message,
  history = [],
  context,
  language = "en",
}) {
  const client = getOpenAiClient();
  if (!client) {
    return {
      handled: true,
      answer: "AI is not configured. Set OPENAI_API_KEY to enable action mode.",
      actions: [],
      summaries: [],
    };
  }

  const systemPrompt = buildOperationsAgentSystemPrompt({ context, language });
  const historyMessages = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 3000),
    }));

  const messages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: String(message).slice(0, 4000) },
  ];

  const ctx = { tenantDbId: tenantId, userId, role: context?.role };
  const collectedActions = [];
  const summaries = [];
  let lastToolResults = [];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
    const completion = await client.chat.completions.create(
      {
        model: process.env.OPENAI_MODEL_DEFAULT || "gpt-4.1-mini",
        messages,
        tools: WORKSPACE_OPERATIONS_TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 900,
      },
      { timeout: Number(process.env.AI_REQUEST_TIMEOUT_MS || 18000) },
    );

    const choice = completion.choices?.[0]?.message;
    if (!choice) break;

    messages.push(choice);

    const toolCalls = choice.tool_calls || [];
    if (!toolCalls.length) {
      const answer = String(choice.content || "").trim();
      return {
        handled: true,
        answer: answer || formatFallbackAnswer(lastToolResults, summaries),
        actions: collectedActions,
        summaries,
        source: "operations_agent",
      };
    }

    for (const call of toolCalls) {
      const name = call.function?.name || "";
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }

      let result;
      try {
        result = await executeWorkspaceTool(name, args, ctx);
      } catch (err) {
        result = { ok: false, error: err?.message || "Tool failed" };
      }

      if (result?.requiresConfirmation) {
        return {
          handled: true,
          answer: result.message || "Confirmation required.",
          requiresConfirmation: true,
          plan: {
            type: "ai_tool",
            toolName: name,
            args,
            title: "Confirm action",
            summaries: result.preview ? [result.preview] : [],
          },
          actions: [],
          summaries: result.preview ? [result.preview] : [],
          source: "operations_agent",
        };
      }

      if (Array.isArray(result.actions)) {
        collectedActions.push(...result.actions);
      }
      if (result.ok && result.invoice) {
        summaries.push(`Created invoice ${result.invoice.invoiceNumber}`);
      }
      if (result.ok && result.estimate) {
        summaries.push(`Created estimate ${result.estimate.estimateNumber}`);
      }
      if (result.ok && result.job) summaries.push(`Created job ${result.job.title}`);
      if (result.ok && result.appointment) {
        summaries.push(`Scheduled ${result.appointment.date} ${result.appointment.time}`);
      }
      if (result.ok && result.contract) summaries.push("Contract saved");
      if (result.ok && result.client?.name) summaries.push(`Client ${result.client.name}`);

      lastToolResults.push({ tool: name, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }

  const fallback = await runAiCompletion({
    request,
    tenantId,
    userId,
    feature: "workspace_operations_summary",
    modelTier: "mini",
    messages: [
      { role: "system", content: "Summarize tool results for the contractor in 2-4 sentences." },
      {
        role: "user",
        content: JSON.stringify({ userMessage: message, results: lastToolResults }),
      },
    ],
    maxTokens: 400,
    temperature: 0.2,
  }).catch(() => ({ text: "" }));

  return {
    handled: true,
    answer: fallback.text || formatFallbackAnswer(lastToolResults, summaries),
    actions: collectedActions,
    summaries,
    source: "operations_agent",
  };
}

function formatFallbackAnswer(toolResults, summaries) {
  const safeSummaries = Array.isArray(summaries) ? summaries : [];
  if (safeSummaries.length) {
    return `Done:\n${safeSummaries.map((s) => `• ${s}`).join("\n")}`;
  }
  const errors = (Array.isArray(toolResults) ? toolResults : [])
    .filter((t) => t.result && !t.result.ok)
    .map((t) => t.result.error)
    .filter(Boolean);
  if (errors.length) return errors[0];

  const last = Array.isArray(toolResults) ? toolResults[toolResults.length - 1] : null;
  const lastResult = last?.result;
  if (lastResult?.ok && Array.isArray(lastResult.clients) && !lastResult.clients.length) {
    return "No matching clients found. Add the client in Clients or provide a clearer name, email, or phone.";
  }
  if (lastResult?.ok && lastResult.client == null && last?.tool === "createEstimate") {
    return "I could not match a client for that estimate. Create the client first or use the exact name on file.";
  }

  return "I could not complete that action. Try rephrasing with the client name and service details.";
}
