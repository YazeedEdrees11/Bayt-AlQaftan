-- =============================================================================
-- 0025 — Monitoring the system can actually do, and backup it can actually track
--
-- Two readiness areas were warnings, for different reasons.
--
-- MONITORING was a warning because errors went to `console.error` and nowhere
-- else. On a serverless host that is a log stream somebody has to think to open,
-- which in practice means errors are discovered when a customer complains. This
-- adds `system_events`: errors, warnings and notable operations recorded in the
-- database, queryable, with the request id that ties a user's complaint to the
-- line that failed. That is not an error-tracking service and does not pretend
-- to be one — there is still nothing paging anyone at 3am — but it is the
-- difference between "we cannot see errors" and "we can".
--
-- BACKUP was a warning because nothing here can observe Supabase's schedule.
-- That is still true and cannot be fixed from inside the application. What can
-- be fixed is the loop around it: an administrator records that they verified a
-- backup, the act is audited like any other, and the system raises a
-- notification when the record goes stale. The system still cannot promise a
-- backup exists — it can only stop the question being forgotten.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SYSTEM EVENTS (§48, §95, §97)
-- -----------------------------------------------------------------------------

create table if not exists public.system_events (
  id           uuid        primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  severity     text        not null,
  category     text        not null,
  operation    text        not null,
  code         text        null,
  message      text        not null,
  request_id   text        null,
  user_id      uuid        null references public.profiles (id) on delete set null,
  metadata     jsonb       null
);

alter table public.system_events drop constraint if exists system_events_severity_check;
alter table public.system_events add constraint system_events_severity_check
  check (severity in ('DEBUG', 'INFO', 'WARN', 'ERROR'));

alter table public.system_events drop constraint if exists system_events_category_check;
alter table public.system_events add constraint system_events_category_check
  check (category in ('APPLICATION', 'DATABASE', 'AUTH', 'STORAGE', 'JOB', 'BACKUP'));

create index if not exists system_events_occurred_at_idx
  on public.system_events (occurred_at desc);
create index if not exists system_events_severity_idx on public.system_events (severity);
create index if not exists system_events_category_idx on public.system_events (category);
create index if not exists system_events_request_id_idx on public.system_events (request_id);

comment on table public.system_events is
  'Operational log: errors and notable events, with the request id that traces them. Never holds payloads or secrets.';

alter table public.system_events enable row level security;

drop policy if exists "system events readable" on public.system_events;
create policy "system events readable"
  on public.system_events for select to authenticated
  using (public.is_admin());

-- No insert policy: events are written through the function below, which is the
-- only thing that decides what may be recorded.

/**
 * Records an operational event.
 *
 * `p_message` is expected to be already safe — the application classifies and
 * truncates before calling. Nothing here inspects a payload, because the
 * cheapest way to keep secrets out of a log is never to hand them to it (§48).
 */
