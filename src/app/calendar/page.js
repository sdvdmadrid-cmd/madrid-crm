"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import "@/i18n";

const initialAppointment = {
  title: "",
  clientName: "",
  date: "",
  time: "",
  status: "Scheduled",
};

export default function CalendarPage() {
  const { t } = useTranslation();
  const [appointments, setAppointments] = useState([]);
  const [form, setForm] = useState(initialAppointment);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/appointments");
      const data = await getJsonOrThrow(res, t("calendar.errors.fetch"));
      setAppointments(data);
    } catch (err) {
      console.error("[calendar] failed to fetch appointments", err);
      setError(err.message || t("calendar.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const resetForm = () => {
    setForm(initialAppointment);
    setSelectedId(null);
  };

  const saveAppointment = async () => {
    try {
      const method = selectedId ? "PATCH" : "POST";
      const url = selectedId
        ? `/api/appointments/${selectedId}`
        : "/api/appointments";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await getJsonOrThrow(res, t("calendar.errors.save"));
      setAppointments(
        selectedId
          ? appointments.map((item) =>
              item._id === selectedId ? result.data : item,
            )
          : [result.data, ...appointments],
      );
      resetForm();
    } catch (err) {
      console.error("[calendar] failed to save appointment", err);
      setError(err.message || t("calendar.errors.saveFallback"));
    }
  };

  const editAppointment = (item) => {
    setForm({
      title: item.title || "",
      clientName: item.clientName || "",
      date: item.date || "",
      time: item.time || "",
      status: item.status || "Scheduled",
    });
    setSelectedId(item._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteAppointment = async (id) => {
    try {
      const res = await apiFetch(`/api/appointments/${id}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(res, t("calendar.errors.delete"));
      setAppointments(appointments.filter((item) => item._id !== id));
      if (selectedId === id) resetForm();
    } catch (err) {
      console.error("[calendar] failed to delete appointment", err);
      setError(err.message || t("calendar.errors.deleteFallback"));
    }
  };

  return (
    <main
      style={{
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "32px", margin: 0 }}>{t("calendar.title")}</h1>
          <p style={{ margin: "10px 0 0 0", color: "#555" }}>
            {t("calendar.description")}
          </p>
        </div>
      </header>

      {error && (
        <div style={{ marginTop: "20px", color: "#b00020" }}>{error}</div>
      )}
      {loading && (
        <div style={{ marginTop: "20px", color: "#333" }}>
          {t("calendar.loading")}
        </div>
      )}

      <section
        style={{
          marginTop: "24px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "16px",
          background: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {selectedId
            ? t("calendar.formTitleEdit")
            : t("calendar.formTitleNew")}
        </h2>
        <div style={{ display: "grid", gap: "12px" }}>
          <input
            placeholder={t("calendar.placeholders.title")}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <input
            placeholder={t("calendar.placeholders.clientName")}
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          >
            <option value="Scheduled">
              {t("calendar.statusOptions.Scheduled")}
            </option>
            <option value="Confirmed">
              {t("calendar.statusOptions.Confirmed")}
            </option>
            <option value="Completed">
              {t("calendar.statusOptions.Completed")}
            </option>
            <option value="Cancelled">
              {t("calendar.statusOptions.Cancelled")}
            </option>
          </select>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={saveAppointment}
              style={{
                padding: "12px 20px",
                borderRadius: "10px",
                border: "none",
                background: "black",
                color: "white",
                cursor: "pointer",
              }}
            >
              {selectedId
                ? t("calendar.buttons.update")
                : t("calendar.buttons.save")}
            </button>
            <button
              type="button"
              onClick={resetForm}
              style={{
                padding: "12px 20px",
                borderRadius: "10px",
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
              }}
            >
              {t("calendar.buttons.clear")}
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>{t("calendar.agendaTitle")}</h2>
        <div style={{ display: "grid", gap: "14px" }}>
          {appointments.map((item) => (
            <div
              key={item._id}
              style={{
                padding: "18px",
                border: "1px solid #ddd",
                borderRadius: "14px",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>{item.title}</h3>
                  <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                    {item.clientName} ·{" "}
                    {t(`calendar.statusOptions.${item.status}`) || item.status}
                  </p>
                  <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                    {item.date} {item.time}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => editAppointment(item)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#0b69ff",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    {t("calendar.buttons.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteAppointment(item._id)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#d32f2f",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    {t("calendar.buttons.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {appointments.length === 0 && !loading && (
            <p style={{ color: "#777" }}>{t("calendar.empty")}</p>
          )}
        </div>
      </section>
    </main>
  );
}
