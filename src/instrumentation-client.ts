import * as Sentry from "@sentry/nextjs";
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false, tracesSampleRate: 0, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
  beforeSend(event) {
    return { type: undefined, event_id: event.event_id, timestamp: event.timestamp, level: event.level,
      platform: event.platform, environment: event.environment, release: event.release, message: "Scheduler browser error",
      exception: event.exception ? { values: event.exception.values?.map(v => ({ type: v.type, value: "Browser operation failed", stacktrace: { frames: v.stacktrace?.frames?.map(f => ({ filename: f.filename?.split("?")[0], function: f.function, lineno: f.lineno, colno: f.colno })) } })) } : undefined };
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
