import { roundMoney } from "./payroll-money.js";
import { calculateFederalWithholdingPub15T } from "./payroll-federal-withholding.js";
import {
  calculateLocalWithholding,
  calculateStateEmployeeTaxes,
  calculateStateEmployerTaxes,
  calculateStateWithholding,
} from "./payroll-state-tax-engine.js";

function emptyYtd() {
  return {
    grossPay: 0,
    federalWithholding: 0,
    stateWithholding: 0,
    localWithholding: 0,
    socialSecurity: 0,
    medicare: 0,
    netPay: 0,
  };
}

export function normalizeYtdTotals(ytd = {}) {
  const base = emptyYtd();
  for (const key of Object.keys(base)) {
    base[key] = roundMoney(ytd[key]);
  }
  return base;
}

function resolveHourlyRate(employee, hourlyRateOverride, rateKey) {
  const rates = employee?.metadata?.payRates || employee?.metadata?.pay_rates;
  if (rateKey && rates?.[rateKey]) return Number(rates[rateKey]);
  if (hourlyRateOverride != null) return Number(hourlyRateOverride);
  return Number(employee?.hourlyRate ?? employee?.hourly_rate ?? 0);
}

function computeGrossPay({
  employee,
  hoursRegular,
  hoursOvertime,
  hoursHoliday = 0,
  hoursPto = 0,
  hoursSick = 0,
  hourlyRateOverride,
  rateKey,
  bonusAmount = 0,
  isCorrection = false,
  correctionMultiplier = 1,
  payPeriodsPerYear = 26,
}) {
  const payType = String(employee?.payType || employee?.pay_type || "hourly");
  const multiplier = isCorrection ? Number(correctionMultiplier || 1) : 1;

  if (payType === "salary") {
    const annual = Number(employee?.annualSalary ?? employee?.annual_salary ?? 0);
    const periods = Math.max(1, Number(payPeriodsPerYear || 26));
    return roundMoney((annual / periods) * multiplier);
  }

  const prevailing = Number(
    employee?.metadata?.prevailingWageRate ?? employee?.metadata?.prevailing_wage_rate ?? 0,
  );
  const rate = roundMoney(
    prevailing > 0 ? prevailing : resolveHourlyRate(employee, hourlyRateOverride, rateKey),
  );

  const regular = roundMoney(Number(hoursRegular || 0) * rate);
  const overtime = roundMoney(Number(hoursOvertime || 0) * rate * 1.5);
  const holiday = roundMoney(Number(hoursHoliday || 0) * rate * 1.5);
  const pto = roundMoney(Number(hoursPto || 0) * rate);
  const sick = roundMoney(Number(hoursSick || 0) * rate);
  const bonus = roundMoney(Number(bonusAmount || 0));

  return roundMoney((regular + overtime + holiday + pto + sick + bonus) * multiplier);
}

/**
 * Calculate one pay run line. Pure — safe for unit tests.
 */
