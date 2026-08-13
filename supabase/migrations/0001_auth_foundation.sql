-- =============================================================================
-- بيت القفطان (Bayt Al-Qaftan) — Authentication & Authorization foundation
-- Migration 0001
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It is idempotent: running it again is safe.
--
-- Creates:
--   * public.profiles      — application profile for every auth.users row
--   * public.audit_logs    — append-only audit trail shared by all modules
--   * helper functions     — is_admin(), current_user_role(), ...
--   * triggers             — updated_at, auto-profile, privilege guard
--   * Row Level Security   — profiles + audit_logs policies
--   * storage buckets      — product-images, payment-receipts, avatars
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  full_name   text        not null,
  email       text        not null,
  role        text        not null default 'STAFF',
  avatar_url  text        null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for each authenticated user (role, activation state).';

-- Role is constrained to the three roles the application knows about.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('ADMIN', 'MANAGER', 'STAFF'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_full_name_check'
  ) then
    alter table public.profiles
      add constraint profiles_full_name_check
      check (char_length(btrim(full_name)) between 2 and 120);
  end if;
end;
$$;

create unique index if not exists profiles_email_key
  on public.profiles (lower(email));

create index if not exists profiles_role_idx      on public.profiles (role);
create index if not exists profiles_is_active_idx on public.profiles (is_active);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        null references auth.users (id) on delete set null,
  action      text        not null,
  entity_type text        not null,
  entity_id   uuid        null,
  metadata    jsonb       null,
  created_at  timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only trail of security- and business-relevant actions.';

create index if not exists audit_logs_user_id_idx    on public.audit_logs (user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx     on public.audit_logs (action);
create index if not exists audit_logs_entity_idx     on public.audit_logs (entity_type, entity_id);

-- =============================================================================
-- 2. HELPER FUNCTIONS
--
-- All are SECURITY DEFINER with an empty search_path so that RLS policies can
-- read public.profiles without recursing into their own policies, and so that
-- a hostile search_path cannot hijack them.
-- =============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'ADMIN', false);
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
  );
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_admin()          from public;
revoke all on function public.is_active_user()    from public;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_admin()          to authenticated, service_role;
grant execute on function public.is_active_user()    to authenticated, service_role;

-- =============================================================================
-- 3. TRIGGERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3.2 Create a profile automatically for every new auth user
--
-- Role and full name are read from the sign-up metadata that the server-side
-- admin API sends; anything unrecognised falls back to a plain STAFF account.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role      text;
  v_full_name text;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'STAFF');
  if v_role not in ('ADMIN', 'MANAGER', 'STAFF') then
    v_role := 'STAFF';
  end if;

  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- profiles_full_name_check requires at least two characters; a one-letter
  -- local part (a@example.com) would otherwise abort the sign-up.
  if char_length(btrim(coalesce(v_full_name, ''))) < 2 then
    v_full_name := 'مستخدم جديد';
  end if;

  insert into public.profiles (id, full_name, email, role, avatar_url, is_active)
  values (
    new.id,
    v_full_name,
    new.email,
    v_role,
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3.3 Keep profiles.email in sync with auth.users.email
-- ---------------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    -- Marks this statement as a trusted sync so the guard in 3.4 lets the new
    -- address through. Transaction-local, so it cannot leak to other requests.
    perform set_config('app.email_sync', 'on', true);

    update public.profiles
       set email = new.email
     where id = new.id;

    perform set_config('app.email_sync', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- 3.4 Privilege-escalation guard
--
-- RLS WITH CHECK clauses cannot compare OLD and NEW, so column-level rules are
-- enforced here: an ordinary signed-in user may only ever change their own
-- full_name and avatar_url. role / is_active / email / id are immutable to
-- them, whatever the client sends.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt_role text := coalesce((select auth.role()), 'service_role');
begin
  -- Immutable for everyone.
  new.id         := old.id;
  new.created_at := old.created_at;

  -- Trusted server-side paths (service_role key, direct SQL, migrations)
  -- perform their own authorization before reaching this point.
  if v_jwt_role is distinct from 'authenticated' then
    return new;
  end if;

  -- Signed-in users can never rewrite their own login identity. The only
  -- exception is the auth.users email-sync trigger (3.3), which flags itself.
  if coalesce(current_setting('app.email_sync', true), 'off') <> 'on' then
    new.email := old.email;
  end if;

  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     and not public.is_admin() then
    raise exception
      'Only administrators may change a role or activation state'
      using errcode = '42501';
  end if;

  -- Nobody may lock the system out by demoting or disabling themselves.
  if new.id = (select auth.uid())
     and (new.role is distinct from old.role
          or new.is_active is distinct from old.is_active) then
    raise exception
      'You cannot change your own role or activation state'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_update_rules on public.profiles;
create trigger profiles_enforce_update_rules
  before update on public.profiles
  for each row
  execute function public.enforce_profile_update_rules();

-- =============================================================================
-- 4. ROW LEVEL SECURITY
--
-- NOTE: RLS is enabled but deliberately *not* FORCEd. The SECURITY DEFINER
-- helpers above are owned by `postgres`; forcing RLS on the owner would make
-- `is_admin()` re-enter the very policies that call it and recurse.
-- =============================================================================

alter table public.profiles   enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- 4.1 profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own    on public.profiles;
drop policy if exists profiles_select_admin  on public.profiles;
drop policy if exists profiles_update_own    on public.profiles;
drop policy if exists profiles_update_admin  on public.profiles;
drop policy if exists profiles_insert_admin  on public.profiles;

-- Everyone reads their own profile.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- Administrators read every profile (user management screen).
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- Users update their own row. The trigger in 3.4 restricts *which* columns
-- actually change, so this cannot be used to self-promote.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()));

