import { NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid input. Check the fields and try again." }, { status: 400 });
  // Do not send request bodies, academic history, auth credentials or DB errors to clients/logs.
  Sentry.captureException(new Error("Server operation failed"));
  return NextResponse.json({ error: "The request failed. Please try again." }, { status: 500 });
}
export function appOrigin(req: Request) {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  if (process.env.NODE_ENV === "production") throw new ApiError(503, "APP_URL must be configured.");
  return new URL(req.url).origin;
}
export function checkOrigin(req: Request) {
  if (req.headers.get("origin") !== appOrigin(req)) throw new ApiError(403, "Request origin not allowed.");
}
export async function readBody(req: Request, maxBytes = 1_000_000): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new ApiError(413, "Upload is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Missing request body.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, "Upload is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function readJson(req: Request, maxBytes?: number) {
  try { return JSON.parse(new TextDecoder().decode(await readBody(req, maxBytes))); }
  catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, "Invalid JSON."); }
}
