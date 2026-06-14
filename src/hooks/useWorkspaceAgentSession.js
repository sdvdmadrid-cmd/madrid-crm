"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "fieldbase-workspace-agent-v2";
const MAX_MESSAGES = 80;

function storageKey(tenantId) {
  const tid = String(tenantId || "default").trim() || "default";
  return `${STORAGE_PREFIX}:${tid}`;
}

function loadSession(tenantId) {
  if (typeof window === "undefined") return { messages: [], agentMode: true };
  try {
    const raw =
      window.localStorage.getItem(storageKey(tenantId)) ||
      window.sessionStorage.getItem("fieldbase-workspace-agent-session-v1");
    if (!raw) return { messages: [], agentMode: true };
    const parsed = JSON.parse(raw);
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      agentMode: parsed.agentMode !== false,
    };
  } catch {
    return { messages: [], agentMode: true };
  }
}

function saveSession(tenantId, messages, agentMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(tenantId),
      JSON.stringify({
        messages: messages.slice(-MAX_MESSAGES),
        agentMode,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    /* ignore quota */
  }
}

export function useWorkspaceAgentSession(tenantId) {
  const [messages, setMessages] = useState([]);
  const [agentMode, setAgentMode] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const session = loadSession(tenantId);
    setMessages(session.messages);
    setAgentMode(session.agentMode);
    setHydrated(true);
  }, [tenantId]);

  useEffect(() => {
    if (!hydrated) return;
    saveSession(tenantId, messages, agentMode);
  }, [messages, agentMode, hydrated, tenantId]);

  const appendMessage = useCallback((role, content, meta = {}) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      content: String(content || "").trim(),
      meta,
      at: Date.now(),
    };
    if (!entry.content) return null;
    setMessages((prev) => [...prev, entry].slice(-MAX_MESSAGES));
    return entry;
  }, []);

  const clearSession = useCallback(() => {
    setMessages([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey(tenantId));
    }
  }, [tenantId]);

  return {
    messages,
    setMessages,
    agentMode,
    setAgentMode,
    appendMessage,
    clearSession,
    hydrated,
  };
}
