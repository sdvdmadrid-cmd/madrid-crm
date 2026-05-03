import { GET as secureGetBills, POST as secureCreateBill } from "./bills/route";

// Legacy compatibility route kept for older clients.
// Security is delegated to the authenticated /api/bill-payments/bills handlers.
export async function GET(request) {
  return secureGetBills(request);
}

export async function POST(request) {
  return secureCreateBill(request);
}
