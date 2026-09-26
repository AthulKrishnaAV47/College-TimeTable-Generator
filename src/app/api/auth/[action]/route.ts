import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase, requireUser } from "@/lib/server/supabase";
import { ApiError, appOrigin, checkOrigin, errorResponse, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { emailSchema, passwordSchema, passwordHint } from "@/lib/authValidation";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { db, user } = await requireUser();
    const { data: admin } = await db.rpc("is_admin");
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.user_metadata?.name ?? "Student", verified: !!user.email_confirmed_at, admin: !!admin } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  try {
    checkOrigin(req);
    const { action } = await ctx.params;
    if (!["login", "signup", "forgot", "reset", "logout", "resend", "delete"].includes(action)) throw new ApiError(404, "Unknown operation.");
    if (action === "logout") {
      const db = await supabase();
      const { error } = await db.auth.signOut({ scope: "global" });
      if (error) throw new ApiError(503, "Could not sign out. Please retry.");
      return NextResponse.json({ ok: true });
    }
    await rateLimit(req, "auth");
    const body = await readJson(req, 4096);
    const db = await supabase();
    if (["reset", "resend", "delete"].includes(action)) {
      const { user } = await requireUser();
      if (action === "delete") {
        // An operator processes deletion requests; no service-role key is used by the app.
        const { error } = await db.from("deletion_requests").upsert({ user_id: user.id }, { onConflict: "user_id" });
        if (error) throw error;
        return NextResponse.json({ message: "Deletion requested. An administrator will delete your account and private data within 30 days." });
      }
      if (action === "resend") {
        const { error } = await db.auth.resend({ type: "signup", email: user.email!, options: { emailRedirectTo: appOrigin(req) } });
        if (error) throw new ApiError(400, "Could not send verification email. Try again later.");
      } else {
        const result = passwordSchema.safeParse(body.password);
        if (!result.success) throw new ApiError(400, passwordHint);
        const { error } = await db.auth.updateUser({ password: result.data });
        if (error) throw new ApiError(400, "Could not change password. Request a new reset link.");
        const { error: logoutError } = await db.auth.signOut({ scope: "global" });
        if (logoutError) throw new ApiError(503, "Password changed, but sessions could not be revoked. Please sign out again before leaving this device.");
      }
      return NextResponse.json({ message: action === "reset" ? "Password changed. Please sign in again." : "Verification email sent." });
    }
    const email = emailSchema.parse(body.email);
    await rateLimit(req, "auth-email", email, 10);
    if (action === "forgot") {
      await db.auth.resetPasswordForEmail(email, { redirectTo: appOrigin(req) });
      return NextResponse.json({ message: "If that account exists, a password-reset email will arrive shortly." });
    }
    if (action === "signup") {
      const parsed = passwordSchema.safeParse(body.password);
      if (!parsed.success) throw new ApiError(400, passwordHint);
      const name = z.string().trim().min(1).max(80).parse(body.name);
      const { error } = await db.auth.signUp({ email, password: parsed.data, options: { data: { name }, emailRedirectTo: appOrigin(req) } });
      // Uniform response prevents account enumeration; Supabase enforces uniqueness.
      if (error && error.status && error.status >= 500) throw new ApiError(503, "Email service unavailable. Try again later.");
      return NextResponse.json({ message: "Check your email to verify your account. If you already have an account, sign in or reset your password." });
    }
    const password = z.string().min(1).max(128).parse(body.password);
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(401, "Sign-in failed. Check your credentials and verify your email.");
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
