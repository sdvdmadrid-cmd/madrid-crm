"use client";

import { useState, useCallback, useEffect } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

export function useAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/appointments");
      const data = await getJsonOrThrow(res, "Failed to fetch appointments");
      setAppointments(data || []);
    } catch (err) {
      console.error("[useAppointments] fetch error", err);
      setError(err.message || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

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
        setAppointments((prev) => [result.data, ...prev]);
        return result.data;
      } catch (err) {
        const message = err.message || "Failed to create appointment";
        setError(message);
        throw err;
      }
    },
    []
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
        setAppointments((prev) =>
          prev.map((apt) => (apt._id === id ? result.data : apt))
        );
        return result.data;
      } catch (err) {
        const message = err.message || "Failed to update appointment";
        setError(message);
        throw err;
      }
    },
    []
  );

  const remove = useCallback(
    async (id) => {
      setError("");
      try {
        await apiFetch(`/api/appointments/${id}`, {
          method: "DELETE",
        });
        setAppointments((prev) => prev.filter((apt) => apt._id !== id));
      } catch (err) {
        const message = err.message || "Failed to delete appointment";
        setError(message);
        throw err;
      }
    },
    []
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