export function calculatePayrollRunItem({
  employee = {},
  hoursRegular = 0,
  hoursOvertime = 0,
  hoursHoliday = 0,
  hoursPto = 0,
  hoursSick = 0,
  hourlyRateOverride,
  rateKey,
  bonusAmount = 0,
  taxTables = {},
  ytdBefore = {},
  additionalDeductions = [],
  payPeriodsPerYear = 26,
  isCorrection = false,
  correctionMultiplier = 1,
}) {
  const taxForm = String(employee?.taxForm || employee?.tax_form || "w2").toLowerCase();
  const grossPay = computeGrossPay({
    employee,
    hoursRegular,
    hoursOvertime,
    hoursHoliday,
    hoursPto,
    hoursSick,
    hourlyRateOverride,
    rateKey,
    bonusAmount,
    isCorrection,
    correctionMultiplier,
    payPeriodsPerYear,
  });

  const ytd = normalizeYtdTotals(ytdBefore);

  if (taxForm === "1099") {
    const additional = roundMoney(
      (additionalDeductions || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
    );
    const netPay = roundMoney(Math.max(0, grossPay - additional));
    return buildResult({
      grossPay,
      netPay,
      employee,
      taxForm: "1099",
      deductions: {
        federalWithholding: 0,
        stateWithholding: 0,
        localWithholding: 0,
        socialSecurity: 0,
        medicare: 0,
        additional,
        totalEmployeeTaxes: 0,
        totalAdditional: additional,
      },
      employerTaxes: { socialSecurity: 0, medicare: 0, futa: 0, suta: 0, training: 0, total: 0 },
      ytd,
    });
  }

  const filingStatus = String(employee?.filingStatus || employee?.filing_status || "single");
  const w4Data = employee?.w4Data || employee?.w4_data || {};
  const extraWithholding = roundMoney(
    employee?.w4ExtraWithholding ?? employee?.w4_extra_withholding ?? 0,
  );
  const federalExempt = Boolean(employee?.federalExempt ?? employee?.federal_exempt);
  const stateExempt = Boolean(employee?.stateExempt ?? employee?.state_exempt);

  const workState =
    employee?.workState || employee?.work_state || employee?.addressState || employee?.address_state || "";
  const workCity = employee?.addressCity || employee?.address_city || "";

  const fica = taxTables.fica || {};
  const ssRate = Number(fica.socialSecurityRate ?? 0.062);
  const medicareRate = Number(fica.medicareRate ?? 0.0145);
  const additionalMedicareRate = Number(fica.additionalMedicareRate ?? 0.009);
  const ssWageBase = Number(fica.socialSecurityWageBase ?? 184500);
  const additionalMedicareThreshold = Number(fica.additionalMedicareThreshold ?? 200000);

  const federalWithholding = calculateFederalWithholdingPub15T({
    grossPay,
    payPeriodsPerYear,
    filingStatus,
    w4Data,
    w4ExtraWithholding: extraWithholding,
    federalExempt,
    taxTables,
    isCorrection,
  });

  const stateWithholding = calculateStateWithholding({
    grossPay,
    workState,
    filingStatus,
    stateExempt,
    stateExtraWithholding: employee?.stateWithholdingExtra ?? employee?.state_withholding_extra ?? 0,
    payPeriodsPerYear,
    taxTables,
    w4Data,
  });

  const localWithholding = calculateLocalWithholding({
    grossPay,
    workState,
    workCity,
    taxTables,
    localExempt: Boolean(employee?.stateWithholdingData?.localExempt),
  });

  const stateEmployeeTaxes = calculateStateEmployeeTaxes({
    grossPay,
    workState,
    ytdGrossBefore: ytd.grossPay,
    taxTables,
  });
  const stateDisability = roundMoney(stateEmployeeTaxes.stateDisability || 0);

  const ssRemainingBase = Math.max(0, ssWageBase - ytd.grossPay);
  const ssTaxable = Math.min(grossPay, ssRemainingBase);
  const socialSecurity = roundMoney(ssTaxable * ssRate);

  const medicare = roundMoney(grossPay * medicareRate);
  const ytdGrossAfter = ytd.grossPay + grossPay;
  const additionalMedicare =
    ytdGrossAfter > additionalMedicareThreshold && ytd.grossPay <= additionalMedicareThreshold
      ? roundMoney((ytdGrossAfter - additionalMedicareThreshold) * additionalMedicareRate)
      : ytdGrossAfter > additionalMedicareThreshold
        ? roundMoney(grossPay * additionalMedicareRate)
        : 0;

  const additional = roundMoney(
    (additionalDeductions || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );

  const totalEmployeeTaxes = roundMoney(
    federalWithholding +
      stateWithholding +
      localWithholding +
      stateDisability +
      socialSecurity +
      medicare +
      additionalMedicare,
  );

  const netPay = roundMoney(Math.max(0, grossPay - totalEmployeeTaxes - additional));

  const futa = taxTables.futa || {};
  const futaRate = Number(futa.rate ?? 0.006);
  const futaWageBase = Number(futa.wageBase ?? 7000);
  const futaRemaining = Math.max(0, futaWageBase - ytd.grossPay);
  const futaTaxable = Math.min(grossPay, futaRemaining);
  const employerFuta = roundMoney(futaTaxable * futaRate);
  const employerSocialSecurity = socialSecurity;
  const employerMedicare = roundMoney(medicare + additionalMedicare);

  const stateEmployer = calculateStateEmployerTaxes({
    grossPay,
    workState,
    ytdGrossBefore: ytd.grossPay,
    taxTables,
  });

  const employerTaxes = {
    socialSecurity: employerSocialSecurity,
    medicare: employerMedicare,
    futa: employerFuta,
    suta: stateEmployer.suta,
    training: stateEmployer.training,
    total: roundMoney(
      employerSocialSecurity +
        employerMedicare +
        employerFuta +
        stateEmployer.total,
    ),
  };

  return buildResult({
    grossPay,
    netPay,
    employee,
    taxForm: "w2",
    filingStatus,
    workState,
    deductions: {
      federalWithholding,
      stateWithholding,
      localWithholding,
      stateDisability,
      socialSecurity,
      medicare: roundMoney(medicare + additionalMedicare),
      additional,
      totalEmployeeTaxes: roundMoney(totalEmployeeTaxes + additional),
      totalAdditional: additional,
    },
    employerTaxes,
    ytd,
  });
}

function buildResult({
  grossPay,
  netPay,
  employee,
  taxForm,
  filingStatus,
  workState,
  deductions,
  employerTaxes,
  ytd,
}) {
  const d = deductions;
  return {
    grossPay,
    deductions: d,
    employerTaxes,
    netPay,
    ytdAfter: {
      grossPay: roundMoney(ytd.grossPay + grossPay),
      federalWithholding: roundMoney(ytd.federalWithholding + (d.federalWithholding || 0)),
      stateWithholding: roundMoney(ytd.stateWithholding + (d.stateWithholding || 0)),
      localWithholding: roundMoney(ytd.localWithholding + (d.localWithholding || 0)),
      socialSecurity: roundMoney(ytd.socialSecurity + (d.socialSecurity || 0)),
      medicare: roundMoney(ytd.medicare + (d.medicare || 0)),
      netPay: roundMoney(ytd.netPay + netPay),
    },
    stubSnapshot: {
      taxForm,
      filingStatus,
      workState,
      grossPay,
      netPay,
      federalWithholding: d.federalWithholding,
      stateWithholding: d.stateWithholding,
      localWithholding: d.localWithholding,
      socialSecurity: d.socialSecurity,
      medicare: d.medicare,
      employerTaxes,
    },
    laborBurden: roundMoney(
      Number(grossPay || 0) + Number(employerTaxes?.total || 0),
    ),
  };
}

export function summarizePayrollRunItems(items = []) {
  const totals = {
    grossPay: 0,
    netPay: 0,
    federalWithholding: 0,
    stateWithholding: 0,
    localWithholding: 0,
    socialSecurity: 0,
    medicare: 0,
    additionalDeductions: 0,
    employerTaxes: 0,
    laborBurden: 0,
    employeeCount: items.length,
  };

  for (const item of items) {
    totals.grossPay += Number(item.grossPay ?? item.gross_pay ?? 0);
    totals.netPay += Number(item.netPay ?? item.net_pay ?? 0);
    totals.laborBurden += Number(item.laborBurden ?? item.labor_burden ?? 0);
    const d = item.deductions || {};
    totals.federalWithholding += Number(d.federalWithholding || 0);
    totals.stateWithholding += Number(d.stateWithholding || 0);
    totals.localWithholding += Number(d.localWithholding || 0);
    totals.socialSecurity += Number(d.socialSecurity || 0);
    totals.medicare += Number(d.medicare || 0);
    totals.additionalDeductions += Number(d.additional || 0);
    const e = item.employerTaxes || item.employer_taxes || {};
    totals.employerTaxes += Number(e.total || 0);
  }

  for (const key of Object.keys(totals)) {
    if (key !== "employeeCount") totals[key] = roundMoney(totals[key]);
  }

  return totals;
}

export function payPeriodsPerYear(scheduleType) {
  const schedule = String(scheduleType || "biweekly").toLowerCase();
  if (schedule === "weekly") return 52;
  if (schedule === "semimonthly") return 24;
  if (schedule === "monthly") return 12;
  return 26;
}
