export const PAY_SCHEDULES = ["weekly", "biweekly", "semimonthly", "monthly"];

export const PAYROLL_RUN_STATUSES = [
  "draft",
  "calculated",
  "approved",
  "finalized",
  "void",
];

export const PAYROLL_RUN_TYPES = ["regular", "bonus", "correction", "void_reversal"];

export const MUTABLE_RUN_STATUSES = new Set(["draft", "calculated"]);

export const EMPLOYEE_STATUSES = ["active", "inactive", "terminated"];

export const TAX_FORMS = ["w2", "1099"];

export const PAY_TYPES = ["hourly", "salary"];

export const FILING_STATUSES = ["single", "married", "head_of_household"];

export const PAYROLL_TABLES = {
  SETTINGS: "payroll_settings",
  EMPLOYEES: "payroll_employees",
  RUNS: "payroll_runs",
  RUN_ITEMS: "payroll_run_items",
  TAX_TABLES: "payroll_tax_tables",
  TIME_ENTRIES: "payroll_time_entries",
  ACH_BATCHES: "payroll_ach_batches",
  AUDIT_LOG: "payroll_audit_log",
  EXPENSE_RECORDS: "payroll_expense_records",
  REMINDERS: "payroll_reminders",
};

export const TIME_ENTRY_TYPES = ["regular", "overtime", "pto", "sick", "break"];
export const TIME_ENTRY_STATUSES = ["open", "submitted", "approved", "void"];
