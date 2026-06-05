"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddressFieldsGroup from "@/components/AddressFieldsGroup";
import { computePayPreview } from "@/lib/payroll-pay-preview";
import styles from "@/app/payroll/payroll.module.css";

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function FormField({
  id,
  label,
  hint,
  required = false,
  children,
  className = "",
}) {
  return (
    <div className={`${styles.formField} ${className}`.trim()}>
      <label className={styles.formLabel} htmlFor={id}>
        {label}
        {required ? <span className={styles.requiredMark}> *</span> : null}
      </label>
      {children}
      {hint ? <p className={styles.helperText}>{hint}</p> : null}
    </div>
  );
}

export default function PayrollEmployeeForm({
  form,
  setForm,
  selectedId,
  onSave,
  onClear,
}) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const preview = useMemo(
    () => computePayPreview(form.payType, form.hourlyRate, form.annualSalary),
    [form.payType, form.hourlyRate, form.annualSalary],
  );

  const directDepositEnabled = Boolean(form.directDepositEnabled);

  return (
    <section className={styles.card} data-testid="payroll-employee-form">
      <h2 className={styles.cardTitle}>
        {selectedId
          ? t("payroll.employees.editTitle")
          : t("payroll.employees.newTitle")}
      </h2>
      <p className={styles.formIntro}>{t("payroll.employees.formIntro")}</p>

      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>
          {t("payroll.employees.sections.personal")}
        </h3>
        <div className={styles.formGrid}>
          <FormField
            id="employee-first-name"
            label={t("payroll.fields.firstName")}
            required
          >
            <input
              id="employee-first-name"
              className={styles.field}
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </FormField>
          <FormField
            id="employee-last-name"
            label={t("payroll.fields.lastName")}
            required
          >
            <input
              id="employee-last-name"
              className={styles.field}
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </FormField>
          <FormField
            id="employee-email"
            label={t("payroll.fields.email")}
            hint={t("payroll.employees.hints.email")}
          >
            <input
              id="employee-email"
              className={styles.field}
              type="email"
              autoComplete="email"
              placeholder="maria@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>
          <FormField
            id="employee-phone"
            label={t("payroll.fields.phone")}
            hint={t("payroll.employees.hints.phone")}
          >
            <input
              id="employee-phone"
              className={styles.field}
              type="tel"
              autoComplete="tel"
              placeholder="(512) 555-0100"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>
          <FormField
            id="employee-dob"
            label={t("payroll.fields.dateOfBirth")}
            hint={t("payroll.employees.hints.dateOfBirth")}
          >
            <input
              id="employee-dob"
              className={styles.field}
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          </FormField>
          <FormField
            id="employee-ssn"
            label={t("payroll.fields.socialSecurityNumber")}
            hint={t("payroll.employees.hints.socialSecurityNumber")}
          >
            <input
              id="employee-ssn"
              className={styles.field}
              type="password"
              autoComplete="off"
              inputMode="numeric"
              placeholder="XXX-XX-XXXX"
              value={form.ssn}
              onChange={(e) => setForm({ ...form, ssn: e.target.value })}
            />
          </FormField>
          <FormField
            id="employee-hire-date"
            label={t("payroll.fields.hireDateLabel")}
            hint={t("payroll.employees.hints.hireDate")}
            className={styles.formFieldWide}
          >
            <input
              id="employee-hire-date"
              className={styles.field}
              type="date"
              value={form.hireDate}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
            />
          </FormField>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>
          {t("payroll.employees.sections.address")}
        </h3>
        <p className={styles.sectionHint}>{t("payroll.employees.hints.address")}</p>
        <div className={styles.addressBlock}>
          <FormField
            id="payroll-employee-address"
            label={t("payroll.fields.addressStreet")}
          >
            <AddressFieldsGroup
              street={form.addressStreet}
              city={form.addressCity}
              state={form.addressState}
              zip={form.addressZip}
              streetId="payroll-employee-address"
              streetPlaceholder={t("payroll.employees.placeholders.street")}
              inputClass={styles.field}
              selectClass={styles.fieldSelect}
              onStreetChange={(value) => setForm({ ...form, addressStreet: value })}
              onCityChange={(value) => setForm({ ...form, addressCity: value })}
              onStateChange={(value) =>
                setForm({ ...form, addressState: value, workState: value })
              }
              onZipChange={(value) => setForm({ ...form, addressZip: value })}
            />
          </FormField>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>
          {t("payroll.employees.sections.compensation")}
        </h3>
        <div className={styles.formGrid}>
          <FormField
            id="employee-tax-form"
            label={t("payroll.fields.taxForm")}
            hint={t("payroll.employees.hints.taxForm")}
          >
            <select
              id="employee-tax-form"
              className={styles.fieldSelect}
              value={form.taxForm}
              onChange={(e) => setForm({ ...form, taxForm: e.target.value })}
            >
              <option value="w2">W-2 (employee)</option>
              <option value="1099">1099 (contractor)</option>
            </select>
          </FormField>
          <FormField
            id="employee-filing-status"
            label={t("payroll.fields.filingStatus")}
            hint={t("payroll.employees.hints.filingStatus")}
          >
            <select
              id="employee-filing-status"
              className={styles.fieldSelect}
              value={form.filingStatus}
              onChange={(e) => setForm({ ...form, filingStatus: e.target.value })}
            >
              <option value="single">{t("payroll.fields.filingSingle")}</option>
              <option value="married">{t("payroll.fields.filingMarried")}</option>
              <option value="head_of_household">
                {t("payroll.fields.filingHoh")}
              </option>
            </select>
          </FormField>
        </div>

        <fieldset className={styles.payTypeFieldset}>
          <legend className={styles.formLabel}>{t("payroll.fields.payType")}</legend>
          <p className={styles.helperText}>{t("payroll.employees.hints.payType")}</p>
          <div className={styles.payTypeOptions} role="radiogroup" aria-label={t("payroll.fields.payType")}>
            <label className={styles.payTypeOption}>
              <input
                type="radio"
                name="payType"
                value="hourly"
                checked={form.payType === "hourly"}
                onChange={() => setForm({ ...form, payType: "hourly" })}
              />
              <span>{t("payroll.fields.hourly")}</span>
            </label>
            <label className={styles.payTypeOption}>
              <input
                type="radio"
                name="payType"
                value="salary"
                checked={form.payType === "salary"}
                onChange={() => setForm({ ...form, payType: "salary" })}
              />
              <span>{t("payroll.fields.salary")}</span>
            </label>
          </div>
        </fieldset>

        <div className={styles.formGrid}>
          {form.payType === "hourly" ? (
            <FormField
              id="employee-hourly-rate"
              label={t("payroll.fields.hourlyRateLabel")}
              hint={t("payroll.employees.hints.hourlyRate")}
            >
              <input
                id="employee-hourly-rate"
                className={styles.field}
                type="number"
                min="0"
                step="0.01"
                placeholder="25.00"
                value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
              />
            </FormField>
          ) : (
            <FormField
              id="employee-annual-salary"
              label={t("payroll.fields.annualSalaryLabel")}
              hint={t("payroll.employees.hints.annualSalary")}
            >
              <input
                id="employee-annual-salary"
                className={styles.field}
                type="number"
                min="0"
                step="1"
                placeholder="52000"
                value={form.annualSalary}
                onChange={(e) => setForm({ ...form, annualSalary: e.target.value })}
              />
            </FormField>
          )}
        </div>

        <div className={styles.payPreview} data-testid="payroll-pay-preview">
          <h4 className={styles.payPreviewTitle}>
            {t("payroll.employees.preview.title")}
          </h4>
          <p className={styles.sectionHint}>{t("payroll.employees.preview.note")}</p>
          <div className={styles.payPreviewGrid}>
            <div className={styles.payPreviewItem}>
              <span className={styles.payPreviewLabel}>
                {t("payroll.employees.preview.grossAnnual")}
              </span>
              <strong className={styles.payPreviewValue}>
                {money(preview.grossAnnual)}
              </strong>
            </div>
            <div className={styles.payPreviewItem}>
              <span className={styles.payPreviewLabel}>
                {t("payroll.employees.preview.weekly")}
              </span>
              <strong className={styles.payPreviewValue}>
                {money(preview.weekly)}
              </strong>
            </div>
            <div className={styles.payPreviewItem}>
              <span className={styles.payPreviewLabel}>
                {t("payroll.employees.preview.biweekly")}
              </span>
              <strong className={styles.payPreviewValue}>
                {money(preview.biweekly)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>
          {t("payroll.employees.sections.payment")}
        </h3>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={directDepositEnabled}
            onChange={(e) =>
              setForm({
                ...form,
                directDepositEnabled: e.target.checked,
                directDeposit: e.target.checked
                  ? form.directDeposit
                  : { routingNumber: "", accountNumber: "", accountType: "checking" },
              })
            }
          />
          <span>
            <strong>{t("payroll.fields.directDepositEnabled")}</strong>
            <span className={styles.helperText}>
              {t("payroll.employees.hints.directDeposit")}
            </span>
          </span>
        </label>

        {directDepositEnabled ? (
          <div className={styles.formGrid}>
            <FormField
              id="employee-routing-number"
              label={t("payroll.fields.routingNumber")}
              hint={t("payroll.employees.hints.routingNumber")}
            >
              <input
                id="employee-routing-number"
                className={styles.field}
                inputMode="numeric"
                autoComplete="off"
                placeholder="111000025"
                value={form.directDeposit.routingNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
                    directDeposit: {
                      ...form.directDeposit,
                      routingNumber: e.target.value,
                    },
                  })
                }
              />
            </FormField>
            <FormField
              id="employee-account-number"
              label={t("payroll.fields.accountNumber")}
              hint={t("payroll.employees.hints.accountNumber")}
            >
              <input
                id="employee-account-number"
                className={styles.field}
                type="password"
                autoComplete="off"
                inputMode="numeric"
                placeholder="••••••••••"
                value={form.directDeposit.accountNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
                    directDeposit: {
                      ...form.directDeposit,
                      accountNumber: e.target.value,
                    },
                  })
                }
              />
            </FormField>
            <FormField
              id="employee-account-type"
              label={t("payroll.fields.accountType")}
            >
              <select
                id="employee-account-type"
                className={styles.fieldSelect}
                value={form.directDeposit.accountType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    directDeposit: {
                      ...form.directDeposit,
                      accountType: e.target.value,
                    },
                  })
                }
              >
                <option value="checking">{t("payroll.fields.checking")}</option>
                <option value="savings">{t("payroll.fields.savings")}</option>
              </select>
            </FormField>
          </div>
        ) : null}
      </div>

      <details
        className={styles.advancedDetails}
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
      >
        <summary className={styles.advancedSummary}>
          {t("payroll.employees.sections.advanced")}
        </summary>
        <p className={styles.sectionHint}>{t("payroll.employees.hints.advanced")}</p>
        <div className={styles.formGrid}>
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
          <FormField
            id="employee-w4-extra"
            label={t("payroll.fields.w4ExtraWithholding")}
            hint={t("payroll.employees.hints.w4ExtraWithholding")}
          >
            <input
              id="employee-w4-extra"
              className={styles.field}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.w4ExtraWithholding}
              onChange={(e) =>
                setForm({ ...form, w4ExtraWithholding: e.target.value })
              }
            />
          </FormField>
          <FormField
            id="employee-state-extra"
            label={t("payroll.fields.stateWithholdingExtra")}
            hint={t("payroll.employees.hints.stateWithholdingExtra")}
          >
            <input
              id="employee-state-extra"
              className={styles.field}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.stateWithholdingExtra}
              onChange={(e) =>
                setForm({ ...form, stateWithholdingExtra: e.target.value })
              }
            />
          </FormField>
          <FormField
            id="employee-pto-balance"
            label={t("payroll.fields.ptoBalance")}
            hint={t("payroll.employees.hints.ptoBalance")}
          >
            <input
              id="employee-pto-balance"
              className={styles.field}
              type="number"
              min="0"
              step="0.25"
              placeholder="0"
              value={form.ptoBalanceHours}
              onChange={(e) => setForm({ ...form, ptoBalanceHours: e.target.value })}
            />
          </FormField>
          <FormField
            id="employee-sick-balance"
            label={t("payroll.fields.sickBalance")}
            hint={t("payroll.employees.hints.sickBalance")}
          >
            <input
              id="employee-sick-balance"
              className={styles.field}
              type="number"
              min="0"
              step="0.25"
              placeholder="0"
              value={form.sickBalanceHours}
              onChange={(e) => setForm({ ...form, sickBalanceHours: e.target.value })}
            />
          </FormField>
        </div>
      </details>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.btnPrimary}
          data-testid="payroll-employee-save"
          onClick={onSave}
        >
          {selectedId ? t("payroll.actions.update") : t("payroll.actions.save")}
        </button>
        {selectedId ? (
          <button type="button" className={styles.btnGhost} onClick={onClear}>
            {t("payroll.actions.clear")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
