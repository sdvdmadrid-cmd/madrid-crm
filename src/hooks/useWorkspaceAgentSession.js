"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "fieldbase-workspace-agent-session-v1";
const MAX_MESSAGES = 40;

function loadSession() {
  if (typeof window === "undefined") return { messages: [], agentMode: true };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
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

function saveSession(messages, agentMode) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
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

export function useWorkspaceAgentSession() {
  const [messages, setMessages] = useState([]);
  const [agentMode, setAgentMode] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const session = loadSession();
    setMessages(session.messages);
    setAgentMode(session.agentMode);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSession(messages, agentMode);
  }, [messages, agentMode, hydrated]);

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
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

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
