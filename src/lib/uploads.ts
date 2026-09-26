export const MAX_FILE_BYTES = 3_000_000;
export function validateUpload(name: string, mime: string, bytes: Uint8Array): "pdf" | "text" {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error("Files must be nonempty and no larger than 3 MB.");
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "pdf" && mime === "application/pdf" && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "pdf";
  if (["txt", "csv"].includes(extension ?? "") && ["text/plain", "text/csv", "application/csv", ""].includes(mime)) {
    if (bytes.includes(0)) throw new Error("Text files must not contain binary data.");
    return "text";
  }
  throw new Error("Upload a valid PDF (.pdf, application/pdf), UTF-8 .txt or .csv file.");
}
