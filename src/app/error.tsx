"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <main className="mx-auto max-w-xl space-y-4 p-10"><h1 className="text-2xl font-bold">We couldn’t display this page</h1><p>Your saved account data is unchanged. Try again, or reload the page.</p><button className="rounded-lg bg-indigo-600 p-3 text-white" onClick={reset}>Try again</button></main>;
}
