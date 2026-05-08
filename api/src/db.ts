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
  /** Event email template IDs, optional until Postmark templates are created */
  POSTMARK_TEMPLATE_EVENT_INVITE?: string;
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
  /** Postmark template ID for registered-user attendance confirmation request */
  POSTMARK_TEMPLATE_CONFIRMATION_REQUEST_USER?: string;
  /** Postmark template ID for plan-at-risk host notification */
  POSTMARK_TEMPLATE_PLAN_AT_RISK?: string;
  /** Postmark template ID for auto-cancelled plan attendee notification, set after creating the Postmark template */
  POSTMARK_TEMPLATE_PLAN_AUTO_CANCELLED?: string;
  /** Postmark template ID for admin plan removal notification (template 43998481) */
  POSTMARK_TEMPLATE_PLAN_REMOVED?: string;
  /** Postmark template ID for roadmap/feedback update notifications */
  POSTMARK_TEMPLATE_ROADMAP_UPDATE?: string;
  /** Postmark template ID for daily event-match digest email (template 44018889) */
  POSTMARK_TEMPLATE_EVENT_MATCH_DIGEST?: string;
  /**
   * Postmark template ID for the lightweight-signup magic link email sent when
   * an unauthenticated visitor starts signing up from the plan page.
   * Email tokens are hashed rows in `email_verification_tokens` (15-minute TTL).
   */
  POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP?: string;
  /**
   * Postmark template ID for the "someone tried to sign up with this email"
   * notice sent when the submitted email already belongs to a verified account.
   * Contains a link to `/login?next=<plan url>` so the returning user lands back
   * on the plan after sign-in.
   */
  POSTMARK_TEMPLATE_PLAN_SIGNIN?: string;
  /**
   * Postmark template ID for the dedicated return-visit sign-in link email.
   * Sent by `POST /auth/signin-link/request` to lightweight-signup accounts
   * still in `password_setup_pending = TRUE`. The link lands on
   * `/auth/magic` like other magic-link flows; on consume the user is
   * routed to `/settings#account` so they can finish setting a password.
   * Distinct from POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP, whose copy frames
   * the email as a fresh signup confirmation.
   */
  POSTMARK_TEMPLATE_SIGNIN_LINK?: string;
  /** Postmark template ID for post-plan feedback reminder (template 44091936) */
  POSTMARK_TEMPLATE_PLAN_FEEDBACK?: string;
  /** Postmark template ID for concern report admin alert (template 44107767) */
  POSTMARK_TEMPLATE_CONCERN_REPORT?: string;
  /** Postmark template ID for community join request notification to owner (template 44111064) */
  POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST?: string;
  /** Postmark template ID for community join approved notification (template 44111212) */
  POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED?: string;
  /** Postmark template ID for community join declined notification (template 44111205) */
  POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED?: string;
  /** Postmark template ID for community member removed notification (template 44452043) */
  POSTMARK_TEMPLATE_COMMUNITY_MEMBER_REMOVED?: string;
  /** Postmark template ID for community member unblocked notification (template 44470363) */
  POSTMARK_TEMPLATE_COMMUNITY_MEMBER_UNBLOCKED?: string;
  /** Postmark template ID for community join-request reopened notification (template 44470744) */
  POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST_REOPENED?: string;
  /** Postmark template ID for community announcement notification (template 44937878) */
  POSTMARK_TEMPLATE_COMMUNITY_ANNOUNCEMENT?: string;
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
