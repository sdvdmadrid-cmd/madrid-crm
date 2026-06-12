"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

/**
 * @param {{ from?: string, to?: string }} range
 */
export function useCalendarEvents(range = {}) {
  const from = range.from || "";
  const to = range.to || "";
  const [jobs, setJobs] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generationRef = useRef(0);

  const fetchEvents = useCallback(async () => {
    if (!from || !to) {
      setJobs([]);
      setEstimates([]);
      return;
    }
    const generation = ++generationRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      const res = await apiFetch(`/api/calendar/events?${params.toString()}`);
      const payload = await getJsonOrThrow(res, "Failed to load calendar events");
      if (generation !== generationRef.current) return;
      const data = payload?.data || payload;
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      setEstimates(Array.isArray(data?.estimates) ? data.estimates : []);
    } catch (err) {
      if (generation !== generationRef.current) return;
      setError(err.message || "Failed to load calendar events");
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { jobs, estimates, loading, error, refetch: fetchEvents };
}
