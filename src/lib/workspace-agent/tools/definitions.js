/**
 * OpenAI function tools for FieldBase workspace operations agent.
 */

export const WORKSPACE_OPERATIONS_TOOLS = [
  {
    type: "function",
    function: {
      name: "searchClients",
      description: "Find clients by name, phone, email, or address.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchJobs",
      description: "Find jobs/projects by title or client name.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchEstimates",
      description: "Find estimates by client name or estimate number.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchInvoices",
      description: "Find invoices; use status unpaid for open balances.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          status: { type: "string", description: "Optional: unpaid" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchAppointments",
      description: "Find calendar appointments by title, client, or date text.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createClient",
      description: "Create a new client record.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          zip: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateClient",
      description: "Update an existing client by id.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createEstimate",
      description:
        "Create an estimate with line items from the services catalog. Set send true to email the client.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string" },
          servicesDescription: {
            type: "string",
            description: "Comma-separated services e.g. spring cleanup, 10 yards mulch",
          },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
          tax: { type: "number" },
          notes: { type: "string" },
          address: { type: "string" },
          send: { type: "boolean", description: "Send to client immediately" },
        },
        required: ["clientName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvoice",
      description: "Create an invoice from a job title/query or manual line items.",
      parameters: {
        type: "object",
        properties: {
          jobTitle: { type: "string" },
          jobQuery: { type: "string" },
          clientName: { type: "string" },
          amount: { type: "number" },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createContract",
      description: "Generate and save a contract from a matching estimate.",
      parameters: {
        type: "object",
        properties: {
          estimateQuery: { type: "string" },
          clientName: { type: "string" },
          jobTitle: { type: "string" },
          additionalTerms: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createJob",
      description: "Create a job/project for a client.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          clientName: { type: "string" },
          clientId: { type: "string" },
          address: { type: "string" },
          description: { type: "string" },
          status: { type: "string" },
          price: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createAppointment",
      description:
        "Schedule a calendar appointment. Provide date YYYY-MM-DD and time HH:MM. Location must be a real US address (verified via Google).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          clientName: { type: "string" },
          date: { type: "string" },
          time: { type: "string" },
          endTime: { type: "string" },
          location: { type: "string" },
          notes: { type: "string" },
          crew: { type: "string", description: "Crew name in notes if needed" },
        },
        required: ["clientName", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sendEstimate",
      description: "Mark estimate sent and deliver email/SMS to client.",
      parameters: {
        type: "object",
        properties: {
          estimateId: { type: "string" },
          viaEmail: { type: "boolean" },
          viaText: { type: "boolean" },
        },
        required: ["estimateId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generatePDF",
      description: "Get PDF download path for an estimate or invoice.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["estimate", "invoice"] },
          id: { type: "string" },
        },
        required: ["entity", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchPayrollEmployees",
      description: "Find payroll employees by name or email.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculateEmployeePaycheck",
      description:
        "Calculate a paycheck for an employee given hours and optional hourly rate. Example: Jorge 7 hours at $25/hour.",
      parameters: {
        type: "object",
        properties: {
          employeeName: { type: "string" },
          hoursRegular: { type: "number" },
          hourlyRate: { type: "number" },
        },
        required: ["employeeName", "hoursRegular"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runPayrollForPeriod",
      description: "Create and calculate a pay run for the current week or period using approved time entries.",
      parameters: {
        type: "object",
        properties: {
          scheduleType: {
            type: "string",
            enum: ["weekly", "biweekly", "semimonthly", "monthly"],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPayrollReport",
      description: "Generate payroll report by date range, YTD, monthly, or by employee name.",
      parameters: {
        type: "object",
        properties: {
          reportType: {
            type: "string",
            enum: ["date_range", "weekly", "monthly", "quarterly", "ytd"],
          },
          startDate: { type: "string" },
          endDate: { type: "string" },
          employeeName: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "findEmployeesMissingHours",
      description: "List hourly employees with no time entries in the current pay period.",
      parameters: {
        type: "object",
        properties: {
          scheduleType: { type: "string", enum: ["weekly", "biweekly"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getJobPayrollCost",
      description:
        "Show payroll and labor burden cost for a project/job by name. Example: Glendale Lakes.",
      parameters: {
        type: "object",
        properties: { jobSearch: { type: "string" } },
        required: ["jobSearch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getLaborCostByProject",
      description: "List labor cost and burden for all projects/jobs this month.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getProjectProfitSummary",
      description:
        "Show revenue, labor cost, and profit for a project. Example: What was the profit on Smith Patio Project?",
      parameters: {
        type: "object",
        properties: { jobSearch: { type: "string" } },
        required: ["jobSearch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMaterialCostByProject",
      description: "Show material and vendor costs by project/job.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "listLosingJobs",
      description: "List jobs/projects that are losing money (negative gross profit).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvoiceForJob",
      description: "Generate an invoice for a completed job by name. Supports progress, final, or full billing.",
      parameters: {
        type: "object",
        properties: {
          jobSearch: { type: "string" },
          billingType: { type: "string", enum: ["full", "progress", "final", "change_order"] },
        },
        required: ["jobSearch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMonthlyProfitReport",
      description: "Show monthly revenue, costs, and profit report.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getOutstandingInvoices",
      description: "Show outstanding invoices and accounts receivable.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getPayrollCostsThisMonth",
      description: "Show payroll and job expense costs for the current month.",
      parameters: { type: "object", properties: {} },
    },
  },
];
