-- Apply with Supabase CLI to a NEW development project first.
-- auth.users (including password hashes) and auth.sessions are managed by Supabase Auth.
create or replace function public.has_live_session() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions s
    where s.id::text = (auth.jwt()->>'session_id') and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function public.has_live_session() from public;
grant execute on function public.has_live_session() to authenticated;

create or replace function public.is_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_live_session() and exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null);
$$;
revoke all on function public.is_verified() from public;
grant execute on function public.is_verified() to authenticated;

create table public.user_roles (user_id uuid primary key references auth.users on delete cascade, role text not null check(role = 'admin'));
alter table public.user_roles enable row level security;
-- No write policy: promotion is ONLY via SQL/dashboard/service-role, never user metadata.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_live_session() and exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.student_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  year text not null check(year in ('I', 'II & III')),
  term_label text not null check(length(term_label) <= 160),
  completed_course_codes text[] not null default '{}'
);
create table public.term_datasets (
  id uuid primary key default gen_random_uuid(), term_label text not null check(length(term_label) between 1 and 160),
  uploaded_by uuid references auth.users on delete set null,
  slot_sheet jsonb not null, eligibility jsonb not null,
  status text not null default 'pending' check(status in ('pending','published','archived')),
  created_at timestamptz not null default now()
);
create table public.workspaces (
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null, revision integer not null default 0, updated_at timestamptz not null default now()
);
create table public.timetable_drafts (
  id text not null, user_id uuid not null references auth.users on delete cascade,
  term_dataset_id uuid references public.term_datasets on delete set null,
  label text not null, snapshot jsonb not null,
  created_at timestamptz not null default now(), primary key (user_id, id)
);
create table public.course_aliases (
  alias text primary key check(length(alias) between 1 and 80 and alias = upper(alias)),
  course_code text not null check(length(course_code) between 1 and 80),
  updated_at timestamptz not null default now()
);
insert into public.course_aliases(alias, course_code) values ('EMPD','19AI303');
create table public.dataset_flags (
  dataset_id uuid references public.term_datasets on delete cascade,
  user_id uuid references auth.users on delete cascade,
  reason text not null check(length(reason) between 1 and 1000),
  created_at timestamptz not null default now(), primary key(dataset_id, user_id)
);
create table public.deletion_requests (
  user_id uuid primary key references auth.users on delete cascade, created_at timestamptz not null default now()
);

alter table public.student_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.timetable_drafts enable row level security;
alter table public.term_datasets enable row level security;
alter table public.course_aliases enable row level security;
alter table public.dataset_flags enable row level security;
alter table public.deletion_requests enable row level security;
create policy profile_owner on public.student_profiles for all to authenticated using (user_id = auth.uid() and public.has_live_session()) with check(user_id = auth.uid() and public.has_live_session());
create policy workspace_owner on public.workspaces for all to authenticated using (user_id = auth.uid() and public.has_live_session()) with check(user_id = auth.uid() and public.has_live_session());
create policy draft_owner on public.timetable_drafts for all to authenticated using (user_id = auth.uid() and public.has_live_session()) with check(user_id = auth.uid() and public.has_live_session());
create policy dataset_read on public.term_datasets for select to authenticated using(public.has_live_session() and (status = 'published' or uploaded_by = auth.uid() or public.is_admin()));
create policy dataset_submit on public.term_datasets for insert to authenticated with check(public.has_live_session() and uploaded_by = auth.uid() and status = 'pending' and public.is_verified());
create policy dataset_moderate on public.term_datasets for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy alias_read on public.course_aliases for select to authenticated using(public.has_live_session());
create policy alias_admin on public.course_aliases for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy flags_read on public.dataset_flags for select to authenticated using(public.has_live_session() and (user_id = auth.uid() or public.is_admin()));
create policy flags_insert on public.dataset_flags for insert to authenticated with check(public.has_live_session() and user_id = auth.uid() and exists(select 1 from public.term_datasets d where d.id = dataset_id and d.status = 'published'));
create policy flags_update on public.dataset_flags for update to authenticated using(public.has_live_session() and user_id = auth.uid()) with check(public.has_live_session() and user_id = auth.uid());
create policy deletion_owner on public.deletion_requests for all to authenticated using(public.has_live_session() and user_id = auth.uid()) with check(public.has_live_session() and user_id = auth.uid());
create policy deletion_admin_read on public.deletion_requests for select to authenticated using(public.is_admin());

-- Single atomic save, with optimistic concurrency (no quiet cross-tab overwrites).
create or replace function public.save_workspace(p_state jsonb, p_drafts jsonb, p_revision integer) returns integer
language plpgsql security invoker set search_path = '' as $$
declare next_revision integer; d jsonb;
begin
  if not public.has_live_session() then raise exception 'not authenticated'; end if;
  if octet_length(p_state::text) > 3000000 or octet_length(p_drafts::text) > 3000000 or jsonb_array_length(p_drafts) > 100 then raise exception 'workspace too large'; end if;
  insert into public.workspaces(user_id, state, revision) values(auth.uid(), '{}'::jsonb, 0) on conflict do nothing;
  update public.workspaces set state = p_state, revision = revision + 1, updated_at = now()
    where user_id = auth.uid() and revision = p_revision returning revision into next_revision;
  if next_revision is null then raise exception 'revision conflict' using errcode = '40001'; end if;
  insert into public.student_profiles(user_id, year, term_label, completed_course_codes)
    values(auth.uid(), p_state#>>'{profile,year}', p_state#>>'{profile,termLabel}',
      array(select jsonb_array_elements_text(p_state#>'{profile,completedCourseCodes}')))
    on conflict(user_id) do update set year = excluded.year, term_label = excluded.term_label, completed_course_codes = excluded.completed_course_codes;
  delete from public.timetable_drafts where user_id = auth.uid();
  for d in select * from jsonb_array_elements(p_drafts) loop
    insert into public.timetable_drafts(user_id, id, label, snapshot, term_dataset_id, created_at)
      values(auth.uid(), d->>'id', d->>'label', d, nullif(d->>'termDatasetId','')::uuid, (d->>'createdAt')::timestamptz);
  end loop;
  return next_revision;
end $$;
revoke all on function public.save_workspace(jsonb,jsonb,integer) from public;
grant execute on function public.save_workspace(jsonb,jsonb,integer) to authenticated;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object('students', (select count(*) from auth.users), 'drafts', (select count(*) from public.timetable_drafts),
    'datasets', (select count(*) from public.term_datasets), 'flags', (select count(*) from public.dataset_flags));
end $$;
revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

-- Atomic read: a revision and its drafts must come from the same MVCC snapshot.
create or replace function public.load_workspace() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'state', (select state from public.workspaces where user_id = auth.uid()),
    'revision', coalesce((select revision from public.workspaces where user_id = auth.uid()), 0),
    'drafts', coalesce((select jsonb_agg(snapshot order by created_at desc) from public.timetable_drafts where user_id = auth.uid()), '[]'::jsonb)
  );
$$;
revoke all on function public.load_workspace() from public;
grant execute on function public.load_workspace() to authenticated;

-- Explicit privileges, independent of project default privileges. RLS still
-- restricts every row; no service-role key is used in the application.
revoke all on public.user_roles, public.student_profiles, public.workspaces, public.timetable_drafts, public.term_datasets, public.course_aliases, public.dataset_flags, public.deletion_requests from anon;
grant select, insert, update, delete on public.student_profiles, public.workspaces, public.timetable_drafts, public.deletion_requests to authenticated;
grant select, insert, update on public.term_datasets, public.dataset_flags to authenticated;
grant select, insert, update, delete on public.course_aliases to authenticated;