-- Administrators update any profile (role changes, activation).
create policy profiles_update_admin
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Administrators may insert a profile row directly (repair path). Normal
-- creation happens through the auth trigger in 3.2.
create policy profiles_insert_admin
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

-- No DELETE policy: profiles disappear only when the auth user is deleted
-- (ON DELETE CASCADE). Deactivate accounts instead of deleting them.

-- ---------------------------------------------------------------------------
-- 4.2 audit_logs
-- ---------------------------------------------------------------------------
drop policy if exists audit_logs_select_admin on public.audit_logs;
drop policy if exists audit_logs_insert_self  on public.audit_logs;

create policy audit_logs_select_admin
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin());

-- A signed-in user may only record actions under their own identity.
create policy audit_logs_insert_self
  on public.audit_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- No UPDATE or DELETE policy, and no UPDATE/DELETE grant below: the audit
-- trail is append-only for every client-facing role.

-- =============================================================================
-- 5. GRANTS
-- =============================================================================

revoke all on public.profiles   from authenticated, anon;
revoke all on public.audit_logs from authenticated, anon;

grant select, insert, update on public.profiles   to authenticated;
grant select, insert         on public.audit_logs to authenticated;

-- =============================================================================
-- 6. STORAGE FOUNDATION
--
-- Buckets are created now so future phases (product images, payment receipts)
-- have a stable home. The upload flows themselves are not implemented yet.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts', 'payment-receipts', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Storage policies. If your project restricts DDL on storage.objects, create
-- the equivalents from the Supabase dashboard (Storage -> Policies).
do $$
begin
  -- product-images: readable by anyone, written by active staff and up.
  drop policy if exists product_images_read   on storage.objects;
  drop policy if exists product_images_write  on storage.objects;
  drop policy if exists payment_receipts_read on storage.objects;
  drop policy if exists payment_receipts_write on storage.objects;
  drop policy if exists avatars_read          on storage.objects;
  drop policy if exists avatars_write         on storage.objects;

  create policy product_images_read
    on storage.objects for select
    using (bucket_id = 'product-images');

  create policy product_images_write
    on storage.objects for all
    to authenticated
    using (bucket_id = 'product-images' and public.current_user_role() in ('ADMIN', 'MANAGER'))
    with check (bucket_id = 'product-images' and public.current_user_role() in ('ADMIN', 'MANAGER'));

  -- payment-receipts: private, finance-grade material.
  create policy payment_receipts_read
    on storage.objects for select
    to authenticated
    using (bucket_id = 'payment-receipts' and public.current_user_role() in ('ADMIN', 'MANAGER'));

  create policy payment_receipts_write
    on storage.objects for all
    to authenticated
    using (bucket_id = 'payment-receipts' and public.current_user_role() in ('ADMIN', 'MANAGER'))
    with check (bucket_id = 'payment-receipts' and public.current_user_role() in ('ADMIN', 'MANAGER'));

  -- avatars: publicly readable, each user owns a folder named after their id.
  create policy avatars_read
    on storage.objects for select
    using (bucket_id = 'avatars');

  create policy avatars_write
    on storage.objects for all
    to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
exception
  when insufficient_privilege then
    raise notice 'Skipped storage.objects policies: insufficient privilege. Create them from the Supabase dashboard.';
end;
$$;

-- =============================================================================
-- 7. BACKFILL
--
-- Creates a profile for any auth user that predates this migration.
-- =============================================================================

insert into public.profiles (id, full_name, email, role, is_active)
select
  u.id,
  coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
  u.email,
  'STAFF',
  true
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- =============================================================================
-- 8. FIRST ADMINISTRATOR
--
-- After creating your first user in Supabase (Authentication -> Users -> Add
-- user), promote them by running the statement below with their email:
--
--   update public.profiles
--      set role = 'ADMIN', is_active = true
--    where lower(email) = lower('you@example.com');
--
-- =============================================================================
