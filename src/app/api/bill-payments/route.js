import { GET as secureGetBills, POST as secureCreateBill } from "./bills/route";
import { enforceSameOriginForMutation } from "@/lib/request-security";

// Legacy compatibility route kept for older clients.
// Security is delegated to the authenticated /api/bill-payments/bills handlers.
export async function GET(request) {
  return secureGetBills(request);
}

export async function POST(request) {
  const csrfResponse = enforceSameOriginForMutation(request);
  if (csrfResponse) return csrfResponse;
  return secureCreateBill(request);
}
