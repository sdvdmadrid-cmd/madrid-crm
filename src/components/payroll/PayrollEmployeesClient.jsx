"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import PayrollEmployeeForm from "@/components/payroll/PayrollEmployeeForm";
import { apiFetch } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

const IDEMPOTENCY_STORAGE_KEY = "payroll-new-employee-idempotency";

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const initialEmployee = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressStreet: "",
  addressCity: "",
  addressState: "TX",
  addressZip: "",
  workState: "TX",
  ssn: "",
  dateOfBirth: "",
  hireDate: "",
  taxForm: "w2",
  payType: "hourly",
  hourlyRate: "",
  annualSalary: "",
  filingStatus: "single",
  w4ExtraWithholding: "0",
  federalExempt: false,
  stateExempt: false,
  stateWithholdingExtra: "0",
  ptoBalanceHours: "0",
  sickBalanceHours: "0",
  directDepositEnabled: false,
  directDeposit: { routingNumber: "", accountNumber: "", accountType: "checking" },
  status: "active",
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function buildSavePayload(form) {
  const body = {
    ...form,
    hourlyRate: Number(form.hourlyRate || 0),
    annualSalary: Number(form.annualSalary || 0),
    w4ExtraWithholding: Number(form.w4ExtraWithholding || 0),
    stateWithholdingExtra: Number(form.stateWithholdingExtra || 0),
    ptoBalanceHours: Number(form.ptoBalanceHours || 0),
    sickBalanceHours: Number(form.sickBalanceHours || 0),
    dateOfBirth: form.dateOfBirth || null,
    hireDate: form.hireDate || null,
  };

  delete body.directDepositEnabled;

  const hasDirectDeposit =
    form.directDepositEnabled &&
    (form.directDeposit?.routingNumber || form.directDeposit?.accountNumber);

  if (!hasDirectDeposit) {
    delete body.directDeposit;
  }

  return body;
}

