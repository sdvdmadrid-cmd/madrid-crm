import "server-only";

import { logEmailAttempt, sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Send subscription confirmation email
 */
export async function sendSubscriptionConfirmationEmail({
  tenantId,
  email,
  tenantName,
  planName,
  trialDays = 30,
}) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      success: false,
      error: "Invalid email address",
    };
  }

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + trialDays);
  const trialEndFormatted = trialEndDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `Welcome to ${planName} on FieldBase`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 40px 20px; text-align: center; margin-bottom: 30px;">
        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Welcome to FieldBase!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Your ${trialDays}-day free trial has started</p>
      </div>

      <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
        <p style="margin: 0 0 16px 0; font-size: 14px; color: #666;">Hi ${tenantName || "there"},</p>
        
        <p style="margin: 0 0 16px 0; font-size: 14px; color: #666;">
          Your subscription to <strong>${planName}</strong> is now active! You have full access to all features.
        </p>

        <div style="background: white; border-left: 4px solid #667eea; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #333;">
            <strong>Trial Period:</strong> ${trialDays} days free<br />
            <strong>Trial Ends:</strong> ${trialEndFormatted}<br />
            <strong>Plan:</strong> ${planName}<br />
            <strong>Price:</strong> $35/month after trial
          </p>
        </div>

        <h3 style="margin: 24px 0 12px 0; font-size: 16px; color: #333; font-weight: 600;">What's Included:</h3>
        <ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 14px; color: #666;">
          <li style="margin-bottom: 8px;">✓ Bill payments management</li>
          <li style="margin-bottom: 8px;">✓ AutoPay scheduling</li>
          <li style="margin-bottom: 8px;">✓ Payment history & tracking</li>
          <li style="margin-bottom: 8px;">✓ Email invoices</li>
          <li style="margin-bottom: 8px;">✓ Mobile app access</li>
          <li style="margin-bottom: 8px;">✓ Priority support</li>
        </ul>

        <p style="margin: 0 0 16px 0; font-size: 14px; color: #666;">
          At the end of your trial, your subscription will automatically renew at the regular rate of $35/month. You can cancel anytime from your subscription settings.
        </p>

        <p style="margin: 0; font-size: 14px; color: #666;">
          If you have any questions or need help getting started, please reach out to our support team.
        </p>
      </div>

      <div style="background: #667eea; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <a href="https://fieldbase.io/subscriptions" style="display: inline-block; background: white; color: #667eea; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Manage Your Subscription
        </a>
      </div>

      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        © 2026 FieldBase. All rights reserved.
      </p>
    </div>
  `;

  const text = `Welcome to FieldBase!

Hi ${tenantName || "there"},

Your subscription to ${planName} is now active! You have full access to all features.

SUBSCRIPTION DETAILS:
- Trial Period: ${trialDays} days free
- Trial Ends: ${trialEndFormatted}
- Plan: ${planName}
- Price: $35/month after trial

WHAT'S INCLUDED:
• Bill payments management
• AutoPay scheduling
• Payment history & tracking
• Email invoices
• Mobile app access
• Priority support

At the end of your trial, your subscription will automatically renew at the regular rate of $35/month. You can cancel anytime from your subscription settings.

If you have any questions or need help getting started, please reach out to our support team.

© 2026 FieldBase. All rights reserved.`;

  const emailResult = await sendEmail({
    to: email,
    subject,
    html,
    text,
    metadata: { tenantId },
  });

  await logEmailAttempt({
    tenantId,
    recipient: email,
    provider: emailResult?.provider || "unknown",
    providerMessageId: emailResult?.providerMessageId || null,
    success: emailResult?.success === true,
    error: emailResult?.error || null,
    eventType: "subscription_confirmation",
  });

  return {
    success: emailResult?.success === true,
    error: emailResult?.error || null,
  };
}
