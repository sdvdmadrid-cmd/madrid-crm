"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/client-auth";
import styles from "@/app/payroll/payroll.module.css";
import "@/i18n";

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(v || 0),
  );
}

export default function EmployeePortalPayrollClient() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const taxYear = new Date().getFullYear();

  const load = useCallback(async () => {
    setError("");
    const res = await apiFetch("/api/portal/payroll");
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      setError(payload.error || "Unable to load portal");
      return;
    }
    setData(payload.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveAddress = async () => {
    if (!data?.profile) return;
    const res = await apiFetch("/api/portal/payroll", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addressStreet: data.profile.addressStreet,
        addressCity: data.profile.addressCity,
        addressState: data.profile.addressState,
        addressZip: data.profile.addressZip,
      }),
    });
    const payload = await res.json();
    if (res.ok && payload.success) {
      setNotice(t("payroll.portal.saved"));
      setData((prev) => ({ ...prev, profile: payload.data }));
    } else {
      setError(payload.error || "Save failed");
    }
  };

  const saveDirectDeposit = async () => {
    const res = await apiFetch("/api/portal/payroll", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directDeposit: { routingNumber, accountNumber },
      }),
    });
    const payload = await res.json();
    if (res.ok && payload.success) {
      setNotice(t("payroll.portal.saved"));
      setRoutingNumber("");
      setAccountNumber("");
      setData((prev) => ({ ...prev, profile: payload.data }));
    } else {
      setError(payload.error || "Save failed");
    }
  };

  if (error && !data) {
    return (
      <main className={styles.page}>
        <div className={styles.error}>{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.page}>
        <p className={styles.muted}>{t("payroll.loading")}</p>
      </main>
    );
  }

  const { profile, payStubs, ptoBalanceHours, sickBalanceHours } = data;

  return (
    <main className={styles.page} data-testid="employee-payroll-portal">
      <h1 className={styles.title}>{t("payroll.portal.title")}</h1>
      <p className={styles.subtitle}>{profile.fullName}</p>

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("payroll.fields.ptoBalance")}</div>
          <div className={styles.statValue}>{ptoBalanceHours}h</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("payroll.fields.sickBalance")}</div>
          <div className={styles.statValue}>{sickBalanceHours}h</div>
        </div>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.portal.taxForms")}</h2>
        <a
          href={`/api/portal/payroll/w2/${taxYear}?download=1`}
          className={styles.btnGhost}
        >
          {profile.taxForm === "1099" ? "Download 1099-NEC" : t("payroll.actions.downloadW2")} ({taxYear})
        </a>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.portal.address")}</h2>
        <div className={styles.grid2}>
          <input
            className={styles.field}
            value={profile.addressStreet || ""}
            onChange={(e) =>
              setData((d) => ({
                ...d,
                profile: { ...d.profile, addressStreet: e.target.value },
              }))
            }
          />
          <input
            className={styles.field}
            value={profile.addressCity || ""}
            onChange={(e) =>
              setData((d) => ({
                ...d,
                profile: { ...d.profile, addressCity: e.target.value },
              }))
            }
          />
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} onClick={saveAddress}>
            {t("payroll.portal.saveProfile")}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.fields.routingNumber")}</h2>
        {profile.hasDirectDeposit ? (
          <p className={styles.muted}>Account ending •••• {profile.directDepositLast4}</p>
        ) : null}
        <div className={styles.grid2}>
          <input
            className={styles.field}
            placeholder={t("payroll.fields.routingNumber")}
            value={routingNumber}
            onChange={(e) => setRoutingNumber(e.target.value)}
          />
          <input
            className={styles.field}
            placeholder={t("payroll.fields.accountNumber")}
            type="password"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} onClick={saveDirectDeposit}>
            {t("payroll.portal.saveProfile")}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("payroll.portal.payStubs")}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("payroll.fields.period")}</th>
                <th>{t("payroll.fields.net")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(payStubs || []).map((stub) => (
                <tr key={stub.id}>
                  <td>
                    {stub.run?.periodStart} – {stub.run?.periodEnd}
                  </td>
                  <td>{money(stub.netPay)}</td>
                  <td>
                    {stub.run?.id ? (
                      <a
                        href={`/api/payroll/runs/${stub.run.id}/items/${stub.id}/pdf?download=1`}
                        className={styles.linkBtn}
                      >
                        {t("payroll.actions.downloadStub")}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {notice ? <div className={styles.success}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
    </main>
  );
}
