/**
 * On-brand HTML wrapper for transactional email. Table layout + inline styles
 * for client compatibility; a matching plain-text version is produced too.
 */

const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");

const ACCENTS = {
  green: "#2f9e5a",
  amber: "#d97706",
  red: "#dc2626",
  blue: "#2731a8",
} as const;

export type EmailAccent = keyof typeof ACCENTS;

export interface EmailContent {
  /** hidden inbox-preview line */
  preheader?: string;
  heading: string;
  /** body paragraphs */
  paragraphs: string[];
  cta?: { label: string; url: string };
  accent?: EmailAccent;
  /** small print under the paragraphs, before the CTA (e.g. a reason) */
  callout?: { label: string; text: string };
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const accent = ACCENTS[c.accent ?? "green"];
  const host = APP_URL.replace(/^https?:\/\//, "") || "expense.iws.world";

  const paragraphsHtml = c.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:#3f3f46;">${esc(p)}</p>`,
    )
    .join("");

  const calloutHtml = c.callout
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
         <tr><td style="border-left:3px solid ${accent};background:#faf8f6;padding:10px 14px;border-radius:0 6px 6px 0;">
           <div style="font:600 11px/1.4 ${FONT};text-transform:uppercase;letter-spacing:.04em;color:#a1a1aa;margin-bottom:2px;">${esc(c.callout.label)}</div>
           <div style="font:400 14px/1.5 ${FONT};color:#3f3f46;">${esc(c.callout.text)}</div>
         </td></tr>
       </table>`
    : "";

  const ctaHtml = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 2px;">
         <tr><td style="border-radius:8px;background:${accent};">
           <a href="${esc(c.cta.url)}" style="display:inline-block;padding:11px 24px;font:600 14px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;">${esc(c.cta.label)} &rarr;</a>
         </td></tr>
       </table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  ${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden;">
        <tr><td style="background:${ACCENTS.green};padding:16px 28px;">
          <span style="font:700 16px/1 ${FONT};color:#ffffff;letter-spacing:.01em;">IWS&nbsp;Expense</span>
        </td></tr>
        <tr><td style="height:4px;background:${accent};line-height:4px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 28px 24px;">
          <h1 style="margin:0 0 14px;font:600 20px/1.35 ${FONT};color:#18181b;">${esc(c.heading)}</h1>
          ${paragraphsHtml}
          ${calloutHtml}
          ${ctaHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #efefef;font:400 12px/1.5 ${FONT};color:#a1a1aa;">
          IWS Expense &middot; <a href="${esc(APP_URL || "#")}" style="color:#a1a1aa;text-decoration:underline;">${esc(host)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs,
    ...(c.callout ? ["", `${c.callout.label}: ${c.callout.text}`] : []),
    ...(c.cta ? ["", `${c.cta.label}: ${c.cta.url}`] : []),
    "",
    "—",
    `IWS Expense · ${host}`,
  ].join("\n");

  return { html, text };
}
