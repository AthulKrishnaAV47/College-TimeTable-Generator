import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DEFAULT_STATE } from "../appState";
// Run the actual migration/RLS on PostgreSQL (WASM), with only the Supabase
// managed auth schema/functions stubbed. No external credentials required.
const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111", bob = "22222222-2222-4222-8222-222222222222";
const sa = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sb = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function login(uid: string, session: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, session_id: session, email: `${uid}@example.test` })]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  await db.exec(`create schema auth; create role authenticated; create role anon;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz default now()); create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into auth.users(id) values('${alice}'),('${bob}'); insert into auth.sessions values('${sa}','${alice}',null),('${sb}','${bob}',null);`);
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  // Supabase's default authenticated table privileges (RLS restricts rows).
  await db.exec("grant usage on schema public to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated");
}, 30_000);
afterAll(async () => { await db.close(); });
describe("Postgres tenant isolation and revocation", () => {
  it("atomically saves profile/workspace and detects stale revisions", async () => {
    await login(alice, sa);
    const result = await db.query<{ save_workspace: number }>("select public.save_workspace($1::jsonb, '[]'::jsonb, 0)", [JSON.stringify(DEFAULT_STATE)]);
    expect(result.rows[0].save_workspace).toBe(1);
    const loaded = await db.query<{ load_workspace: { revision: number } }>("select public.load_workspace()");
    expect(loaded.rows[0].load_workspace.revision).toBe(1);
    await expect(db.query("select public.save_workspace($1::jsonb, '[]'::jsonb, 0)", [JSON.stringify(DEFAULT_STATE)])).rejects.toThrow("revision conflict");
    expect((await db.query("select * from public.student_profiles")).rows).toHaveLength(1);
  });
  it("a different user cannot read or overwrite Alice's workspace/profile/drafts", async () => {
    await login(alice, sa);
    await db.exec(`insert into public.timetable_drafts(id,user_id,label,snapshot) values('draft','${alice}','Private','{}')`);
    await login(bob, sb);
    for (const table of ["workspaces", "student_profiles", "timetable_drafts"]) expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
    await expect(db.exec(`insert into public.student_profiles(user_id,year,term_label) values('${alice}','I','Attack')`)).rejects.toThrow();
    expect((await db.query(`update public.workspaces set state = '{}' where user_id = '${alice}' returning *`)).rows).toHaveLength(0);
  });
  it("students cannot elevate roles or publish datasets; published rows are shared", async () => {
    await login(alice, sa);
    await expect(db.exec(`insert into public.user_roles values('${alice}','admin')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.term_datasets(term_label,uploaded_by,slot_sheet,eligibility,status) values('Fake','${alice}','{}','{}','published')`)).rejects.toThrow();
    await db.exec(`insert into public.term_datasets(term_label,uploaded_by,slot_sheet,eligibility) values('Pending','${alice}','{}','{}')`);
    await login(bob, sb);
    expect((await db.query("select * from public.term_datasets")).rows).toHaveLength(0);
    await db.exec("reset role; update public.term_datasets set status = 'published'; set role authenticated");
    expect((await db.query("select * from public.term_datasets")).rows).toHaveLength(1);
    await expect(db.exec("select public.admin_stats()")).rejects.toThrow("forbidden");
  });
  it("stamps dataset edits in the database instead of trusting client-supplied times", async () => {
    await db.exec("reset role");
    const before = await db.query<{ updated_at: string }>("select updated_at::text from public.term_datasets limit 1");
    expect(before.rows[0].updated_at).toBeTruthy();
    const after = await db.query<{ updated_at: string }>("update public.term_datasets set updated_at = '1999-01-01' returning updated_at::text");
    expect(after.rows[0].updated_at.startsWith("1999")).toBe(false);
  });
  it("rejects revoked sessions even if their JWT has not expired", async () => {
    await db.exec(`reset role; delete from auth.sessions where id = '${sa}'`);
    await login(alice, sa);
    expect((await db.query<{ has_live_session: boolean }>("select public.has_live_session()")).rows[0].has_live_session).toBe(false);
    expect((await db.query("select * from public.workspaces")).rows).toHaveLength(0);
    await expect(db.query("select public.save_workspace($1::jsonb, '[]'::jsonb, 1)", [JSON.stringify(DEFAULT_STATE)])).rejects.toThrow("not authenticated");
  });
});
