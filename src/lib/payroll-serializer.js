function toText(value) {
  return String(value ?? "").trim();
}

export function serializePayrollEmployee(row = {}) {
  return {
    id: row.id,
    _id: row.id,
    tenantId: row.tenant_id || "",
    userId: row.user_id || null,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    fullName: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    email: row.email || "",
    phone: row.phone || "",
    addressStreet: row.address_street || "",
    addressCity: row.address_city || "",
    addressState: row.address_state || "",
    addressZip: row.address_zip || "",
    workState: row.work_state || row.address_state || "",
    ssnLast4: row.ssn_last4 || "",
    hasSsn: Boolean(row.ssn_encrypted),
    taxForm: row.tax_form || "w2",
    payType: row.pay_type || "hourly",
    hourlyRate: Number(row.hourly_rate || 0),
    annualSalary: Number(row.annual_salary || 0),
    filingStatus: row.filing_status || "single",
    w4ExtraWithholding: Number(row.w4_extra_withholding || 0),
    w4Data: row.w4_data || {},
    dateOfBirth: row.date_of_birth || null,
    federalExempt: Boolean(row.federal_exempt),
    stateExempt: Boolean(row.state_exempt),
    stateWithholdingExtra: Number(row.state_withholding_extra || 0),
    stateWithholdingData: row.state_withholding_data || {},
    ptoBalanceHours: Number(row.pto_balance_hours || 0),
    sickBalanceHours: Number(row.sick_balance_hours || 0),
    directDepositLast4: row.direct_deposit_last4 || "",
    hasDirectDeposit: Boolean(row.direct_deposit_encrypted),
    status: row.status || "active",
    hireDate: row.hire_date || null,
    terminationDate: row.termination_date || null,
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function serializePayrollRun(row = {}) {
  return {
    id: row.id,
    _id: row.id,
    tenantId: row.tenant_id || "",
    scheduleType: row.schedule_type || "biweekly",
    periodStart: row.period_start || null,
    periodEnd: row.period_end || null,
    payDate: row.pay_date || null,
    status: row.status || "draft",
    title: row.title || "",
    notes: row.notes || "",
    taxTableVersion: row.tax_table_version || "",
    totals: row.totals || {},
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at || null,
    runType: row.run_type || "regular",
    correctionOfRunId: row.correction_of_run_id || null,
    voidedAt: row.voided_at || null,
    voidReason: row.void_reason || "",
    finalizedAt: row.finalized_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function serializePayrollRunItem(row = {}, employee = null) {
  const employeePayload =
    employee && typeof employee === "object"
      ? serializePayrollEmployee(employee)
      : row.employee
        ? serializePayrollEmployee(row.employee)
        : null;

  return {
    id: row.id,
    _id: row.id,
    tenantId: row.tenant_id || "",
    runId: row.run_id,
    employeeId: row.employee_id,
    employee: employeePayload,
    hoursRegular: Number(row.hours_regular || 0),
    hoursOvertime: Number(row.hours_overtime || 0),
    ptoHours: Number(row.pto_hours || 0),
    sickHours: Number(row.sick_hours || 0),
    hourlyRate: Number(row.hourly_rate || 0),
    jobId: row.job_id || null,
    correctionOfItemId: row.correction_of_item_id || null,
    grossPay: Number(row.gross_pay || 0),
    deductions: row.deductions || {},
    employerTaxes: row.employer_taxes || {},
    netPay: Number(row.net_pay || 0),
    stubSnapshot: row.stub_snapshot || {},
    ytdSnapshot: row.ytd_snapshot || {},
    notes: row.notes || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function serializePayrollSettings(row = {}) {
  return {
    tenantId: row.tenant_id || "",
    employerLegalName: row.employer_legal_name || "",
    hasEmployerEin: Boolean(row.employer_ein_encrypted),
    defaultPaySchedule: row.default_pay_schedule || "biweekly",
    payWeekStartDay: Number(row.pay_week_start_day ?? 1),
    defaultWorkState: row.default_work_state || "",
    futaRate: Number(row.futa_rate ?? 0.006),
    sutaRate: Number(row.suta_rate ?? 0.027),
    metadata: row.metadata || {},
    updatedAt: row.updated_at || null,
  };
}

export function buildEmployeeInsertRow(body = {}, tenantId, userId) {
  return {
    tenant_id: tenantId,
    user_id: userId || null,
    first_name: toText(body.firstName),
    last_name: toText(body.lastName),
    email: toText(body.email).toLowerCase(),
    phone: toText(body.phone),
    address_street: toText(body.addressStreet),
    address_city: toText(body.addressCity),
    address_state: toText(body.addressState).toUpperCase(),
    address_zip: toText(body.addressZip),
    work_state: toText(body.workState || body.addressState).toUpperCase(),
    tax_form: toText(body.taxForm || "w2").toLowerCase(),
    pay_type: toText(body.payType || "hourly").toLowerCase(),
    hourly_rate: Number(body.hourlyRate || 0),
    annual_salary: Number(body.annualSalary || 0),
    filing_status: toText(body.filingStatus || "single").toLowerCase(),
    w4_extra_withholding: Number(body.w4ExtraWithholding || 0),
    w4_data: body.w4Data && typeof body.w4Data === "object" ? body.w4Data : {},
    date_of_birth: body.dateOfBirth || null,
    federal_exempt: Boolean(body.federalExempt),
    state_exempt: Boolean(body.stateExempt),
    state_withholding_extra: Number(body.stateWithholdingExtra || 0),
    state_withholding_data:
      body.stateWithholdingData && typeof body.stateWithholdingData === "object"
        ? body.stateWithholdingData
        : {},
    pto_balance_hours: Number(body.ptoBalanceHours ?? 0),
    sick_balance_hours: Number(body.sickBalanceHours ?? 0),
    status: toText(body.status || "active").toLowerCase(),
    hire_date: body.hireDate || null,
    termination_date: body.terminationDate || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    created_by: userId || null,
    updated_at: new Date().toISOString(),
  };
}
