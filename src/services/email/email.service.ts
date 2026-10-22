import sgMail from '@sendgrid/mail';
import { env } from '../../config/env.js';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export type EmailContent = Pick<SendEmailInput, 'subject' | 'text' | 'html'>;

let initialised = false;

function isConfigured(): boolean {
  return Boolean(env.sendgridApiKey && env.emailFrom);
}

/**
 * Sends a transactional email through SendGrid.
 *
 * When SendGrid isn't configured, non-production environments log the email and skip sending
 * so local development works without credentials; production throws so misconfiguration is loud.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!isConfigured()) {
    if (env.nodeEnv === 'production') {
      throw new Error('SENDGRID_API_KEY and EMAIL_FROM must be set to send email');
    }
    console.warn(`[email] SendGrid not configured; skipped "${input.subject}" to ${input.to}`);
    return;
  }

  if (!initialised) {
    sgMail.setApiKey(env.sendgridApiKey!);
    initialised = true;
  }

  await sgMail.send({ ...input, from: env.emailFrom! });
}

/**
 * Fire-and-forget variant for flows where email failure must not fail the request
 * (e.g. notifications). Errors are logged, never thrown.
 */
export function sendEmailSafe(input: SendEmailInput): void {
  sendEmail(input).catch((err) => {
    console.error(`[email] Failed to send "${input.subject}" to ${input.to}:`, err);
  });
}
