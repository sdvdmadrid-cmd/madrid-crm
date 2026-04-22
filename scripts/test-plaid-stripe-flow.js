const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function loadLocalEnv() {
  const envFiles = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
  ];

  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    const content = fs.readFileSync(envFile, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
      const separatorIndex = line.indexOf("=");
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function assertEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function logStep(title, details) {
  console.log(`\n=== ${title} ===`);
  if (details) {
    console.log(details);
  }
}

function isMissingTableError(error) {
  return String(error?.code || "") === "PGRST205";
}

(async () => {
  loadLocalEnv();

  const stripeSecretKey = assertEnv("STRIPE_SECRET_KEY");
  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");

  const [{ default: Stripe }, { createClient }] = await Promise.all([
    import("stripe"),
    import("@supabase/supabase-js"),
  ]);

  const stripe = new Stripe(stripeSecretKey);
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const billId = crypto.randomUUID();
  const paymentMethodId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  let stripeCustomer = null;
  let stripeBankAccount = null;
  let paymentIntent = null;
  let databaseAvailable = true;

  try {
    logStep("Step 1", "Simulating Plaid account connection by generating the Stripe bank account token that Plaid would normally return.");

    const plaidEquivalentToken = await stripe.tokens.create({
      bank_account: {
        country: "US",
        currency: "usd",
        account_holder_name: "Plaid Test User",
        account_holder_type: "individual",
        routing_number: "110000000",
        account_number: "000123456789",
      },
    });

    console.log(
      JSON.stringify(
        {
          simulatedPlaidConnection: true,
          bankAccountTokenId: plaidEquivalentToken.id,
          tokenObject: plaidEquivalentToken.object,
        },
        null,
        2,
      ),
    );

    logStep("Step 2", "Creating a Stripe customer, persisting the customer and Plaid-linked payment method row, then attaching the bank account to Stripe.");

    stripeCustomer = await stripe.customers.create({
      email: `plaid-test+${tenantId.slice(0, 8)}@example.com`,
      name: "Plaid Flow Test",
      metadata: {
        source: "plaid_stripe_test",
        tenantId,
        userId,
      },
    });

    const { error: customerInsertError } = await supabase
      .from("bill_payment_customers")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        stripe_customer_id: stripeCustomer.id,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (customerInsertError && !isMissingTableError(customerInsertError)) {
      throw customerInsertError;
    }
    if (isMissingTableError(customerInsertError)) {
      databaseAvailable = false;
    }

    if (databaseAvailable) {
      const { error: methodInsertError } = await supabase
        .from("bill_payment_methods")
        .insert({
          id: paymentMethodId,
          tenant_id: tenantId,
          user_id: userId,
          stripe_customer_id: stripeCustomer.id,
          stripe_payment_method_id: "plaid:test-account",
          method_type: "bank_account",
          method_label: "Plaid Sandbox ••••6789",
          brand: "plaid",
          bank_name: "Plaid Sandbox",
          last4: "6789",
          fingerprint: crypto.createHash("sha256").update(`plaid:test:${tenantId}`).digest("hex"),
          is_default: true,
          allow_autopay: false,
          status: "linked_external",
          metadata: {
            provider: "plaid",
            plaid_item_id: `item-${tenantId.slice(0, 8)}`,
            plaid_account_id: `account-${userId.slice(0, 8)}`,
            plaid_access_token: "simulated-for-test",
            access_token_present: true,
          },
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (methodInsertError && !isMissingTableError(methodInsertError)) {
        throw methodInsertError;
      }
      if (isMissingTableError(methodInsertError)) {
        databaseAvailable = false;
      }
    }

    stripeBankAccount = await stripe.customers.createSource(stripeCustomer.id, {
      source: plaidEquivalentToken.id,
    });

    const bridgeTimestamp = new Date().toISOString();
    if (databaseAvailable) {
      const { error: methodUpdateError } = await supabase
        .from("bill_payment_methods")
        .update({
          stripe_payment_method_id: stripeBankAccount.id,
          method_label: `${stripeBankAccount.bank_name || "Bank"} ••••${stripeBankAccount.last4 || ""}`,
          bank_name: stripeBankAccount.bank_name || "",
          last4: stripeBankAccount.last4 || "",
          status: stripeBankAccount.status === "errored" ? "failed" : "active",
          metadata: {
            provider: "plaid",
            plaid_item_id: `item-${tenantId.slice(0, 8)}`,
            plaid_account_id: `account-${userId.slice(0, 8)}`,
            plaid_access_token: "simulated-for-test",
            stripe_bank_account_id: stripeBankAccount.id,
            bridged_to_stripe_at: bridgeTimestamp,
          },
          updated_at: bridgeTimestamp,
        })
        .eq("id", paymentMethodId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (methodUpdateError && !isMissingTableError(methodUpdateError)) {
        throw methodUpdateError;
      }
      if (isMissingTableError(methodUpdateError)) {
        databaseAvailable = false;
      }
    }

    let storedCustomer = null;
    let storedMethod = null;
    if (databaseAvailable) {
      const [customerResult, methodResult] = await Promise.all([
        supabase
          .from("bill_payment_customers")
          .select("tenant_id, user_id, stripe_customer_id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("bill_payment_methods")
          .select(
            "id, stripe_customer_id, stripe_payment_method_id, bank_name, last4, status, metadata",
          )
          .eq("id", paymentMethodId)
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (customerResult.error) {
        throw customerResult.error;
      }
      if (methodResult.error) {
        throw methodResult.error;
      }

      storedCustomer = customerResult.data;
      storedMethod = methodResult.data;
    }

    console.log(
      JSON.stringify(
        {
          stripeCustomerCreated: Boolean(stripeCustomer?.id),
          stripeCustomerId: stripeCustomer?.id,
          stripeBankAccountCreated: Boolean(stripeBankAccount?.id),
          stripeBankAccountId: stripeBankAccount?.id,
          databaseAvailable,
          storedCustomerMatches: databaseAvailable
            ? storedCustomer?.stripe_customer_id === stripeCustomer?.id
            : null,
          storedMethodMatches: databaseAvailable
            ? storedMethod?.stripe_payment_method_id === stripeBankAccount?.id &&
              storedMethod?.stripe_customer_id === stripeCustomer?.id
            : null,
          storedMethodStatus: databaseAvailable ? storedMethod?.status || null : null,
        },
        null,
        2,
      ),
    );

    let verifiedBankAccount = stripeBankAccount;
    try {
      verifiedBankAccount = await stripe.customers.verifySource(
        stripeCustomer.id,
        stripeBankAccount.id,
        { amounts: [32, 45] },
      );
      console.log(
        JSON.stringify(
          {
            bankAccountVerificationAttempted: true,
            verificationStatus: verifiedBankAccount.status || null,
          },
          null,
          2,
        ),
      );
    } catch (verificationError) {
      console.log(
        JSON.stringify(
          {
            bankAccountVerificationAttempted: true,
            verificationStatus: "failed_to_verify",
            verificationError: verificationError.message,
          },
          null,
          2,
        ),
      );
    }

    logStep("Step 3", "Creating a bill transaction and confirming a PaymentIntent with the attached bank account source.");

    if (databaseAvailable) {
      const { error: billInsertError } = await supabase
        .from("bills")
        .insert({
          id: billId,
          tenant_id: tenantId,
          user_id: userId,
          provider_name: "Plaid Stripe Test Utility",
          account_label: "Sandbox account",
          account_reference_masked: "••••6789",
          amount_due: 5,
          currency: "usd",
          due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          status: "open",
          source: "manual",
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (billInsertError && !isMissingTableError(billInsertError)) {
        throw billInsertError;
      }
      if (isMissingTableError(billInsertError)) {
        databaseAvailable = false;
      }
    }

    if (databaseAvailable) {
      const { error: transactionInsertError } = await supabase
        .from("bill_payment_transactions")
        .insert({
          id: transactionId,
          tenant_id: tenantId,
          user_id: userId,
          bill_id: billId,
          payment_method_id: paymentMethodId,
          provider_name: "Plaid Stripe Test Utility",
          account_reference_masked: "••••6789",
          amount: 5,
          currency: "usd",
          status: "scheduled",
          source: "manual",
          stripe_payment_method_id: stripeBankAccount.id,
          metadata: { source: "plaid_stripe_test" },
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (transactionInsertError && !isMissingTableError(transactionInsertError)) {
        throw transactionInsertError;
      }
      if (isMissingTableError(transactionInsertError)) {
        databaseAvailable = false;
      }
    }

    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: 500,
        currency: "usd",
        customer: stripeCustomer.id,
        payment_method: verifiedBankAccount.id,
        payment_method_types: ["us_bank_account"],
        confirm: true,
        off_session: true,
        mandate_data: {
          customer_acceptance: {
            type: "online",
            online: {
              ip_address: "127.0.0.1",
              user_agent: "Plaid Stripe Flow Test",
            },
          },
        },
        metadata: {
          source: "bill_payment_test",
          transactionId,
          billId,
          tenantId,
          userId,
        },
      });
    } catch (paymentIntentError) {
      paymentIntent = {
        id: null,
        status: "requires_payment_method",
        last_payment_error: {
          message: paymentIntentError.message,
        },
      };
    }

    const nextStatus =
      paymentIntent.status === "succeeded"
        ? "paid"
        : paymentIntent.status === "processing"
          ? "processing"
          : paymentIntent.status === "requires_payment_method"
            ? "failed"
            : "processing";
    const resultTimestamp = new Date().toISOString();

    if (databaseAvailable) {
      const [{ error: transactionUpdateError }, { error: billUpdateError }] =
        await Promise.all([
          supabase
            .from("bill_payment_transactions")
            .update({
              stripe_payment_intent_id: paymentIntent.id,
              status: nextStatus,
              processed_at: nextStatus === "paid" ? resultTimestamp : null,
              failed_at: nextStatus === "failed" ? resultTimestamp : null,
              failure_reason:
                nextStatus === "failed"
                  ? paymentIntent.last_payment_error?.message || "Payment failed"
                  : "",
              updated_at: resultTimestamp,
            })
            .eq("id", transactionId)
            .eq("tenant_id", tenantId),
          supabase
            .from("bills")
            .update({
              status: nextStatus === "paid" ? "paid" : nextStatus === "failed" ? "open" : "processing",
              last_paid_at: nextStatus === "paid" ? resultTimestamp : null,
              last_payment_id: transactionId,
              updated_at: resultTimestamp,
            })
            .eq("id", billId)
            .eq("tenant_id", tenantId),
        ]);

      if (transactionUpdateError && !isMissingTableError(transactionUpdateError)) {
        throw transactionUpdateError;
      }
      if (billUpdateError && !isMissingTableError(billUpdateError)) {
        throw billUpdateError;
      }
      if (
        isMissingTableError(transactionUpdateError) ||
        isMissingTableError(billUpdateError)
      ) {
        databaseAvailable = false;
      }
    }

    let storedTransaction = null;
    let storedBill = null;
    if (databaseAvailable) {
      const [transactionResult, billResult] = await Promise.all([
        supabase
          .from("bill_payment_transactions")
          .select(
            "id, stripe_payment_intent_id, stripe_payment_method_id, status, failure_reason",
          )
          .eq("id", transactionId)
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        supabase
          .from("bills")
          .select("id, status, last_payment_id")
          .eq("id", billId)
          .eq("tenant_id", tenantId)
          .maybeSingle(),
      ]);

      if (transactionResult.error) {
        throw transactionResult.error;
      }
      if (billResult.error) {
        throw billResult.error;
      }

      storedTransaction = transactionResult.data;
      storedBill = billResult.data;
    }

    console.log(
      JSON.stringify(
        {
          paymentIntentId: paymentIntent.id,
          paymentIntentStatus: paymentIntent.status,
          handledStatus: nextStatus,
          databaseAvailable,
          bankAccountStatus: verifiedBankAccount.status || null,
          storedTransactionMatches: databaseAvailable
            ? storedTransaction?.stripe_payment_method_id === verifiedBankAccount.id &&
              storedTransaction?.stripe_payment_intent_id === paymentIntent.id &&
              storedTransaction?.status === nextStatus
            : null,
          storedBillMatches: databaseAvailable
            ? storedBill?.last_payment_id === transactionId &&
              storedBill?.status ===
                (nextStatus === "paid"
                  ? "paid"
                  : nextStatus === "failed"
                    ? "open"
                    : "processing")
            : null,
          failureReason: paymentIntent.last_payment_error?.message || null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("\nTEST FAILED");
    console.error(error);
    process.exitCode = 1;
  }
})();
