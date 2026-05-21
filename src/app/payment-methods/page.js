import { redirect } from "next/navigation";

/** Merged into Bill Payments → Wallet tab */
export default function PaymentMethodsRedirectPage() {
  redirect("/bill-payments?tab=wallet");
}
