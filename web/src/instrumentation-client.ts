// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://0faa4247e1a18af83b0683f70cd8e290@o4510868883046400.ingest.us.sentry.io/4510868891369472",

  // Disabled for the public pilot. See sentry.server.config.ts for the
  // rationale and for the guidance on attaching safe user context
  // manually when an incident actually needs it.
  sendDefaultPii: false,

  // Suppress noise from the Facebook/Meta Android in-app browser. When a
  // user opens a NewChums link from the FB/IG app, Meta injects its own
  // JS bridge ("navigation_performance_logger_android",
  // enableDidUserTypeOnKeyboardLogging, FBNav* metrics). If the WebView
  // tears down the underlying Java object mid-call, the bridge throws
  // "Java object is gone" into the page, which Sentry then captures as
  // if it were an app error. denyUrls catches events whose top frame is
  // the injected script; the message regexes are a fallback because
  // Sentry's URL filter is unreliable for the non-http `app://` scheme.
  // "Java object is gone" is an Android WebView JNI signature that
  // cannot originate from our code. All patterns are kept narrow so
  // genuine app errors are still reported.
  ignoreErrors: [
    /enableDidUserTypeOnKeyboardLogging/,
    /Java object is gone/,
  ],
  denyUrls: [/^app:\/\/navigation_performance_logger_android/],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
