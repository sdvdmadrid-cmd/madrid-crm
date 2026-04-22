import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendNotificationEmail(to, subject, text) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  } catch (error) {
    console.error('Error sending notification email:', error);
    throw error;
  }
}

export async function sendDueDateReminder(userEmail, bill) {
  const subject = `Reminder: Your bill for ${bill.provider_name} is due soon!`;
  const text = `Hello,

This is a friendly reminder that your bill for ${bill.provider_name} is due on ${bill.due_date}. The amount due is ${bill.amount_due}.

Thank you,
Bill Payments Team`;

  await sendNotificationEmail(userEmail, subject, text);
}

export async function sendPaymentConfirmation(userEmail, bill) {
  const subject = `Payment Confirmation: ${bill.provider_name}`;
  const text = `Hello,

Your payment for ${bill.provider_name} has been successfully processed. The amount paid was ${bill.amount_due}.

Thank you,
Bill Payments Team`;

  await sendNotificationEmail(userEmail, subject, text);
}