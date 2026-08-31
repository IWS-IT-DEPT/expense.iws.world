import { Resend } from "resend";

/**
 * Thin wrapper around Resend. No-ops (and logs) when `RESEND_API_KEY` is unset so
 * local dev doesn't need mail configured.
 */

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM ?? "expense@iws.world";
const client = apiKey ? new Resend(apiKey) : null;

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ id: string } | { skipped: true }> {
  if (!client) {
    console.info(`[email] skipped (no RESEND_API_KEY): "${input.subject}" → ${input.to}`);
    return { skipped: true };
  }
  const { data, error } = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { id: data?.id ?? "" };
}
