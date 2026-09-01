import { Resend } from "resend";

/**
 * Thin wrapper around Resend. No-ops (and logs) when `RESEND_API_KEY` is unset so
 * local dev doesn't need mail configured.
 */

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM ?? "expense@iws.world";
/** Testing: send every email here instead of the real recipient. */
const redirectTo = process.env.EMAIL_REDIRECT_TO?.trim() || null;
const client = apiKey ? new Resend(apiKey) : null;

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ id: string } | { skipped: true }> {
  const to = redirectTo ?? input.to;
  const subject = redirectTo ? `[test → ${input.to}] ${input.subject}` : input.subject;

  if (!client) {
    console.info(`[email] skipped (no RESEND_API_KEY): "${subject}" → ${to}`);
    return { skipped: true };
  }
  const { data, error } = await client.emails.send({
    from,
    to,
    subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { id: data?.id ?? "" };
}
