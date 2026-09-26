"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <html lang="en"><body><h1>The scheduler encountered an error</h1><p>Saved account data is unchanged. Please try again.</p><button onClick={reset}>Try again</button></body></html>;
}
