/** Legacy national bill-pay network is retired. */

export const BILL_PAY_DISABLED_CODE = "BILL_PAY_DISABLED";

export const BILL_PAY_DISABLED_MESSAGE =
  "Bill pay to external billers is not available. Use Expenses to track bills, or Invoices to collect from clients.";

export function billPayDisabledResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error: BILL_PAY_DISABLED_MESSAGE,
      code: BILL_PAY_DISABLED_CODE,
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
