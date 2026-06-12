"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

/**
 * @param {{ from?: string, to?: string }} [range] - YYYY-MM-DD bounds (inclusive) for calendar month loads
 */
export function useAppointments(range = {}) {
  const from = range.from || "";
  const to = range.to || "";
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasLoadedOnceRef = useRef(false);
  const fetchGenerationRef = useRef(0);

  const fetch = useCallback(async () => {
    const generation = ++fetchGenerationRef.current;
    const silent = hasLoadedOnceRef.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await apiFetch(`/api/appointments${qs}`);
      const data = await getJsonOrThrow(res, "Failed to fetch appointments");
      if (generation !== fetchGenerationRef.current) return;
      setAppointments(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      if (generation !== fetchGenerationRef.current) return;
      console.error("[useAppointments] fetch error", err);
      setError(err.message || "Failed to load appointments");
    } finally {
      if (generation === fetchGenerationRef.current) {
        if (!silent) setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [from, to]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const create = useCallback(
    async (appointmentData) => {
      setError("");
      try {
        const res = await apiFetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appointmentData),
        });
        const result = await getJsonOrThrow(res, "Failed to create appointment");
        const created = result.data;
        if (created?._id || created?.id) {
          setAppointments((prev) => {
            const id = created._id || created.id;
            if (prev.some((row) => (row._id || row.id) === id)) return prev;
            return [...prev, created];
          });
        }
        await fetch();
        return created;
      } catch (err) {
        const message = err.message || "Failed to create appointment";
        setError(message);
        throw err;
      }
    },
    [fetch],
  );

  const update = useCallback(
    async (id, appointmentData) => {
      setError("");
      try {
        const res = await apiFetch(`/api/appointments/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appointmentData),
        });
        const result = await getJsonOrThrow(res, "Failed to update appointment");
        const updated = result.data;
        if (updated?._id || updated?.id) {
          const id = updated._id || updated.id;
          setAppointments((prev) =>
            prev.map((row) => ((row._id || row.id) === id ? updated : row)),
          );
        }
        await fetch();
        return updated;
      } catch (err) {
        const message = err.message || "Failed to update appointment";
        setError(message);
        throw err;
      }
    },
    [fetch],
  );

  const remove = useCallback(
    async (id) => {
      setError("");
      try {
        await apiFetch(`/api/appointments/${id}`, {
          method: "DELETE",
        });
        await fetch();
      } catch (err) {
        const message = err.message || "Failed to delete appointment";
        setError(message);
        throw err;
      }
    },
    [fetch],
  );

  return {
    appointments,
    loading,
    error,
    fetch,
    create,
    update,
    remove,
  };
}
