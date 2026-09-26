import * as Sentry from "@sentry/nextjs";
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV, sendDefaultPii: false, tracesSampleRate: 0,
      beforeSend(event) {
        // Explicit allowlist: never transmit request headers, bodies, URL tokens,
        // auth breadcrumbs, profile data, locals or runtime context.
        return { type: undefined, event_id: event.event_id, timestamp: event.timestamp, level: event.level, platform: event.platform,
          environment: event.environment, release: event.release, message: "Scheduler server error",
          exception: event.exception ? { values: event.exception.values?.map(v => ({ type: v.type, value: "Server operation failed", stacktrace: { frames: v.stacktrace?.frames?.map(f => ({ filename: f.filename?.split("?")[0], function: f.function, lineno: f.lineno, colno: f.colno })) } })) } : undefined };
      },
    });
  }
}
export const onRequestError = Sentry.captureRequestError;