function DeleteEmployeeModal({
  open,
  mode = "confirm",
  employeeName,
  loading,
  onCancel,
  onConfirm,
  onMarkInactive,
  t,
}) {
  if (!open) return null;
  const blocked = mode === "blocked";
  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payroll-delete-employee-title"
      data-testid="payroll-delete-employee-modal"
    >
      <div className={styles.modalPanel}>
        <h3 className={styles.modalTitle} id="payroll-delete-employee-title">
          {blocked
            ? t("payroll.employees.blockedDeleteTitle")
            : t("payroll.employees.confirmDeleteTitle")}
        </h3>
        <p className={styles.modalMessage}>
          {blocked
            ? t("payroll.employees.blockedDeleteMessage")
            : t("payroll.employees.confirmDeleteMessage")}
        </p>
        {employeeName ? (
          <p className={styles.modalMessage}>
            <strong>{employeeName}</strong>
          </p>
        ) : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalBtnCancel}
            onClick={onCancel}
            disabled={loading}
          >
            {t("payroll.actions.cancel")}
          </button>
          {blocked ? (
            <button
              type="button"
              className={styles.modalBtnSecondary}
              onClick={onMarkInactive}
              disabled={loading}
              data-testid="payroll-mark-inactive-confirm"
            >
              {loading ? t("payroll.actions.working") : t("payroll.actions.markInactive")}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.modalBtnConfirm} ${styles.modalBtnDanger}`}
              onClick={onConfirm}
              disabled={loading}
              data-testid="payroll-delete-employee-confirm"
            >
              {loading ? t("payroll.actions.working") : t("payroll.actions.confirmDelete")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PayrollEmployeesClient() {
  const { t } = useTranslation();
  const { capabilities } = useCurrentUserAccess();
  const canDeleteEmployee = Boolean(capabilities?.canDeleteRecords);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(initialEmployee);
  const [payrollSettings, setPayrollSettings] = useState({
    standardWeeklyHours: 40,
    defaultPaySchedule: "biweekly",
  });
  const [selectedId, setSelectedId] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [employeeTotal, setEmployeeTotal] = useState(0);
  const saveInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef("");
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    mode: "confirm",
    employeeId: "",
    employeeName: "",
  });
  const [deleting, setDeleting] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const resetCreateIdempotencyKey = useCallback(() => {
    const nextKey = createIdempotencyKey();
    idempotencyKeyRef.current = nextKey;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, nextKey);
    }
  }, []);

  useEffect(() => {
    if (selectedId) return;
    if (!idempotencyKeyRef.current) {
      const stored =
        typeof window !== "undefined"
          ? sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY)
          : "";
      idempotencyKeyRef.current = stored || createIdempotencyKey();
      if (typeof window !== "undefined") {
        sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, idempotencyKeyRef.current);
      }
    }
  }, [selectedId]);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [employeesRes, settingsRes] = await Promise.all([
        apiFetch("/api/payroll/employees?status=all"),
        apiFetch("/api/payroll/settings"),
      ]);
      const payload = await employeesRes.json();
      if (!employeesRes.ok || !payload.success) {
        throw new Error(payload.error || "Load failed");
      }
      setEmployees(payload.data || []);
      setEmployeeTotal(Number(payload.pagination?.total || payload.data?.length || 0));

      const settingsPayload = await settingsRes.json();
      if (settingsRes.ok && settingsPayload.success && settingsPayload.data) {
        setPayrollSettings({
          standardWeeklyHours: Number(settingsPayload.data.standardWeeklyHours || 40),
          defaultPaySchedule: settingsPayload.data.defaultPaySchedule || "biweekly",
          defaultWorkState: settingsPayload.data.defaultWorkState || "TX",
        });
        setForm((current) => ({
          ...current,
          addressState: current.addressState || settingsPayload.data.defaultWorkState || "TX",
          workState: current.workState || settingsPayload.data.defaultWorkState || "TX",
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const loadHistory = async (employeeId) => {
    if (!employeeId) {
      setHistory([]);
      return;
    }
    const res = await apiFetch(`/api/payroll/employees/${employeeId}?history=1`);
    const payload = await res.json();
    if (res.ok && payload.success) {
      setHistory(payload.data?.payrollHistory || []);
    }
  };

  const saveEmployee = async () => {
    if (saveInFlightRef.current || saving) return;
    setError("");
    setNotice("");

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(t("payroll.employees.errors.nameRequired"));
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const body = buildSavePayload(form);
      const isCreate = !selectedId;
      const headers = { "Content-Type": "application/json" };
      if (isCreate && idempotencyKeyRef.current) {
        headers["Idempotency-Key"] = idempotencyKeyRef.current;
        body.idempotencyKey = idempotencyKeyRef.current;
      }

      const res = await apiFetch(
        selectedId ? `/api/payroll/employees/${selectedId}` : "/api/payroll/employees",
        {
          method: selectedId ? "PATCH" : "POST",
          headers,
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setError(payload.error || "Unable to save employee");
        return;
      }

      setNotice(t("payroll.employees.saved"));
      if (isCreate) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
        }
        resetCreateIdempotencyKey();
      }
      setForm(initialEmployee);
      setSelectedId("");
      setHistory([]);
      await loadEmployees();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const editEmployee = async (employee) => {
    setSelectedId(employee.id);
    setForm({
      ...initialEmployee,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      addressStreet: employee.addressStreet,
      addressCity: employee.addressCity,
      addressState: employee.addressState || "TX",
      addressZip: employee.addressZip,
      workState: employee.workState || employee.addressState || "TX",
      taxForm: employee.taxForm || "w2",
      payType: employee.payType || "hourly",
      hourlyRate: String(employee.hourlyRate || ""),
      annualSalary: String(employee.annualSalary || ""),
      filingStatus: employee.filingStatus || "single",
      w4ExtraWithholding: String(employee.w4ExtraWithholding || 0),
      dateOfBirth: employee.dateOfBirth || "",
      hireDate: employee.hireDate || "",
      federalExempt: Boolean(employee.federalExempt),
      stateExempt: Boolean(employee.stateExempt),
      stateWithholdingExtra: String(employee.stateWithholdingExtra || 0),
      ptoBalanceHours: String(employee.ptoBalanceHours || 0),
      sickBalanceHours: String(employee.sickBalanceHours || 0),
      directDepositEnabled: Boolean(employee.hasDirectDeposit),
      directDeposit: { routingNumber: "", accountNumber: "", accountType: "checking" },
      status: employee.status || "active",
      ssn: "",
    });
    await loadHistory(employee.id);
  };

  const clearForm = () => {
    setSelectedId("");
    setForm(initialEmployee);
    setHistory([]);
    resetCreateIdempotencyKey();
  };

  const employeeDisplayName = (employee) =>
    employee.fullName || `${employee.firstName || ""} ${employee.lastName || ""}`.trim();

  const requestDeleteEmployee = async (employee) => {
    if (!employee?.id || !canDeleteEmployee) return;
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/payroll/employees/${employee.id}`);
      const payload = await res.json();
      const historyCount = Number(payload?.data?.payrollHistoryCount || 0);
      setDeleteModal({
        open: true,
        mode: historyCount > 0 ? "blocked" : "confirm",
        employeeId: employee.id,
        employeeName: employeeDisplayName(employee),
      });
    } catch {
      setDeleteModal({
        open: true,
        mode: "confirm",
        employeeId: employee.id,
        employeeName: employeeDisplayName(employee),
      });
    }
  };

  const markEmployeeInactive = async (employeeId) => {
    const id = employeeId || deleteModal.employeeId;
    if (!id) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/payroll/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || t("payroll.employees.errors.deleteFailed"));
      }
      setDeleteModal({ open: false, mode: "confirm", employeeId: "", employeeName: "" });
      if (selectedId === id) {
        setForm((current) => ({ ...current, status: "inactive" }));
      }
      setNotice(t("payroll.employees.markedInactive"));
      await loadEmployees();
    } catch (err) {
      setError(err.message || t("payroll.employees.errors.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteEmployee = async () => {
    const { employeeId } = deleteModal;
    if (!employeeId) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/payroll/employees/${employeeId}`, {
        method: "DELETE",
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || t("payroll.employees.errors.deleteFailed"));
      }
      setDeleteModal({ open: false, mode: "confirm", employeeId: "", employeeName: "" });
      if (selectedId === employeeId) {
        clearForm();
      } else {
        setEmployees((current) => current.filter((row) => row.id !== employeeId));
      }
      setNotice(t("payroll.employees.deleted"));
      await loadEmployees();
    } catch (err) {
      setError(err.message || t("payroll.employees.errors.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const loadDuplicateGroups = async () => {
    if (!canDeleteEmployee) return;
    setDuplicatesLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/payroll/employees/duplicates");
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "Unable to scan duplicates");
      }
      setDuplicateGroups(payload.data?.groups || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setDuplicatesLoading(false);
    }
  };

  const cleanupSafeDuplicates = async () => {
    const ids = duplicateGroups.flatMap((group) => group.safeDeleteIds || []);
    if (!ids.length) return;
    setCleanupBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch("/api/payroll/employees/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: ids }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        const firstError = payload.data?.failed?.[0]?.error;
        throw new Error(firstError || payload.error || "Unable to delete duplicates");
      }
      setNotice(
        t("payroll.employees.duplicatesCleaned", {
          count: payload.data?.deleted?.length || 0,
        }),
      );
      await loadEmployees();
      await loadDuplicateGroups();
    } catch (err) {
      setError(err.message);
    } finally {
      setCleanupBusy(false);
    }
  };

  const duplicateSafeCount = duplicateGroups.reduce(
    (sum, group) => sum + (group.safeDeleteIds?.length || 0),
    0,
  );

  return (
    <main className={styles.page} data-testid="payroll-employees-page">
      <header className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{t("payroll.employees.title")}</h1>
          <p className={styles.subtitle}>{t("payroll.employees.subtitle")}</p>
        </div>
      </header>

      <PayrollNav />

      <PayrollEmployeeForm
        form={form}
        setForm={setForm}
        selectedId={selectedId}
        onSave={saveEmployee}
        onClear={clearForm}
        payrollSettings={payrollSettings}
        canDeleteEmployee={canDeleteEmployee}
        onDelete={
          selectedId
            ? () =>
                requestDeleteEmployee({
                  id: selectedId,
                  firstName: form.firstName,
                  lastName: form.lastName,
                  fullName: `${form.firstName} ${form.lastName}`.trim(),
                })
            : undefined
        }
        deleting={deleting}
        saving={saving}
      />

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.employees.rosterTitle")}</h2>
        <p className={styles.rosterMeta}>
          {t("payroll.employees.rosterCount", { count: employeeTotal || employees.length })}
        </p>
        {loading ? <p className={styles.muted}>{t("payroll.loading")}</p> : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("payroll.fields.name")}</th>
                <th>{t("payroll.fields.state")}</th>
                <th>{t("payroll.fields.taxForm")}</th>
                <th>{t("payroll.fields.rate")}</th>
                <th>{t("payroll.fields.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.fullName || `${employee.firstName} ${employee.lastName}`}</td>
                  <td>{employee.workState}</td>
                  <td>{employee.taxForm?.toUpperCase()}</td>
                  <td>
                    {employee.payType === "salary"
                      ? money(employee.annualSalary)
                      : `${money(employee.hourlyRate)}/hr`}
                  </td>
                  <td>
                    <span className={styles.badge}>{employee.status}</span>
                  </td>
                  <td>
                    <div className={styles.tableActions}>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => editEmployee(employee)}
                      >
                        {t("payroll.actions.edit")}
                      </button>
                      {canDeleteEmployee ? (
                        <button
                          type="button"
                          className={styles.btnDanger}
                          onClick={() => requestDeleteEmployee(employee)}
                          data-testid={`payroll-delete-employee-${employee.id}`}
                        >
                          {t("payroll.actions.delete")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canDeleteEmployee ? (
        <section className={styles.card} data-testid="payroll-duplicates-panel">
          <h2 className={styles.cardTitle}>{t("payroll.employees.duplicatesTitle")}</h2>
          <p className={styles.muted}>{t("payroll.employees.duplicatesSubtitle")}</p>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={loadDuplicateGroups}
              disabled={duplicatesLoading || cleanupBusy}
              data-testid="payroll-scan-duplicates"
            >
              {duplicatesLoading
                ? t("payroll.actions.working")
                : t("payroll.employees.duplicatesScan")}
            </button>
            {duplicateSafeCount > 0 ? (
              <button
                type="button"
                className={styles.btnDanger}
                onClick={cleanupSafeDuplicates}
                disabled={cleanupBusy || duplicatesLoading}
                data-testid="payroll-cleanup-duplicates"
              >
                {cleanupBusy
                  ? t("payroll.actions.working")
                  : `${t("payroll.employees.duplicatesCleanup")} (${duplicateSafeCount})`}
              </button>
            ) : null}
          </div>
          {duplicateGroups.length === 0 && !duplicatesLoading ? (
            <p className={styles.muted}>{t("payroll.employees.duplicatesNone")}</p>
          ) : null}
          {duplicateGroups.length > 0 ? (
            <p className={styles.rosterMeta}>
              {t("payroll.employees.duplicatesFound", {
                count: duplicateGroups.length,
                employees: duplicateGroups.reduce(
                  (sum, group) => sum + group.employees.length,
                  0,
                ),
              })}
            </p>
          ) : null}
          {duplicateGroups.map((group) => (
            <div key={group.suggestedKeepId || group.employees.map((e) => e.id).join("-")} className={styles.duplicateGroup}>
              <h3 className={styles.duplicateGroupTitle}>
                {group.reasons
                  .map((reason) =>
                    reason === "name"
                      ? t("payroll.employees.duplicatesMatchName")
                      : reason === "email"
                        ? t("payroll.employees.duplicatesMatchEmail")
                        : t("payroll.employees.duplicatesMatchPhone"),
                  )
                  .join(" · ")}
              </h3>
              <ul className={styles.duplicateList}>
                {group.employees.map((employee) => (
                  <li key={employee.id} className={styles.duplicateItem}>
                    <span>
                      {employee.fullName || `${employee.firstName} ${employee.lastName}`}
                      {employee.id === group.suggestedKeepId
                        ? ` (${t("payroll.employees.keepOldest")})`
                        : ""}
                    </span>
                    <span>
                      {employee.payrollHistoryCount > 0
                        ? t("payroll.employees.hasPayrollHistory")
                        : employee.canPermanentlyDelete &&
                            employee.id !== group.suggestedKeepId
                          ? t("payroll.employees.safeToDelete")
                          : employee.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {selectedId ? (
        <section className={styles.card}>
          <div className={styles.formActions}>
            <a
              href={`/api/payroll/employees/${selectedId}/w2/${new Date().getFullYear()}?download=1`}
              className={styles.btnGhost}
            >
              {t("payroll.actions.downloadW2")}
            </a>
          </div>
        </section>
      ) : null}

      {selectedId && history.length > 0 ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t("payroll.employees.historyTitle")}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("payroll.fields.period")}</th>
                  <th>{t("payroll.fields.gross")}</th>
                  <th>{t("payroll.fields.net")}</th>
                  <th>{t("payroll.fields.status")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.run?.periodStart} – {row.run?.periodEnd}
                      {row.run?.id && row.id ? (
                        <>
                          {" "}
                          <a
                            href={`/api/payroll/runs/${row.run.id}/items/${row.id}/pdf?download=1`}
                            className={styles.linkBtn}
                          >
                            {t("payroll.actions.downloadStub")}
                          </a>
                        </>
                      ) : null}
                    </td>
                    <td>{money(row.grossPay)}</td>
                    <td>{money(row.netPay)}</td>
                    <td>{row.run?.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <DeleteEmployeeModal
        open={deleteModal.open}
        mode={deleteModal.mode}
        employeeName={deleteModal.employeeName}
        loading={deleting}
        onCancel={() =>
          setDeleteModal({ open: false, mode: "confirm", employeeId: "", employeeName: "" })
        }
        onConfirm={confirmDeleteEmployee}
        onMarkInactive={() => markEmployeeInactive(deleteModal.employeeId)}
        t={t}
      />
    </main>
  );
}
