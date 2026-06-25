import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  sendDefaultPii: true,

  // 100% traces — reduce after launch if quota becomes a concern
  tracesSampleRate: 1.0,

  // Session Replay: record every session so all error reports come with a full replay
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration()],
});

// Hook into App Router navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
