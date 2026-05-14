import { getBillPaymentsPricingConfig } from "@/lib/bill-payments";

export async function GET() {
  const cardPricing = getBillPaymentsPricingConfig("card");
  const achPricing = getBillPaymentsPricingConfig("bank_account");

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        monthlyFeeUsd: cardPricing.monthlyFeeUsd,
        cardFeePercent: cardPricing.transactionFeePercent,
        bankAccountFeePercent: achPricing.transactionFeePercent,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
