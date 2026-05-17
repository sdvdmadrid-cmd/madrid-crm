"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-helpers";

function formatCurrency(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase(),
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminBillPaymentsOpsClient({ mode = "platform-owner" }) {
  const isTenantSafe = mode === "tenant-safe";
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState(null);
  const [queueRefs, setQueueRefs] = useState({});
  const [rowPending, setRowPending] = useState({});
  const [remittanceForm, setRemittanceForm] = useState({
    limit: 25,
    providerName: "",
    dryRun: true,
  });
  const [autopayDryRun, setAutopayDryRun] = useState(true);
  const [platformFeeForm, setPlatformFeeForm] = useState({
    chargeMonth: "",
    dryRun: true,
  });

  function buildTenantSafeData(rawData) {
    const recentTransactions = Array.isArray(rawData?.recentTransactions)
      ? rawData.recentTransactions
      : [];
    const recentQueue = recentTransactions
      .filter((row) => {
        const remittanceStatus = String(row?.remittanceStatus || "").toLowerCase();
        const transactionStatus = String(row?.status || "").toLowerCase();
        return (
          ["pending_submission", "submitted", "failed"].includes(remittanceStatus) ||
          ["processing", "paid", "failed"].includes(transactionStatus)
        );
      })
      .slice(0, 50)
      .map((row) => ({
        id: row.id,
        tenant_id: "self",
        transaction_id: row.id,
        provider_name: row.providerName || "-",
        status: row.remittanceStatus || "pending_submission",
        attempts: Number(row.attemptCount || 0),
        updated_at: row.updatedAt || row.createdAt,
        remittance_reference: row.remittanceReference || "",
      }));

    return {
      kpis: {
        pendingQueueCount: recentQueue.filter((row) => row.status === "pending_submission").length,
        failedQueueCount: recentQueue.filter((row) => row.status === "failed").length,
        processingTxCount: recentTransactions.filter(
          (row) => String(row?.status || "").toLowerCase() === "processing",
        ).length,
        paidTxCount: recentTransactions.filter(
          (row) => String(row?.status || "").toLowerCase() === "paid",
        ).length,
      },
      recentQueue,
      recentTransactions,
    };
  }

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(
        isTenantSafe
          ? "/api/bill-payments/bills"
          : "/api/admin/bill-payments/operations",
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load bill payment ops data");
      }
      setData(isTenantSafe ? buildTenantSafeData(payload.data || {}) : payload.data || null);
    } catch (loadError) {
      setError(loadError.message || "Unable to load bill payment ops data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function runOperation(operation, body) {
    if (isTenantSafe) {
      setError("This operation is restricted in tenant-safe mode.");
      return;
    }
    setRunning(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/admin/bill-payments/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Unable to run ${operation}`);
      }
      const summary = JSON.stringify(payload.data || {});
      setNotice(`${operation} completed: ${summary}`);
      await loadData();
    } catch (runError) {
      setError(runError.message || `Unable to run ${operation}`);
    } finally {
      setRunning(false);
    }
  }

  async function updateRemittance(queueRow, remittanceStatus) {
    const rowKey = `${queueRow.tenant_id}:${queueRow.transaction_id}:${remittanceStatus}`;
    setRowPending((current) => ({ ...current, [rowKey]: true }));
    setError("");
    setNotice("");

    try {
      const remittanceReference =
        queueRefs[queueRow.transaction_id] || queueRow.remittance_reference || "";
      const requestBody = isTenantSafe
        ? {
            remittanceStatus,
            remittanceReference,
          }
        : {
            transactionId: queueRow.transaction_id,
            tenantId: queueRow.tenant_id,
            remittanceStatus,
            remittanceReference,
          };
      const response = await apiFetch(
        isTenantSafe
          ? `/api/bill-payments/remittance/${queueRow.transaction_id}`
          : "/api/admin/bill-payments/remittance/update",
      {
        method: isTenantSafe ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to update remittance");
      }

      setNotice(`Remittance updated to ${remittanceStatus} for transaction ${queueRow.transaction_id}.`);
      await loadData();
    } catch (updateError) {
      setError(updateError.message || "Unable to update remittance");
    } finally {
      setRowPending((current) => ({ ...current, [rowKey]: false }));
    }
  }

  const kpis = useMemo(() => data?.kpis || {}, [data]);
  const helperTextClass = isTenantSafe ? "text-sm text-slate-600" : "text-sm text-slate-400";
  const refreshButtonClass = isTenantSafe
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
    : "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10";
  const errorClass = isTenantSafe
    ? "rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"
    : "rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200";
  const noticeClass = isTenantSafe
    ? "rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"
    : "rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200";
  const sectionClass = isTenantSafe
    ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    : "rounded-2xl border border-white/10 bg-slate-950/50 p-4";
  const sectionTitleClass = isTenantSafe ? "text-base font-semibold text-slate-900" : "text-base font-semibold text-white";
  const tableClass = isTenantSafe
    ? "min-w-full divide-y divide-slate-200 text-sm"
    : "min-w-full divide-y divide-white/10 text-sm";
  const tableHeadClass = isTenantSafe
    ? "text-left text-xs uppercase tracking-wide text-slate-600"
    : "text-left text-xs uppercase tracking-wide text-slate-400";
  const tableBodyClass = isTenantSafe
    ? "divide-y divide-slate-100 text-slate-800"
    : "divide-y divide-white/5 text-slate-200";
  const referenceInputClass = isTenantSafe
    ? "w-48 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
    : "w-48 rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-xs text-white";

  if (loading) {
    return <p className={helperTextClass}>Loading bill payments operations...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={helperTextClass}>
          {isTenantSafe
            ? "Tenant-safe operations for your own bill remittance and payment monitoring."
            : "End-to-end operations for remittance, AutoPay, and platform fees."}
        </p>
        <button
          type="button"
          onClick={loadData}
          className={refreshButtonClass}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className={errorClass}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={noticeClass}>
          {notice}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className={isTenantSafe ? "rounded-xl border border-slate-300 bg-slate-50 p-4" : "rounded-xl border border-white/10 bg-slate-950/60 p-4"}>
          <p className={isTenantSafe ? "text-xs uppercase tracking-wide text-slate-600" : "text-xs uppercase tracking-wide text-slate-400"}>Remittance Pending</p>
          <p className={isTenantSafe ? "mt-1 text-2xl font-semibold text-slate-900" : "mt-1 text-2xl font-semibold text-white"}>{Number(kpis.pendingQueueCount || 0)}</p>
        </div>
        <div className={isTenantSafe ? "rounded-xl border border-rose-300 bg-rose-50 p-4" : "rounded-xl border border-rose-500/20 bg-rose-500/10 p-4"}>
          <p className={isTenantSafe ? "text-xs uppercase tracking-wide text-rose-700" : "text-xs uppercase tracking-wide text-rose-200"}>Remittance Failed</p>
          <p className={isTenantSafe ? "mt-1 text-2xl font-semibold text-slate-900" : "mt-1 text-2xl font-semibold text-white"}>{Number(kpis.failedQueueCount || 0)}</p>
        </div>
        <div className={isTenantSafe ? "rounded-xl border border-amber-300 bg-amber-50 p-4" : "rounded-xl border border-amber-500/20 bg-amber-500/10 p-4"}>
          <p className={isTenantSafe ? "text-xs uppercase tracking-wide text-amber-700" : "text-xs uppercase tracking-wide text-amber-200"}>Transactions Processing</p>
          <p className={isTenantSafe ? "mt-1 text-2xl font-semibold text-slate-900" : "mt-1 text-2xl font-semibold text-white"}>{Number(kpis.processingTxCount || 0)}</p>
        </div>
        <div className={isTenantSafe ? "rounded-xl border border-emerald-300 bg-emerald-50 p-4" : "rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"}>
          <p className={isTenantSafe ? "text-xs uppercase tracking-wide text-emerald-700" : "text-xs uppercase tracking-wide text-emerald-200"}>Transactions Paid</p>
          <p className={isTenantSafe ? "mt-1 text-2xl font-semibold text-slate-900" : "mt-1 text-2xl font-semibold text-white"}>{Number(kpis.paidTxCount || 0)}</p>
        </div>
      </div>

      {!isTenantSafe ? (
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <h3 className="text-base font-semibold text-white">Run Remittance Queue</h3>
          <div className="mt-3 grid gap-2">
            <label className="text-xs text-slate-400">Limit</label>
            <input
              type="number"
              min="1"
              max="100"
              value={remittanceForm.limit}
              onChange={(event) =>
                setRemittanceForm((current) => ({
                  ...current,
                  limit: Number(event.target.value || 25),
                }))
              }
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
            />
            <label className="text-xs text-slate-400">Provider filter (optional)</label>
            <input
              type="text"
              value={remittanceForm.providerName}
              onChange={(event) =>
                setRemittanceForm((current) => ({
                  ...current,
                  providerName: event.target.value,
                }))
              }
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
            />
            <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={remittanceForm.dryRun}
                onChange={(event) =>
                  setRemittanceForm((current) => ({
                    ...current,
                    dryRun: event.target.checked,
                  }))
                }
              />
              Dry run
            </label>
          </div>
          <button
            type="button"
            disabled={running}
            onClick={() => runOperation("remittance", remittanceForm)}
            className="mt-4 w-full rounded-lg border border-cyan-400/30 bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-60"
          >
            {running ? "Running..." : "Run Remittance"}
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <h3 className="text-base font-semibold text-white">Run AutoPay Processor</h3>
          <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autopayDryRun}
              onChange={(event) => setAutopayDryRun(event.target.checked)}
            />
            Dry run
          </label>
          <button
            type="button"
            disabled={running}
            onClick={() => runOperation("autopay", { dryRun: autopayDryRun })}
            className="mt-4 w-full rounded-lg border border-indigo-400/30 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-60"
          >
            {running ? "Running..." : "Run AutoPay"}
          </button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <h3 className="text-base font-semibold text-white">Run Platform Fee Processor</h3>
          <div className="mt-3 grid gap-2">
            <label className="text-xs text-slate-400">Charge month (YYYY-MM optional)</label>
            <input
              type="text"
              placeholder={kpis.currentMonth || "YYYY-MM"}
              value={platformFeeForm.chargeMonth}
              onChange={(event) =>
                setPlatformFeeForm((current) => ({
                  ...current,
                  chargeMonth: event.target.value,
                }))
              }
              className="rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"
            />
            <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={platformFeeForm.dryRun}
                onChange={(event) =>
                  setPlatformFeeForm((current) => ({
                    ...current,
                    dryRun: event.target.checked,
                  }))
                }
              />
              Dry run
            </label>
          </div>
          <button
            type="button"
            disabled={running}
            onClick={() => runOperation("platform_fee", platformFeeForm)}
            className="mt-4 w-full rounded-lg border border-amber-400/30 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-60"
          >
            {running ? "Running..." : "Run Platform Fees"}
          </button>
        </section>
      </div>
      ) : (
      <section className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4">
        <h3 className="text-base font-semibold text-cyan-900">Tenant-safe mode</h3>
        <p className="mt-2 text-sm text-cyan-800">
          Global processors are disabled here. You can only track and update remittance for transactions in your own tenant.
        </p>
      </section>
      )}

      <section className={sectionClass}>
        <h3 className={sectionTitleClass}>Remittance Queue (Recent)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Attempts</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2">Reference</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className={tableBodyClass}>
              {(data?.recentQueue || []).map((row) => {
                const submitKey = `${row.tenant_id}:${row.transaction_id}:submitted`;
                const failKey = `${row.tenant_id}:${row.transaction_id}:failed`;
                return (
                  <tr key={row.id}>
                    <td className="px-2 py-2">{row.provider_name || row.providerName || "-"}</td>
                    <td className="px-2 py-2">{row.status || "-"}</td>
                    <td className="px-2 py-2">{Number(row.attempts || 0)}</td>
                    <td className="px-2 py-2">{formatDateTime(row.updated_at)}</td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={queueRefs[row.transaction_id] ?? row.remittance_reference ?? ""}
                        onChange={(event) =>
                          setQueueRefs((current) => ({
                            ...current,
                            [row.transaction_id]: event.target.value,
                          }))
                        }
                        className={referenceInputClass}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={rowPending[submitKey] === true}
                          onClick={() => updateRemittance(row, "submitted")}
                          className="rounded-md border border-emerald-400/30 bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-60"
                        >
                          Submit
                        </button>
                        <button
                          type="button"
                          disabled={rowPending[failKey] === true}
                          onClick={() => updateRemittance(row, "failed")}
                          className="rounded-md border border-rose-400/30 bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 disabled:opacity-60"
                        >
                          Fail
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionClass}>
        <h3 className={sectionTitleClass}>Recent Bill Payment Transactions</h3>
        <div className="mt-3 overflow-x-auto">
          <table className={tableClass}>
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">Created</th>
              </tr>
            </thead>
            <tbody className={tableBodyClass}>
              {(data?.recentTransactions || []).map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-2">{row.provider_name || row.providerName || "-"}</td>
                  <td className="px-2 py-2">{formatCurrency(row.amount, row.currency || "usd")}</td>
                  <td className="px-2 py-2">{row.status || "-"}</td>
                  <td className="px-2 py-2">{row.source || "-"}</td>
                  <td className="px-2 py-2">{formatDateTime(row.created_at || row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
