"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import PayrollNav from "@/components/payroll/PayrollNav";
import AddressFieldsGroup from "@/components/AddressFieldsGroup";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

const initialEmployee = {
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
  directDeposit: { routingNumber: "", accountNumber: "", accountType: "checking" },
  status: "active",
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function PayrollEmployeesClient() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(initialEmployee);
  const [selectedId, setSelectedId] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/payroll/employees?status=all");
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Load failed");
      setEmployees(payload.data || []);
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
      directDeposit: { routingNumber: "", accountNumber: "", accountType: "checking" },
      status: employee.status || "active",
      ssn: "",
    });
    await loadHistory(employee.id);
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

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {selectedId ? t("payroll.employees.editTitle") : t("payroll.employees.newTitle")}
        </h2>
        <div className={styles.grid2}>
          <input
            className={styles.field}
            placeholder={t("payroll.fields.firstName")}
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.lastName")}
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.email")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.phone")}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
            <AddressFieldsGroup
              street={form.addressStreet}
              city={form.addressCity}
              state={form.addressState}
              zip={form.addressZip}
              streetId="payroll-employee-address"
              streetPlaceholder={t("payroll.fields.addressStreet")}
              inputClass={styles.field}
              selectClass={styles.fieldSelect}
              onStreetChange={(value) => setForm({ ...form, addressStreet: value })}
              onCityChange={(value) => setForm({ ...form, addressCity: value })}
              onStateChange={(value) =>
                setForm({ ...form, addressState: value, workState: value })
              }
              onZipChange={(value) => setForm({ ...form, addressZip: value })}
            />
          </div>
          <select
            className={styles.fieldSelect}
            value={form.taxForm}
            onChange={(e) => setForm({ ...form, taxForm: e.target.value })}
          >
            <option value="w2">W-2</option>
            <option value="1099">1099</option>
          </select>
          <select
            className={styles.fieldSelect}
            value={form.payType}
            onChange={(e) => setForm({ ...form, payType: e.target.value })}
          >
            <option value="hourly">{t("payroll.fields.hourly")}</option>
            <option value="salary">{t("payroll.fields.salary")}</option>
          </select>
          {form.payType === "hourly" ? (
            <input
              className={styles.field}
              placeholder={t("payroll.fields.hourlyRate")}
              value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
            />
          ) : (
            <input
              className={styles.field}
              placeholder={t("payroll.fields.annualSalary")}
              value={form.annualSalary}
              onChange={(e) => setForm({ ...form, annualSalary: e.target.value })}
            />
          )}
          <select
            className={styles.fieldSelect}
            value={form.filingStatus}
            onChange={(e) => setForm({ ...form, filingStatus: e.target.value })}
          >
            <option value="single">{t("payroll.fields.filingSingle")}</option>
            <option value="married">{t("payroll.fields.filingMarried")}</option>
            <option value="head_of_household">{t("payroll.fields.filingHoh")}</option>
          </select>
          <input
            className={styles.field}
            placeholder={t("payroll.fields.ssn")}
            value={form.ssn}
            onChange={(e) => setForm({ ...form, ssn: e.target.value })}
          />
          <input
            className={styles.field}
            type="date"
            placeholder={t("payroll.fields.dateOfBirth")}
            value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
          />
          <input
            className={styles.field}
            type="date"
            placeholder={t("payroll.fields.hireDate")}
            value={form.hireDate}
            onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
          />
          <label className={styles.fieldCheckbox}>
            <input
              type="checkbox"
              checked={form.federalExempt}
              onChange={(e) => setForm({ ...form, federalExempt: e.target.checked })}
            />
            {t("payroll.fields.federalExempt")}
          </label>
          <label className={styles.fieldCheckbox}>
            <input
              type="checkbox"
              checked={form.stateExempt}
              onChange={(e) => setForm({ ...form, stateExempt: e.target.checked })}
            />
            {t("payroll.fields.stateExempt")}
          </label>
          <input
            className={styles.field}
            placeholder={t("payroll.fields.stateWithholdingExtra")}
            value={form.stateWithholdingExtra}
            onChange={(e) => setForm({ ...form, stateWithholdingExtra: e.target.value })}
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.routingNumber")}
            value={form.directDeposit.routingNumber}
            onChange={(e) =>
              setForm({
                ...form,
                directDeposit: { ...form.directDeposit, routingNumber: e.target.value },
              })
            }
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.accountNumber")}
            value={form.directDeposit.accountNumber}
            onChange={(e) =>
              setForm({
                ...form,
                directDeposit: { ...form.directDeposit, accountNumber: e.target.value },
              })
            }
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.ptoBalance")}
            value={form.ptoBalanceHours}
            onChange={(e) => setForm({ ...form, ptoBalanceHours: e.target.value })}
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.sickBalance")}
            value={form.sickBalanceHours}
            onChange={(e) => setForm({ ...form, sickBalanceHours: e.target.value })}
          />
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} onClick={saveEmployee}>
            {selectedId ? t("payroll.actions.update") : t("payroll.actions.save")}
          </button>
          {selectedId ? (
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                setSelectedId("");
                setForm(initialEmployee);
                setHistory([]);
              }}
            >
              {t("payroll.actions.clear")}
            </button>
          ) : null}
        </div>
      </section>

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
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => editEmployee(employee)}
                    >
                      {t("payroll.actions.edit")}
                    </button>
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
    </main>
  );
}
