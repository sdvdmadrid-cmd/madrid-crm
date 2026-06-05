"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import {
  BILL_EXPENSE_CATEGORIES,
  VENDOR_CATEGORIES,
  vendorCategoryLabel,
} from "@/lib/vendor-constants";
import styles from "@/app/expenses/expenses.module.css";
import "@/i18n";

const EMPTY_VENDOR = {
  name: "",
  category: "material_store",
  contactPerson: "",
  phone: "",
  email: "",
  website: "",
  addressStreet: "",
  addressCity: "",
  addressState: "",
  addressZip: "",
  paymentTerms: "",
  notes: "",
};

const EMPTY_BILL = {
  vendorId: "",
  jobId: "",
  amountDue: "",
  dueDate: new Date().toISOString().slice(0, 10),
  category: "materials",
  notes: "",
  portalUrl: "",
  isRecurring: false,
  frequency: "monthly",
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function statusBadgeClass(status) {
  if (status === "paid") return styles.badgePaid;
  if (status === "overdue") return styles.badgeOverdue;
  return styles.badgeOpen;
}

export default function ExpensesHubClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("bills");
  const [vendors, setVendors] = useState([]);
  const [bills, setBills] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [vendorForm, setVendorForm] = useState(EMPTY_VENDOR);
  const [billForm, setBillForm] = useState(EMPTY_BILL);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const materialStores = useMemo(
    () => vendors.filter((v) => v.category === "material_store"),
    [vendors],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [vendorsRes, billsRes, jobsRes] = await Promise.all([
        apiFetch("/api/vendors"),
        apiFetch("/api/expenses/bills"),
        apiFetch("/api/jobs?limit=100"),
      ]);
      const vendorsPayload = await vendorsRes.json();
      const billsPayload = await billsRes.json();
      const jobsPayload = await jobsRes.json();

      if (!vendorsRes.ok || !vendorsPayload.success) {
        throw new Error(vendorsPayload.error || "Unable to load vendors");
      }
      if (!billsRes.ok || !billsPayload.success) {
        throw new Error(billsPayload.error || "Unable to load bills");
      }

      setVendors(vendorsPayload.data || []);
      setBills(billsPayload.data || []);
      if (jobsRes.ok) {
        const list = Array.isArray(jobsPayload)
          ? jobsPayload
          : jobsPayload.data || jobsPayload.items || [];
        setJobs(list);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveVendor = async () => {
    setWorking("vendor");
    setError("");
    setNotice("");
    const res = await apiFetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vendorForm),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to save vendor");
      return;
    }
    setVendorForm(EMPTY_VENDOR);
    setNotice(t("expenses.vendors.saved"));
    await load();
  };

  const saveBill = async () => {
    setWorking("bill");
    setError("");
    setNotice("");
    const res = await apiFetch("/api/expenses/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...billForm,
        amountDue: Number(billForm.amountDue || 0),
        jobId: billForm.jobId || null,
        vendorId: billForm.vendorId || null,
      }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to save bill");
      return;
    }
    setBillForm(EMPTY_BILL);
    setNotice(t("expenses.bills.saved"));
    await load();
  };

  const markBillPaid = async (billId) => {
    setWorking(`bill-${billId}`);
    const res = await apiFetch(`/api/expenses/bills/${billId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    const payload = await res.json();
    setWorking("");
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to update bill");
      return;
    }
    await load();
  };

  const exportCsv = () => {
    window.location.href = "/api/expenses/bills?format=csv";
  };

  return (
    <main className={styles.expensesPage} data-testid="expenses-hub-page">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("expenses.title")}</h1>
          <p className={styles.subtitle}>{t("expenses.subtitle")}</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={exportCsv}>
            {t("expenses.bills.exportCsv")}
          </button>
        </div>
      </header>

      <div className={styles.tabRow}>
        <button
          type="button"
          className={tab === "bills" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setTab("bills")}
          data-testid="expenses-tab-bills"
        >
          {t("expenses.tabs.bills")}
        </button>
        <button
          type="button"
          className={tab === "vendors" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setTab("vendors")}
          data-testid="expenses-tab-vendors"
        >
          {t("expenses.tabs.vendors")}
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      {loading ? (
        <p className={styles.muted}>{t("expenses.loading")}</p>
      ) : tab === "vendors" ? (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("expenses.vendors.addTitle")}</h2>
            <p className={styles.muted}>{t("expenses.vendors.addHint")}</p>
            <div className={styles.formGrid}>
              <label>
                {t("expenses.vendors.fields.name")}
                <input
                  value={vendorForm.name}
                  onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                  placeholder={t("expenses.vendors.placeholders.name")}
                  data-testid="vendor-name-input"
                />
              </label>
              <label>
                {t("expenses.vendors.fields.category")}
                <select
                  value={vendorForm.category}
                  onChange={(e) => setVendorForm({ ...vendorForm, category: e.target.value })}
                >
                  {VENDOR_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("expenses.vendors.fields.contactPerson")}
                <input
                  value={vendorForm.contactPerson}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, contactPerson: e.target.value })
                  }
                />
              </label>
              <label>
                {t("expenses.vendors.fields.phone")}
                <input
                  value={vendorForm.phone}
                  onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                />
              </label>
              <label>
                {t("expenses.vendors.fields.email")}
                <input
                  type="email"
                  value={vendorForm.email}
                  onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                />
              </label>
              <label>
                {t("expenses.vendors.fields.website")}
                <input
                  value={vendorForm.website}
                  onChange={(e) => setVendorForm({ ...vendorForm, website: e.target.value })}
                />
              </label>
              <label>
                {t("expenses.vendors.fields.paymentTerms")}
                <input
                  value={vendorForm.paymentTerms}
                  onChange={(e) =>
                    setVendorForm({ ...vendorForm, paymentTerms: e.target.value })
                  }
                />
              </label>
              <label>
                {t("expenses.vendors.fields.notes")}
                <textarea
                  value={vendorForm.notes}
                  onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })}
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={working === "vendor"}
                onClick={saveVendor}
                data-testid="vendor-save-btn"
              >
                {vendorForm.category === "material_store"
                  ? t("expenses.vendors.addMaterialStore")
                  : t("expenses.vendors.addVendor")}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              {t("expenses.vendors.directoryTitle")} ({vendors.length})
            </h2>
            {materialStores.length ? (
              <p className={styles.muted}>
                {t("expenses.vendors.materialStoreCount", { count: materialStores.length })}
              </p>
            ) : null}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("expenses.vendors.fields.name")}</th>
                    <th>{t("expenses.vendors.fields.category")}</th>
                    <th>{t("expenses.vendors.fields.phone")}</th>
                    <th>{t("expenses.vendors.fields.email")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.id}>
                      <td>{vendor.name}</td>
                      <td>{vendorCategoryLabel(vendor.category)}</td>
                      <td>{vendor.phone || "—"}</td>
                      <td>{vendor.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("expenses.bills.addTitle")}</h2>
            <div className={styles.formGrid}>
              <label>
                {t("expenses.bills.fields.vendor")}
                <select
                  value={billForm.vendorId}
                  onChange={(e) => setBillForm({ ...billForm, vendorId: e.target.value })}
                  data-testid="bill-vendor-select"
                >
                  <option value="">{t("expenses.bills.selectVendor")}</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("expenses.bills.fields.job")}
                <select
                  value={billForm.jobId}
                  onChange={(e) => setBillForm({ ...billForm, jobId: e.target.value })}
                >
                  <option value="">{t("expenses.bills.noJob")}</option>
                  {jobs.map((job) => (
                    <option key={job.id || job._id} value={job.id || job._id}>
                      {job.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("expenses.bills.fields.amount")}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={billForm.amountDue}
                  onChange={(e) => setBillForm({ ...billForm, amountDue: e.target.value })}
                />
              </label>
              <label>
                {t("expenses.bills.fields.dueDate")}
                <input
                  type="date"
                  value={billForm.dueDate}
                  onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })}
                />
              </label>
              <label>
                {t("expenses.bills.fields.category")}
                <select
                  value={billForm.category}
                  onChange={(e) => setBillForm({ ...billForm, category: e.target.value })}
                >
                  {BILL_EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("expenses.bills.fields.portalUrl")}
                <input
                  value={billForm.portalUrl}
                  onChange={(e) => setBillForm({ ...billForm, portalUrl: e.target.value })}
                  placeholder="https://"
                />
              </label>
              <label>
                {t("expenses.bills.fields.notes")}
                <textarea
                  value={billForm.notes}
                  onChange={(e) => setBillForm({ ...billForm, notes: e.target.value })}
                />
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={billForm.isRecurring}
                    onChange={(e) =>
                      setBillForm({ ...billForm, isRecurring: e.target.checked })
                    }
                  />{" "}
                  {t("expenses.bills.recurring")}
                </span>
              </label>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={working === "bill"}
                onClick={saveBill}
                data-testid="bill-save-btn"
              >
                {t("expenses.bills.addBill")}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              {t("expenses.bills.listTitle")} ({bills.length})
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="expenses-bills-table">
                <thead>
                  <tr>
                    <th>{t("expenses.bills.fields.vendor")}</th>
                    <th>{t("expenses.bills.fields.amount")}</th>
                    <th>{t("expenses.bills.fields.dueDate")}</th>
                    <th>{t("expenses.bills.fields.status")}</th>
                    <th>{t("expenses.bills.fields.job")}</th>
                    <th>{t("expenses.bills.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td>{bill.vendorName || "—"}</td>
                      <td>{money(bill.amountDue)}</td>
                      <td>{bill.dueDate || "—"}</td>
                      <td>
                        <span className={`${styles.badge} ${statusBadgeClass(bill.status)}`}>
                          {bill.status}
                        </span>
                      </td>
                      <td>{bill.jobId ? bill.jobId.slice(0, 8) : "—"}</td>
                      <td>
                        {bill.status !== "paid" ? (
                          <button
                            type="button"
                            className={styles.btnGhost}
                            disabled={working === `bill-${bill.id}`}
                            onClick={() => markBillPaid(bill.id)}
                          >
                            {t("expenses.bills.markPaid")}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
