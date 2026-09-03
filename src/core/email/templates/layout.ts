/**
 * Shared email shell.
 *
 * Table-based and inline-styled on purpose: Outlook and several webmail clients strip
 * <style> blocks and do not support flex or grid. Every template also ships a plain
 * text alternative, because a missing text part is a strong spam signal.
 */
export type RenderedEmail = {subject: string; html: string; text: string};

const BRAND = "#2a4d46";
const INK = "#17181a";
const MUTED = "#5b5d5f";
const BORDER = "#d8d6cc";

export function renderLayout(input: {
  title: string;
  intro: string;
  bodyHtml: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): {html: string; text: string} {
  const cta = input.ctaLabel && input.ctaUrl
    ? `<tr><td style="padding:24px 0 8px;">
         <a href="${input.ctaUrl}"
            style="background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 24px;
                   border-radius:8px;font-weight:600;display:inline-block;">${input.ctaLabel}</a>
       </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${input.title}</title></head>
<body style="margin:0;padding:0;background:#f1f0ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f0ec;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:32px;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <tr><td style="font-weight:700;letter-spacing:0.04em;font-size:14px;color:${BRAND};padding-bottom:20px;">
      STOROVEX
    </td></tr>
    <tr><td style="font-size:22px;font-weight:600;color:${INK};padding-bottom:12px;line-height:1.3;">
      ${input.title}
    </td></tr>
    <tr><td style="font-size:15px;color:${MUTED};line-height:1.6;padding-bottom:8px;">
      ${input.intro}
    </td></tr>
    <tr><td style="font-size:15px;color:${INK};line-height:1.6;">${input.bodyHtml}</td></tr>
    ${cta}
    <tr><td style="padding-top:28px;border-top:1px solid ${BORDER};margin-top:24px;
                   font-size:12px;color:${MUTED};line-height:1.5;">
      ${input.footerNote ?? "You're receiving this because you have a Storovex account."}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    "STOROVEX",
    "",
    input.title,
    "",
    input.intro,
    "",
    input.bodyText,
    input.ctaUrl ? `\n${input.ctaLabel}: ${input.ctaUrl}` : "",
    "",
    "—",
    input.footerNote ?? "You're receiving this because you have a Storovex account.",
  ].filter(Boolean).join("\n");

  return {html, text};
}
