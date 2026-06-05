"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import JobWorkspaceNav from "@/components/jobs/JobWorkspaceNav";
import { apiFetch } from "@/lib/client-auth";
import {
  getJobFileValidationError,
  JOB_FILE_MAX_BYTES,
} from "@/lib/job-files";
import jobStyles from "@/app/jobs/jobs.module.css";

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v || 0),
  );
}

const EXPENSE_CATEGORIES = [
  "material",
  "vendor",
  "equipment",
  "dump_fee",
  "subcontractor",
  "fuel",
  "other",
];

export default function JobFinancialDashboardClient({ jobId }) {
  const { t } = useTranslation();
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const receiptInputRef = useRef(null);
  const [expenseForm, setExpenseForm] = useState({
    category: "material",
    vendorName: "",
    description: "",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/jobs/${jobId}/financial`);
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Load failed");
      setPl(payload.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const addExpense = async (receiptFileId = null) => {
    setNotice("");
    const res = await apiFetch(`/api/jobs/${jobId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...expenseForm,
        amount: Number(expenseForm.amount || 0),
        receiptFileId,
      }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Failed to save expense");
      return;
    }
    setNotice(receiptFileId ? "Receipt uploaded and expense saved." : "Expense saved.");
    setExpenseForm((f) => ({ ...f, amount: "", description: "" }));
    await load();
  };

  const uploadReceiptExpense = async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;

    const validationError = getJobFileValidationError("receipt", file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setNotice("");
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileType", "receipt");

    const uploadRes = await apiFetch(`/api/jobs/${jobId}/files`, {
      method: "POST",
      body: formData,
    });
    const uploadPayload = await uploadRes.json();
    if (!uploadRes.ok || !uploadPayload.success) {
      setError(uploadPayload.error || "Receipt upload failed");
      return;
    }

    await addExpense(uploadPayload.data?.id || null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
  };

  const createInvoice = async (billingType) => {
    setNotice("");
    const res = await apiFetch(`/api/jobs/${jobId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingType, percent: billingType === "progress" ? 50 : 100 }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Invoice failed");
      return;
    }
    setNotice(`Invoice ${payload.data.invoice.invoiceNumber} created.`);
    await load();
  };

  if (loading) {
    return <main className={jobStyles.plBody}><p className={jobStyles.plMuted}>Loading financial dashboard…</p></main>;
  }

  if (!pl) {
    return <main className={jobStyles.plBody}><p className={jobStyles.plError}>{error || "Not found"}</p></main>;
  }

  return (
    <main className={jobStyles.financialPage} data-testid="job-financial-dashboard">
      <header className={jobStyles.financialHeader}>
        <div>
          <Link href="/jobs" className={jobStyles.plToggle}>← Jobs</Link>
          <h1 className={jobStyles.jobCardTitle}>{pl.jobTitle}</h1>
          <p className={jobStyles.jobCardMeta}>{pl.clientName} · {pl.service}</p>
        </div>
        <div className={jobStyles.financialActions}>
          <button type="button" className={jobStyles.btnFileLink} onClick={() => createInvoice("progress")}>
            Progress invoice (50%)
          </button>
          <button type="button" className={jobStyles.btnFileLink} onClick={() => createInvoice("final")}>
            Final invoice
          </button>
          <button type="button" className={jobStyles.btnFileLink} onClick={() => createInvoice("change_order")}>
            Change order invoice
          </button>
        </div>
      </header>

      <JobWorkspaceNav jobId={jobId} active="financial" />

      <div className={jobStyles.plGrid}>
        <div className={jobStyles.plStat}>
          <span className={jobStyles.plLabel}>Revenue</span>
          <strong>{money(pl.revenue)}</strong>
        </div>
        <div className={jobStyles.plStat}>
          <span className={jobStyles.plLabel}>Total cost</span>
          <strong>{money(pl.actual.totalCost)}</strong>
        </div>
        <div className={jobStyles.plStat}>
          <span className={jobStyles.plLabel}>Gross profit</span>
          <strong className={pl.profit.grossProfit >= 0 ? jobStyles.plPositive : jobStyles.plNegative}>
            {money(pl.profit.grossProfit)} ({pl.profit.marginPercent}%)
          </strong>
        </div>
        <div className={jobStyles.plStat}>
          <span className={jobStyles.plLabel}>Labor utilization</span>
          <strong>{pl.metrics.laborUtilization}%</strong>
        </div>
      </div>

      <section className={jobStyles.financialSection}>
        <h2>Cost breakdown</h2>
        <table className={jobStyles.plTable}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Estimated</th>
              <th>Actual</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {(pl.comparison || []).map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{money(row.estimated)}</td>
                <td>{money(row.actual)}</td>
                <td>{money(row.variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={jobStyles.financialSection}>
        <h2>Add expense</h2>
        <div className={jobStyles.expenseFormGrid}>
          <select
            value={expenseForm.category}
            onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
          >
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat.replace("_", " ")}</option>
            ))}
          </select>
          <input
            placeholder="Vendor"
            value={expenseForm.vendorName}
            onChange={(e) => setExpenseForm((f) => ({ ...f, vendorName: e.target.value }))}
          />
          <input
            placeholder="Description"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
          />
          <input
            placeholder="Amount"
            type="number"
            value={expenseForm.amount}
            onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <button type="button" className={jobStyles.btnFileLink} onClick={() => addExpense()}>
            Save expense
          </button>
          <label className={jobStyles.btnFileLink}>
            Upload receipt
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              hidden
              onChange={(e) => uploadReceiptExpense(e.target.files)}
            />
          </label>
        </div>
        <p className={jobStyles.plMuted}>
          Receipts up to {Math.round(JOB_FILE_MAX_BYTES / (1024 * 1024))}MB. Amount can be parsed from receipt text when OCR is enabled.
        </p>
      </section>

      {pl.expenses?.length ? (
        <section className={jobStyles.financialSection}>
          <h2>Recent expenses</h2>
          <ul className={jobStyles.plEntryList}>
            {pl.expenses.map((exp) => (
              <li key={exp.id}>
                {exp.expenseDate}: {exp.category} — {exp.vendorName || exp.description} — {money(exp.amount)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {notice ? <p className={jobStyles.plPositive}>{notice}</p> : null}
      {error ? <p className={jobStyles.plError}>{error}</p> : null}
    </main>
  );
}
