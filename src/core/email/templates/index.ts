import {renderLayout, type RenderedEmail} from "./layout";
import type {EmailEventType} from "../emailCatalog";

/**
 * One renderer per catalogue event.
 *
 * emailCatalog.ts declared thirteen event types and the variables each requires, but
 * there was no rendering layer at all — and the Resend payload carried no html, text
 * or react field, so every send would have been rejected with a 422.
 */
type Vars = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");

/** Escapes interpolated values: names and project titles are user-supplied. */
function esc(v: unknown) {
  return s(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const RENDERERS: Record<EmailEventType, (v: Vars) => RenderedEmail> = {
  welcome: v => ({
    subject: "Welcome to Storovex",
    ...renderLayout({
      title: `Welcome, ${esc(v.userName)}`,
      intro: "Your account is ready. Upload one reference photo and Storovex generates a full set of product images from it.",
      bodyHtml: "<p>Start with a single product. You'll get hero shots, lifestyle scenes and campaign creative sized for your store, ads and social.</p>",
      bodyText: "Start with a single product. You'll get hero shots, lifestyle scenes and campaign creative sized for your store, ads and social.",
      ctaLabel: "Open your dashboard",
      ctaUrl: s(v.dashboardUrl),
    }),
  }),

  email_verification: v => ({
    subject: "Confirm your email address",
    ...renderLayout({
      title: "Confirm your email",
      intro: "Click below to finish setting up your Storovex account.",
      bodyHtml: "<p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>",
      bodyText: "This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
      ctaLabel: "Confirm email",
      ctaUrl: s(v.verificationUrl),
      footerNote: "If you didn't request this, no action is needed.",
    }),
  }),

  password_reset: v => ({
    subject: "Reset your Storovex password",
    ...renderLayout({
      title: "Reset your password",
      intro: "Use the link below to choose a new password.",
      bodyHtml: "<p>This link expires in one hour and can be used once. If you didn't ask to reset your password, your account is still secure and you can ignore this.</p>",
      bodyText: "This link expires in one hour and can be used once. If you didn't ask to reset your password, your account is still secure and you can ignore this.",
      ctaLabel: "Choose a new password",
      ctaUrl: s(v.resetUrl),
      footerNote: "If you didn't request this, no action is needed.",
    }),
  }),

  subscription_activated: v => ({
    subject: `Your ${s(v.planName)} plan is active`,
    ...renderLayout({
      title: `${esc(v.planName)} is active`,
      intro: "Your subscription is live and this period's credits have been added.",
      bodyHtml: `<p>Credits refresh each billing period. You can see your balance and usage on the billing page.</p>`,
      bodyText: "Credits refresh each billing period. You can see your balance and usage on the billing page.",
      ctaLabel: "View billing",
      ctaUrl: s(v.billingUrl),
    }),
  }),

  subscription_canceled: v => ({
    subject: "Your Storovex subscription is ending",
    ...renderLayout({
      title: "Subscription cancelled",
      intro: `Your ${esc(v.planName)} plan will stay active until ${esc(v.accessUntil)}.`,
      bodyHtml: "<p>Your generated assets remain available after that date. You can resubscribe at any time and pick up where you left off.</p>",
      bodyText: "Your generated assets remain available after that date. You can resubscribe at any time and pick up where you left off.",
      ctaLabel: "Manage subscription",
      ctaUrl: s(v.billingUrl),
    }),
  }),

  payment_failed: v => ({
    subject: "Payment failed — action needed",
    ...renderLayout({
      title: "We couldn't take your payment",
      intro: `Your ${esc(v.planName)} payment didn't go through.`,
      bodyHtml: "<p>Your account stays active for a short grace period. Updating your payment method now avoids any interruption.</p>",
      bodyText: "Your account stays active for a short grace period. Updating your payment method now avoids any interruption.",
      ctaLabel: "Update payment method",
      ctaUrl: s(v.retryUrl),
    }),
  }),

  grace_period_started: v => ({
    subject: "Your Storovex account needs attention",
    ...renderLayout({
      title: "Grace period started",
      intro: `Your ${esc(v.planName)} plan is past due. Access continues until ${esc(v.graceEndsAt)}.`,
      bodyHtml: "<p>Update your payment details before then to keep generating without interruption.</p>",
      bodyText: "Update your payment details before then to keep generating without interruption.",
      ctaLabel: "Update payment method",
      ctaUrl: s(v.billingUrl),
    }),
  }),

  low_credit_warning: v => ({
    subject: "You're running low on credits",
    ...renderLayout({
      title: "Credits running low",
      intro: `You have ${esc(v.creditsRemaining)} credits left this period.`,
      bodyHtml: "<p>Generations stop once your balance reaches zero. You can top up or move to a larger plan at any time.</p>",
      bodyText: "Generations stop once your balance reaches zero. You can top up or move to a larger plan at any time.",
      ctaLabel: "Top up credits",
      ctaUrl: s(v.topUpUrl),
    }),
  }),

  credits_exhausted: v => ({
    subject: "You're out of credits",
    ...renderLayout({
      title: "Out of credits",
      intro: "You've used all the credits in this billing period.",
      bodyHtml: "<p>Top up or upgrade to keep generating. Your existing assets are unaffected.</p>",
      bodyText: "Top up or upgrade to keep generating. Your existing assets are unaffected.",
      ctaLabel: "Top up credits",
      ctaUrl: s(v.topUpUrl),
    }),
  }),

  generation_completed: v => ({
    subject: `Your images for ${s(v.projectName)} are ready`,
    ...renderLayout({
      title: "Your images are ready",
      intro: `${esc(v.assetCount)} new image${Number(v.assetCount) === 1 ? "" : "s"} for ${esc(v.projectName)}.`,
      bodyHtml: "<p>They're sized and ready for your product pages, ads and social posts.</p>",
      bodyText: "They're sized and ready for your product pages, ads and social posts.",
      ctaLabel: "View your images",
      ctaUrl: s(v.projectUrl),
    }),
  }),

  generation_failed: v => ({
    subject: `Generation didn't finish for ${s(v.projectName)}`,
    ...renderLayout({
      title: "That generation didn't finish",
      intro: `We couldn't complete the images for ${esc(v.projectName)}.`,
      // The credit outcome is the first thing a user wants to know here.
      bodyHtml: `<p><strong>Your credits have been refunded in full.</strong></p><p>Reason: ${esc(v.reason)}</p><p>You can try again whenever you're ready.</p>`,
      bodyText: `Your credits have been refunded in full.\nReason: ${s(v.reason)}\nYou can try again whenever you're ready.`,
      ctaLabel: "Try again",
      ctaUrl: s(v.projectUrl),
    }),
  }),

  team_invitation: v => ({
    subject: `${s(v.inviterName)} invited you to ${s(v.storeName)} on Storovex`,
    ...renderLayout({
      title: `Join ${esc(v.storeName)}`,
      intro: `${esc(v.inviterName)} has invited you to collaborate on Storovex.`,
      bodyHtml: "<p>This invitation expires in seven days.</p>",
      bodyText: "This invitation expires in seven days.",
      ctaLabel: "Accept invitation",
      ctaUrl: s(v.acceptUrl),
      footerNote: "If you weren't expecting this invitation, you can ignore it.",
    }),
  }),

  team_invitation_accepted: v => ({
    subject: `${s(v.memberEmail)} joined ${s(v.storeName)}`,
    ...renderLayout({
      title: "New team member",
      intro: `${esc(v.memberEmail)} has accepted their invitation to ${esc(v.storeName)}.`,
      bodyHtml: "<p>You can manage roles and access from your team settings.</p>",
      bodyText: "You can manage roles and access from your team settings.",
      ctaLabel: "Manage team",
      ctaUrl: s(v.teamUrl),
    }),
  }),
};

export function renderEmail(type: EmailEventType, vars: Vars): RenderedEmail {
  const renderer = RENDERERS[type];
  if (!renderer) throw new Error("EMAIL_EVENT_TYPE_INVALID");
  return renderer(vars);
}

export function hasTemplate(type: string): type is EmailEventType {
  return type in RENDERERS;
}
