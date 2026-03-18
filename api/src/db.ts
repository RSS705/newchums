import { neon } from "@neondatabase/serverless";

export type Bindings = {
  DATABASE_URL: string;
  NEXTAUTH_SECRET?: string; // Required for auth routes (profile, user/username, user/date-of-birth)
  MEDIA_BUCKET?: R2Bucket; // R2 bucket for media (avatars, etc.)
  CHAT_ROOM: DurableObjectNamespace;
  /** Optional KV for contact form rate limiting (5 per 10 min per IP). If unset, rate limit is skipped. */
  CONTACT_RATELIMIT_KV?: KVNamespace;
  /** Cloudflare Turnstile secret key for contact form (logged-out users). If unset, Turnstile is skipped. */
  TURNSTILE_SECRET_KEY?: string;
  POSTMARK_SERVER_TOKEN: string;
  EMAIL_FROM: string;
  WEB_BASE_URL: string;
  POSTMARK_TEMPLATE_VERIFY: string;
  POSTMARK_TEMPLATE_RESET: string;
  POSTMARK_TEMPLATE_RSVP: string;
  POSTMARK_TEMPLATE_EMAIL_CHANGE_CONFIRM: string;
  POSTMARK_TEMPLATE_EMAIL_CHANGE_NOTIFY_OLD: string;
  POSTMARK_TEMPLATE_EMAIL_CHANGE_SUCCESS: string;
  /** Postmark template ID for Chum invite emails (template 43805532) */
  POSTMARK_TEMPLATE_INVITE?: string;
  /** Event email template IDs — optional until Postmark templates are created */
  POSTMARK_TEMPLATE_EVENT_INVITE?: string;
  POSTMARK_TEMPLATE_EVENT_UPDATED?: string;
  POSTMARK_TEMPLATE_EVENT_CANCELED?: string;
  POSTMARK_TEMPLATE_EVENT_REMINDER?: string;
  POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE?: string;
  /** Postmark template ID for host leave notification (template 43921920) */
  POSTMARK_TEMPLATE_EVENT_LEAVE?: string;
  /** Postmark template ID for host maybe notification (template 43922237) */
  POSTMARK_TEMPLATE_EVENT_MAYBE?: string;
  /** Postmark template ID for host join/going notification (template 43922675) */
  POSTMARK_TEMPLATE_EVENT_JOIN?: string;
  /** Postmark template ID for attendee removed notification (template 43923102) */
  POSTMARK_TEMPLATE_ATTENDEE_REMOVED?: string;
  /** Postmark template ID for plan-changed/locked/cancelled attendee notification (template 43971187) */
  POSTMARK_TEMPLATE_EVENT_CHANGED?: string;
  /** Postmark template ID for daily unread-chat digest email (template 43975299) */
  POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST?: string;
  /** Postmark template ID for attendance confirmation request emails */
  POSTMARK_TEMPLATE_CONFIRMATION_REQUEST?: string;
  /** Postmark template ID for plan-at-risk host notification */
  POSTMARK_TEMPLATE_PLAN_AT_RISK?: string;
  /** Postmark template ID for admin plan removal notification (template 43998481) */
  POSTMARK_TEMPLATE_PLAN_REMOVED?: string;
  SENTRY_DSN: string;
  APP_ENV?: string;
  ENVIRONMENT?: string;
  INTERNAL_TEST_TOKEN?: string;
  AXIOM_TOKEN?: string;
  AXIOM_DATASET?: string;
};

export const DATABASE_URL_HINT = "Run: npx wrangler secret put DATABASE_URL";

export const getSql = (env: Bindings) => {
  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is not set. ${DATABASE_URL_HINT}`);
  }
  return neon(env.DATABASE_URL);
};
