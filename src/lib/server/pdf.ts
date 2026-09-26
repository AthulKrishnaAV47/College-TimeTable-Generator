import "server-only";
import { fork } from "node:child_process";
import path from "node:path";
import { itemsToText, type PdfTextItem } from "@/lib/pdfLayout";
import { ApiError } from "./http";
export function extractPdf(bytes: Uint8Array, kind: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(process.cwd(), "src/lib/server/pdf-worker.mjs"), [], {
      execArgv: ["--max-old-space-size=256"], stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV },
    });
    let settled = false;
    const finish = (error?: Error, text = "") => {
      if (settled) return; settled = true; clearTimeout(timer); child.kill("SIGKILL");
      if (error) reject(error); else resolve(text);
    };
    const timer = setTimeout(() => finish(new ApiError(422, "PDF parsing timed out. Try a smaller PDF or paste the exported text.")), 20_000);
    child.on("message", (message: { error?: boolean; text?: string; items?: PdfTextItem[][] }) => {
      try {
        if (message.error) throw new Error("parse failed");
        const text = message.text ?? (message.items ?? []).map(itemsToText).join("\n\n");
        if (text.length > 1_000_000) throw new Error("too much text");
        finish(undefined, text);
      } catch { finish(new ApiError(422, "Couldn’t parse this PDF. Try exporting it again or paste the text.")); }
    });
    child.on("error", () => finish(new ApiError(422, "PDF parser unavailable. Try pasting the text.")));
    child.on("exit", () => finish(new ApiError(422, "Couldn’t parse this PDF within the resource limits.")));
    child.send({ base64: Buffer.from(bytes).toString("base64"), kind });
  });
}
