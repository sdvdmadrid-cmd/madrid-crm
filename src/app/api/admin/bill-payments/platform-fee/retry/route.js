import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

function normalizeRole(session) {
  return String(session?.role || "").toLowerCase();
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
    const session = verifySessionToken(token);

    if (!session || normalizeRole(session) !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { feeId, tenantId, chargeMonth } = await request.json();

    if (!feeId || !tenantId || !chargeMonth) {
      return NextResponse.json(
        { error: "Missing required fields: feeId, tenantId, chargeMonth" },
        { status: 400 }
      );
    }

    // Get the failed fee record
    const { data: feeRecord, error: feeError } = await supabaseAdmin
      .from("bill_payment_platform_fees")
      .select("*")
      .eq("id", feeId)
      .eq("status", "failed")
      .single();

    if (feeError || !feeRecord) {
      return NextResponse.json(
        { error: "Fee record not found or not in failed status" },
        { status: 404 }
      );
    }

    // Get stripe customer and payment method
    const stripeCustomerId = feeRecord.stripe_customer_id;
    const paymentMethodId = feeRecord.payment_method_id;

    if (!stripeCustomerId || !paymentMethodId) {
      return NextResponse.json(
        { error: "Missing Stripe customer or payment method for retry" },
        { status: 400 }
      );
    }

    try {
      // Create new PaymentIntent for retry
      const monthlyFeeUsd = Number(
        process.env.BILL_PAYMENTS_MONTHLY_FEE_USD || "5"
      );
      const amountCents = Math.round(monthlyFeeUsd * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `FieldBase platform fee - ${chargeMonth} (retry)`,
        metadata: {
          type: "platform_fee",
          tenant_id: tenantId,
          charge_month: chargeMonth,
          is_retry: true,
          original_fee_id: feeId,
        },
      });

      if (paymentIntent.status === "succeeded") {
        // Update fee record to paid
        const { error: updateError } = await supabaseAdmin
          .from("bill_payment_platform_fees")
          .update({
            status: "paid",
            charged_at: new Date().toISOString(),
            failed_at: null,
            failure_reason: null,
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq("id", feeId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        return NextResponse.json({
          success: true,
          message: "Charge retry successful",
          paymentIntentId: paymentIntent.id,
          status: "paid",
        });
      } else if (paymentIntent.status === "requires_action") {
        // Update fee record to mark as pending again
        const { error: updateError } = await supabaseAdmin
          .from("bill_payment_platform_fees")
          .update({
            status: "processing",
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq("id", feeId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        return NextResponse.json({
          success: true,
          message: "Charge retry requires further action",
          paymentIntentId: paymentIntent.id,
          status: "processing",
        });
      } else {
        // Payment failed again
        const failureReason = paymentIntent.last_payment_error?.message
          || `Payment failed: ${paymentIntent.status}`;

        const { error: updateError } = await supabaseAdmin
          .from("bill_payment_platform_fees")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            failure_reason: failureReason,
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq("id", feeId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        return NextResponse.json({
          success: false,
          message: "Charge retry failed",
          paymentIntentId: paymentIntent.id,
          status: "failed",
          failureReason,
        }, { status: 400 });
      }
    } catch (stripeError) {
      const failureReason = stripeError?.message || "Stripe error during retry";

      // Update fee record with new failure
      await supabaseAdmin
        .from("bill_payment_platform_fees")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: failureReason,
        })
        .eq("id", feeId);

      return NextResponse.json(
        {
          error: "Charge retry failed",
          failureReason,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[admin/platform-fee/retry] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
