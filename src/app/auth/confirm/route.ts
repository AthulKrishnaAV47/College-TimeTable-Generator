import { NextResponse } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { appOrigin } from "@/lib/server/http";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const token_hash = url.searchParams.get("token_hash");
  const base = appOrigin(req);
  if (token_hash && (type === "signup" || type === "recovery" || type === "email")) {
    try {
      const db = await supabase();
      const { error } = await db.auth.verifyOtp({ token_hash, type });
      if (!error) return NextResponse.redirect(`${base}/${type === "recovery" ? "?reset=1" : ""}`);
    } catch { /* safe error page, never log tokens */ }
  }
  return NextResponse.redirect(`${base}/?authError=1`);
}
