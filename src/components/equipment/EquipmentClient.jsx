"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/dashboard/page.module.css";

const initialForm = {
  name: "",
  equipmentType: "",
  hourlyRate: "",
  purchaseCost: "",
  maintenanceSchedule: "",
  nextServiceDate: "",
  status: "active",
};

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v || 0),
  );
}

export default function EquipmentClient() {
  const [equipment, setEquipment] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [assignForm, setAssignForm] = useState({
    equipmentId: "",
    jobId: "",
    hours: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [eqRes, jobsRes] = await Promise.all([
        apiFetch("/api/equipment"),
        apiFetch("/api/jobs?limit=50"),
      ]);
      const eqPayload = await eqRes.json();
      const jobsPayload = await jobsRes.json();
      if (!eqRes.ok || !eqPayload.success) throw new Error(eqPayload.error || "Load failed");
      setEquipment(eqPayload.data || []);
      const jobRows = jobsPayload.data || jobsPayload.jobs || jobsPayload || [];
      setJobs(Array.isArray(jobRows) ? jobRows : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createEquipment = async () => {
    setNotice("");
    if (!form.name.trim()) {
      setError("Equipment name is required.");
      return;
    }
    const res = await apiFetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hourlyRate: Number(form.hourlyRate || 0),
        purchaseCost: Number(form.purchaseCost || 0),
      }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Save failed");
      return;
    }
    setNotice("Equipment added.");
    setForm(initialForm);
    await load();
  };

  const assignToJob = async () => {
    setNotice("");
    if (!assignForm.equipmentId || !assignForm.jobId) {
      setError("Select equipment and a job to assign.");
      return;
    }
    const selected = equipment.find((row) => row.id === assignForm.equipmentId);
    const res = await apiFetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign",
        equipmentId: assignForm.equipmentId,
        jobId: assignForm.jobId,
        hours: Number(assignForm.hours || 0),
        hourlyRate: selected?.hourlyRate || 0,
        notes: assignForm.notes,
      }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Assignment failed");
      return;
    }
    setNotice("Equipment assigned to job.");
    setAssignForm({ equipmentId: "", jobId: "", hours: "", notes: "" });
  };

  if (loading) {
    return (
      <main className={styles.page} data-testid="equipment-page">
        <p>Loading equipment…</p>
      </main>
    );
  }

  return (
    <main className={styles.page} data-testid="equipment-page">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Operations</p>
          <h1 className={styles.title}>Equipment</h1>
          <p className={styles.subtitle}>Inventory, maintenance, and job assignments</p>
        </div>
        <Link href="/jobs" className={styles.secondaryAction}>← Jobs</Link>
      </header>

      <section className={styles.panel}>
        <h2>Add equipment</h2>
        <div className={styles.metricsGrid}>
          <input
            placeholder="Name (e.g. Mini excavator)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            placeholder="Type"
            value={form.equipmentType}
            onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))}
          />
          <input
            placeholder="Hourly rate"
            type="number"
            value={form.hourlyRate}
            onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
          />
          <input
            placeholder="Purchase cost"
            type="number"
            value={form.purchaseCost}
            onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))}
          />
          <input
            placeholder="Maintenance schedule"
            value={form.maintenanceSchedule}
            onChange={(e) => setForm((f) => ({ ...f, maintenanceSchedule: e.target.value }))}
          />
          <input
            type="date"
            value={form.nextServiceDate}
            onChange={(e) => setForm((f) => ({ ...f, nextServiceDate: e.target.value }))}
          />
          <button type="button" className={styles.primaryAction} onClick={createEquipment}>
            Save equipment
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Assign to job</h2>
        <div className={styles.metricsGrid}>
          <select
            value={assignForm.equipmentId}
            onChange={(e) => setAssignForm((f) => ({ ...f, equipmentId: e.target.value }))}
          >
            <option value="">Select equipment</option>
            {equipment.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} ({money(row.hourlyRate)}/hr)
              </option>
            ))}
          </select>
          <select
            value={assignForm.jobId}
            onChange={(e) => setAssignForm((f) => ({ ...f, jobId: e.target.value }))}
          >
            <option value="">Select job</option>
            {jobs.map((job) => (
              <option key={job.id || job._id} value={job.id || job._id}>
                {job.title || job.clientName}
              </option>
            ))}
          </select>
          <input
            placeholder="Hours on job"
            type="number"
            value={assignForm.hours}
            onChange={(e) => setAssignForm((f) => ({ ...f, hours: e.target.value }))}
          />
          <button type="button" className={styles.coPrimaryAction} onClick={assignToJob}>
            Assign
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Inventory ({equipment.length})</h2>
        {equipment.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Rate/hr</th>
                <th>Next service</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.equipmentType || "—"}</td>
                  <td>{money(row.hourlyRate)}</td>
                  <td>{row.nextServiceDate || "—"}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No equipment yet. Add your first asset above.</p>
        )}
      </section>

      {notice ? <p>{notice}</p> : null}
      {error ? <p>{error}</p> : null}
    </main>
  );
}
