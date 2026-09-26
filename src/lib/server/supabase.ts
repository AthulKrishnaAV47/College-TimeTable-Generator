import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ApiError } from "./http";

export async function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError(503, "Accounts are not configured yet. See the deployment guide.");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => values.forEach(({ name, value, options }) => jar.set(name, value, { ...options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" })),
    },
  });
}

export async function requireUser() {
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new ApiError(401, "Please sign in again.");
  // getUser alone can accept an unexpired access JWT after sign-out. Check the
  // provider's session row too, so revoked sessions cannot use our APIs/RLS.
  const { data: live, error: sessionError } = await db.rpc("has_live_session");
  if (sessionError) throw new ApiError(503, "Account database setup is incomplete.");
  if (!live) throw new ApiError(401, "Your session has expired. Please sign in again.");
  return { db, user };
}
