"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import PayrollEmployeeForm from "@/components/payroll/PayrollEmployeeForm";
import { apiFetch } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

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
  employeeName,
  loading,
  onCancel,
  onConfirm,
  t,
}) {
  if (!open) return null;
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
          {t("payroll.employees.confirmDeleteTitle")}
        </h3>
        <p className={styles.modalMessage}>
          {t("payroll.employees.confirmDeleteMessage")}
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
          <button
            type="button"
            className={`${styles.modalBtnConfirm} ${styles.modalBtnDanger}`}
            onClick={onConfirm}
            disabled={loading}
            data-testid="payroll-delete-employee-confirm"
          >
            {loading ? t("payroll.actions.working") : t("payroll.actions.confirmDelete")}
          </button>
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
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    employeeId: "",
    employeeName: "",
  });
  const [deleting, setDeleting] = useState(false);

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
    setError("");
    setNotice("");

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(t("payroll.employees.errors.nameRequired"));
      return;
    }

    const body = buildSavePayload(form);
    const res = await apiFetch(
      selectedId ? `/api/payroll/employees/${selectedId}` : "/api/payroll/employees",
      {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to save employee");
      return;
    }

    setNotice(t("payroll.employees.saved"));
    setForm(initialEmployee);
    setSelectedId("");
    setHistory([]);
    await loadEmployees();
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
  };

  const employeeDisplayName = (employee) =>
    employee.fullName || `${employee.firstName || ""} ${employee.lastName || ""}`.trim();

  const requestDeleteEmployee = (employee) => {
    if (!employee?.id || !canDeleteEmployee) return;
    setError("");
    setNotice("");
    setDeleteModal({
      open: true,
      employeeId: employee.id,
      employeeName: employeeDisplayName(employee),
    });
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
      setDeleteModal({ open: false, employeeId: "", employeeName: "" });
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
      />

      {error ? <div className={styles.error}>{error}</div> : null}
      {notice ? <div className={styles.success}>{notice}</div> : null}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.employees.rosterTitle")}</h2>
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
        employeeName={deleteModal.employeeName}
        loading={deleting}
        onCancel={() =>
          setDeleteModal({ open: false, employeeId: "", employeeName: "" })
        }
        onConfirm={confirmDeleteEmployee}
        t={t}
      />
    </main>
  );
}