create or replace function public.record_system_event(
  p_severity   text,
  p_category   text,
  p_operation  text,
  p_message    text,
  p_code       text default null,
  p_request_id text default null,
  p_metadata   jsonb default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  -- DEBUG is dropped in normal running (§96); turning it on is a deliberate,
  -- temporary act rather than a default that fills the table with noise.
  if p_severity = 'DEBUG' and not public.setting_bool('verbose_logging', false) then
    return;
  end if;

  insert into public.system_events
    (severity, category, operation, message, code, request_id, user_id, metadata)
  values (
    p_severity, p_category, p_operation,
    left(coalesce(p_message, ''), 1000),
    p_code, p_request_id, (select auth.uid()), p_metadata
  );
end;
$fn$;

revoke all on function public.record_system_event(text, text, text, text, text, text, jsonb) from public;
grant execute on function public.record_system_event(text, text, text, text, text, text, jsonb)
  to authenticated, service_role;

/** What an administrator sees on the system screen: recent trouble, summarised. */
create or replace function public.system_event_summary(p_hours integer default 24)
returns table (
  severity    text,
  category    text,
  event_count integer,
  latest_at   timestamptz
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not public.is_admin() then
    raise exception 'forbidden: system events are administrator-only'
      using errcode = '42501';
  end if;
  return query
    select e.severity, e.category, count(*)::integer, max(e.occurred_at)
      from public.system_events e
     where e.occurred_at >= now() - (greatest(p_hours, 1) || ' hours')::interval
     group by e.severity, e.category
     order by
       case e.severity when 'ERROR' then 1 when 'WARN' then 2
                       when 'INFO' then 3 else 4 end,
       count(*) desc;
end;
$fn$;

grant execute on function public.system_event_summary(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. BACKUP VERIFICATION (§67)
-- -----------------------------------------------------------------------------

alter table public.app_config
  add column if not exists last_restore_test_at timestamptz null;
alter table public.app_config
  add column if not exists last_backup_note text null;

/**
 * Records that a person checked a backup, or tested a restore.
 *
 * The system cannot see Supabase's backup schedule and this does not pretend
 * otherwise — it records a human's confirmation, audits it like any other
 * change, and gives the staleness alert something to measure. An entry here
 * means "somebody looked on this date", which is worth exactly as much as the
 * looking was.
 */
create or replace function public.record_backup_verified(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_note    text := nullif(btrim(p_payload ->> 'note'), '');
  v_restore boolean := coalesce((p_payload ->> 'restore_tested')::boolean, false);
begin
  if not public.is_admin() then
    raise exception 'forbidden: only an administrator may record a backup check'
      using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'backup_note_required' using errcode = '22023';
  end if;

  update public.app_config
     set last_backup_at        = now(),
         backup_status         = case when v_restore then 'verified + restore tested'
                                      else 'verified' end,
         last_backup_note      = v_note,
         last_restore_test_at  = case when v_restore then now() else last_restore_test_at end,
         updated_at            = now()
   where id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'BACKUP_VERIFIED', 'app_config', null,
          jsonb_build_object('note', v_note, 'restore_tested', v_restore));

  perform public.record_system_event(
    'INFO', 'BACKUP', 'record_backup_verified',
    case when v_restore then 'Backup verified and restore tested'
         else 'Backup verified' end,
    null, null, jsonb_build_object('restore_tested', v_restore));

  return (select to_jsonb(a) from public.app_config a where a.id);
end;
$fn$;

revoke all on function public.record_backup_verified(jsonb) from public;
grant execute on function public.record_backup_verified(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. SETTINGS
-- -----------------------------------------------------------------------------

insert into public.system_settings
  (key, value, category, value_type, min_value, max_value, allowed_values, is_public, description)
values
  ('backup_max_age_hours', '48'::jsonb, 'system', 'number', 1, 720, null::jsonb, true,
   'عمر النسخة الاحتياطية الذي يُرفع بعده تنبيه'),
  ('notify_stale_backup', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true,
   'تنبيه عند تقادم النسخة الاحتياطية'),
  ('verbose_logging', 'false'::jsonb, 'system', 'boolean', null, null, null::jsonb, true,
   'تسجيل تفصيلي (DEBUG) — مؤقت فقط')
on conflict (key) do update
   set category = excluded.category, value_type = excluded.value_type,
       min_value = excluded.min_value, max_value = excluded.max_value,
       description = excluded.description;

-- -----------------------------------------------------------------------------
-- 4. THE STALE-BACKUP ALERT (§67)
-- -----------------------------------------------------------------------------

-- Folded into the existing generator rather than given a schedule of its own,
-- so there is one place that decides what deserves a notification.
create or replace function public.generate_notifications()
returns integer
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_alert   record;
  v_shape   record;
  v_created integer := 0;
  v_diff    numeric;
  v_closing record;
  v_backup  timestamptz;
  v_maxage  numeric;
begin
  if (select auth.uid()) is not null and not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to generate notifications'
      using errcode = '42501';
  end if;

  for v_alert in select * from public.compute_management_alerts() loop
    select * into v_shape from public.notification_shape(v_alert.alert_key);
    continue when not v_shape.enabled;

    insert into public.notifications
      (notification_key, type, title, message, severity, metric, threshold)
    values (
      v_alert.alert_key, v_shape.ntype, v_shape.title, v_alert.detail,
      v_alert.severity, v_alert.metric, v_alert.threshold
    )
    on conflict do nothing;

    if found then v_created := v_created + 1; end if;
  end loop;

  if public.setting_bool('notify_cash_difference', true) then
    v_diff := public.setting_number('cash_difference_threshold', 5);
    for v_closing in
      select c.id, c.closing_number, c.closing_date, c.difference
        from public.cash_closings c
       where c.closing_date >= current_date - 7
         and abs(c.difference) > v_diff
       order by c.closing_date desc
       limit 20
    loop
      insert into public.notifications
        (notification_key, type, title, message, severity,
         reference_type, reference_id, metric, threshold)
      values (
        'CASH_DIFFERENCE_' || v_closing.closing_number, 'FINANCE',
        'فرق في جرد الصندوق',
        'إغلاق ' || v_closing.closing_number || ' بتاريخ ' || v_closing.closing_date
          || ' يحمل فرقاً قدره ' || round(v_closing.difference, 2),
        case when abs(v_closing.difference) > v_diff * 10 then 'CRITICAL' else 'WARNING' end,
        'cash_closing', v_closing.id, v_closing.difference, v_diff
      )
      on conflict do nothing;
      if found then v_created := v_created + 1; end if;
    end loop;
  end if;

  -- §67. A backup nobody has confirmed for two days is the same risk as no
  -- backup, because nobody knows which it is.
  if public.setting_bool('notify_stale_backup', true) then
    select last_backup_at into v_backup from public.app_config where id;
    v_maxage := public.setting_number('backup_max_age_hours', 48);

    if v_backup is null
       or v_backup < now() - (v_maxage || ' hours')::interval then
      insert into public.notifications
        (notification_key, type, title, message, severity, metric, threshold)
      values (
        'STALE_BACKUP', 'SYSTEM', 'النسخة الاحتياطية متقادمة',
        case when v_backup is null
             then 'لم يُسجَّل أي تحقق من نسخة احتياطية. سجّل التحقق من شاشة النظام بعد مراجعة النسخ في Supabase.'
             else 'آخر تحقق من نسخة احتياطية كان قبل '
                  || round(extract(epoch from (now() - v_backup)) / 3600)::text || ' ساعة.' end,
        'CRITICAL',
        case when v_backup is null then null
             else round(extract(epoch from (now() - v_backup)) / 3600) end,
        v_maxage
      )
      on conflict do nothing;
      if found then v_created := v_created + 1; end if;
    end if;
  end if;

  return v_created;
end;
$fn$;

-- STALE_BACKUP is a system notification with no threshold switch of its own
-- beyond notify_stale_backup, so it needs a shape like the rest.
create or replace function public.notification_shape(p_key text)
returns table (enabled boolean, ntype text, title text)
language sql stable security definer set search_path = '' as $fn$
  select
    case p_key
      when 'LOW_STOCK'        then public.setting_bool('notify_low_stock', true)
      when 'OUT_OF_STOCK'     then public.setting_bool('notify_out_of_stock', true)
      when 'DEAD_STOCK'       then public.setting_bool('notify_low_stock', true)
      when 'CUSTOMER_DEBT'    then public.setting_bool('notify_customer_debt', true)
      when 'SUPPLIER_DEBT'    then public.setting_bool('notify_supplier_debt', true)
      when 'HIGH_RETURN_RATE' then public.setting_bool('notify_high_return_rate', true)
      when 'HIGH_EXPENSES'    then public.setting_bool('notify_high_expenses', true)
      when 'STALE_BACKUP'     then public.setting_bool('notify_stale_backup', true)
      else true
    end,
    case p_key
      when 'LOW_STOCK'        then 'INVENTORY'
      when 'OUT_OF_STOCK'     then 'INVENTORY'
      when 'DEAD_STOCK'       then 'INVENTORY'
      when 'CUSTOMER_DEBT'    then 'CUSTOMER'
      when 'SUPPLIER_DEBT'    then 'SUPPLIER'
      when 'HIGH_RETURN_RATE' then 'INVENTORY'
      when 'HIGH_EXPENSES'    then 'FINANCE'
      when 'STALE_BACKUP'     then 'SYSTEM'
      else 'SYSTEM'
    end,
    case p_key
      when 'LOW_STOCK'        then 'مخزون منخفض'
      when 'OUT_OF_STOCK'     then 'نفاد مخزون'
      when 'DEAD_STOCK'       then 'مخزون راكد'
      when 'CUSTOMER_DEBT'    then 'ذمم عملاء مرتفعة'
      when 'SUPPLIER_DEBT'    then 'ذمم موردين مرتفعة'
      when 'HIGH_RETURN_RATE' then 'ارتفاع معدل المرتجعات'
      when 'HIGH_EXPENSES'    then 'ارتفاع المصاريف'
      when 'STALE_BACKUP'     then 'النسخة الاحتياطية متقادمة'
      else p_key
    end;
$fn$;

revoke all on function public.notification_shape(text) from public;
