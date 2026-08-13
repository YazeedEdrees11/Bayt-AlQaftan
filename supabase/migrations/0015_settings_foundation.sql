-- =============================================================================
-- 0015 — Settings, store profile and role permissions (Phase 8)
--
-- Three things move out of the source code and into the database:
--
--   * the store's own identity — name, contact, currency, timezone;
--   * every configurable business rule, as typed rows carrying their own
--     validation, so `update_setting` can check a value without a giant CASE
--     and the UI can render the right control from the metadata;
--   * the role → permission matrix, which until now lived in a TypeScript
--     constant and was therefore only enforceable in the application.
--
-- The matrix is seeded to reproduce today's behaviour exactly — 70 permissions
-- across three roles, generated from `lib/permissions/permissions.ts` rather
-- than retyped — so running this migration changes no one's access. What it
-- changes is where the answer comes from: `can_sell()` and its siblings now ask
-- the table instead of comparing role names, which is what makes the permission
-- screen real rather than decorative (§15, §80).
--
-- ADMIN is deliberately not editable. §16 requires that an administrator always
-- exists and cannot lock themselves out, and the cheapest way to guarantee that
-- is to refuse the write rather than to check the consequences afterwards.
-- =============================================================================

-- =============================================================================
-- 1. STORE PROFILE
-- =============================================================================

create table if not exists public.store_settings (
  id              boolean     primary key default true,
  store_name      text        not null default 'بيت القفطان',
  store_name_ar   text        null,
  store_name_en   text        null,
  logo_path       text        null,
  phone           text        null,
  secondary_phone text        null,
  email           text        null,
  address         text        null,
  city            text        null,
  country         text        not null default 'Jordan',
  currency        text        not null default 'JOD',
  currency_symbol text        not null default 'د.أ',
  timezone        text        not null default 'Asia/Amman',
  date_format     text        not null default 'DD/MM/YYYY',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One store, one row. Same shape as report_settings from Phase 7.
  constraint store_settings_singleton check (id)
);

alter table public.store_settings drop constraint if exists store_settings_name_check;
alter table public.store_settings add constraint store_settings_name_check
  check (length(btrim(store_name)) between 1 and 120);

alter table public.store_settings drop constraint if exists store_settings_currency_check;
alter table public.store_settings add constraint store_settings_currency_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.store_settings drop constraint if exists store_settings_email_check;
alter table public.store_settings add constraint store_settings_email_check
  check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$');

alter table public.store_settings drop constraint if exists store_settings_date_format_check;
alter table public.store_settings add constraint store_settings_date_format_check
  check (date_format in ('DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'));

comment on table public.store_settings is
  'The shop''s own identity. One row; read by receipts, printed reports and the header.';

insert into public.store_settings (id, store_name, store_name_ar, country, currency, currency_symbol, timezone)
values (true, 'بيت القفطان', 'بيت القفطان', 'Jordan', 'JOD', 'د.أ', 'Asia/Amman')
on conflict (id) do nothing;

-- =============================================================================
-- 2. SYSTEM SETTINGS
-- =============================================================================

create table if not exists public.system_settings (
  id             uuid        primary key default gen_random_uuid(),
  key            text        not null unique,
  value          jsonb       not null,
  value_type     text        not null,
  category       text        not null,
  -- Validation travels with the setting rather than living in a function, so a
  -- new setting cannot be added without saying what a valid value looks like.
  min_value      numeric     null,
  max_value      numeric     null,
  allowed_values jsonb       null,
  description    text        null,
  is_public      boolean     not null default false,
  updated_by     uuid        null references public.profiles (id) on delete set null,
  updated_at     timestamptz not null default now()
);

alter table public.system_settings drop constraint if exists system_settings_type_check;
alter table public.system_settings add constraint system_settings_type_check
  check (value_type in ('boolean', 'number', 'text', 'enum', 'uuid', 'prefix'));

alter table public.system_settings drop constraint if exists system_settings_category_check;
alter table public.system_settings add constraint system_settings_category_check
  check (category in (
    'business', 'inventory', 'sales', 'purchases', 'returns', 'exchanges',
    'finance', 'reports', 'notifications', 'receipts', 'numbering', 'system'
  ));

create index if not exists system_settings_key_idx      on public.system_settings (key);
create index if not exists system_settings_category_idx on public.system_settings (category);

comment on table public.system_settings is
  'Configurable business rules. Every row carries its own validation so update_setting can check a value generically.';

-- =============================================================================
-- 3. ROLE PERMISSIONS
-- =============================================================================

create table if not exists public.role_permissions (
  role       text        not null,
  permission text        not null,
  allowed    boolean     not null default false,
  updated_by uuid        null references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (role, permission)
);

alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('ADMIN', 'MANAGER', 'STAFF'));

create index if not exists role_permissions_role_idx on public.role_permissions (role);

comment on table public.role_permissions is
  'The role → permission matrix. Seeded from the application''s constants; ADMIN rows are not editable (§16).';

-- =============================================================================
-- 4. APPLICATION CONFIG
-- =============================================================================

create table if not exists public.app_config (
  id             boolean     primary key default true,
  app_version    text        not null default '1.0.0',
  schema_version text        not null default '0015',
  environment    text        not null default 'production',
  last_backup_at timestamptz null,
  backup_status  text        null,
  updated_at     timestamptz not null default now(),

  constraint app_config_singleton check (id)
);

comment on table public.app_config is
  'Deployment facts shown on the system screen. Written by deployment, not by the UI (§68).';

insert into public.app_config (id) values (true) on conflict (id) do nothing;
update public.app_config set schema_version = '0015', updated_at = now() where id;

-- =============================================================================
-- 5. STORE ASSETS BUCKET
-- =============================================================================

-- Public for reads because the logo is printed on receipts and reports; writes
-- are administrator-only through the policies below. SVG is deliberately absent
-- from the MIME list: it can carry script, and this bucket is world-readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets', 'store-assets', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
   set file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "store assets are readable" on storage.objects;
create policy "store assets are readable"
  on storage.objects for select
  using (bucket_id = 'store-assets');

drop policy if exists "admins upload store assets" on storage.objects;
create policy "admins upload store assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets' and public.is_admin());

drop policy if exists "admins replace store assets" on storage.objects;
create policy "admins replace store assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'store-assets' and public.is_admin());

drop policy if exists "admins remove store assets" on storage.objects;
create policy "admins remove store assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'store-assets' and public.is_admin());

-- =============================================================================
-- 6. SEEDS
-- =============================================================================

-- Settings. ON CONFLICT DO NOTHING so re-running never overwrites a value the
-- owner has since changed (§58) — but the metadata is refreshed, because
-- validation rules are the migration's business, not the owner's.
insert into public.system_settings
  (key, value, category, value_type, min_value, max_value, allowed_values, is_public, description)
values
  ('default_payment_method', '"CASH"'::jsonb, 'business', 'enum', null, null, '["CASH","BANK_TRANSFER"]'::jsonb, true, 'طريقة الدفع المقترحة في الشاشات الجديدة'),
  ('default_cash_account_id', 'null'::jsonb, 'business', 'uuid', null, null, null::jsonb, true, 'حساب النقد الافتراضي'),
  ('default_bank_account_id', 'null'::jsonb, 'business', 'uuid', null, null, null::jsonb, true, 'الحساب البنكي الافتراضي'),
  ('default_expense_category_id', 'null'::jsonb, 'business', 'uuid', null, null, null::jsonb, true, 'تصنيف المصاريف الافتراضي'),
  ('default_minimum_stock', '0'::jsonb, 'inventory', 'number', 0, 100000, null::jsonb, true, 'الحد الأدنى الافتراضي للمخزون عند إنشاء موديل'),
  ('allow_negative_stock', 'false'::jsonb, 'inventory', 'boolean', null, null, null::jsonb, true, 'السماح بالمخزون السالب'),
  ('track_damaged_stock', 'true'::jsonb, 'inventory', 'boolean', null, null, null::jsonb, true, 'تتبع المخزون التالف'),
  ('require_adjustment_reason', 'true'::jsonb, 'inventory', 'boolean', null, null, null::jsonb, true, 'إلزام سبب تعديل المخزون'),
  ('require_adjustment_notes', 'false'::jsonb, 'inventory', 'boolean', null, null, null::jsonb, true, 'إلزام ملاحظات تعديل المخزون'),
  ('require_adjustment_approval', 'false'::jsonb, 'inventory', 'boolean', null, null, null::jsonb, true, 'إلزام موافقة مدير على تعديل المخزون'),
  ('default_discount_percent', '0'::jsonb, 'sales', 'number', 0, 100, null::jsonb, true, 'نسبة الخصم المقترحة'),
  ('allow_manual_discount', 'true'::jsonb, 'sales', 'boolean', null, null, null::jsonb, true, 'السماح بالخصم اليدوي'),
  ('maximum_discount_percent', '30'::jsonb, 'sales', 'number', 0, 100, null::jsonb, true, 'الحد الأقصى لنسبة الخصم'),
  ('require_customer_for_credit', 'true'::jsonb, 'sales', 'boolean', null, null, null::jsonb, true, 'إلزام تحديد عميل للبيع الآجل'),
  ('allow_walk_in_sales', 'true'::jsonb, 'sales', 'boolean', null, null, null::jsonb, true, 'السماح بالبيع لعميل عابر'),
  ('allow_editing_completed_sale', 'false'::jsonb, 'sales', 'boolean', null, null, null::jsonb, true, 'السماح بتعديل فاتورة مكتملة'),
  ('allow_sale_cancellation', 'true'::jsonb, 'sales', 'boolean', null, null, null::jsonb, true, 'السماح بإلغاء الفواتير'),
  ('require_cancellation_reason', 'true'::jsonb, 'sales', 'boolean', null, null, null::jsonb, true, 'إلزام سبب الإلغاء'),
  ('allow_purchase_editing', 'false'::jsonb, 'purchases', 'boolean', null, null, null::jsonb, true, 'السماح بتعديل فاتورة شراء'),
  ('require_supplier', 'true'::jsonb, 'purchases', 'boolean', null, null, null::jsonb, true, 'إلزام تحديد مورد'),
  ('allow_partial_receiving', 'true'::jsonb, 'purchases', 'boolean', null, null, null::jsonb, true, 'السماح بالاستلام الجزئي'),
  ('require_purchase_cancellation_reason', 'true'::jsonb, 'purchases', 'boolean', null, null, null::jsonb, true, 'إلزام سبب إلغاء الشراء'),
  ('default_purchase_payment_method', '"CASH"'::jsonb, 'purchases', 'enum', null, null, '["CASH","BANK_TRANSFER"]'::jsonb, true, 'طريقة الدفع الافتراضية للمشتريات'),
  ('allow_returns', 'true'::jsonb, 'returns', 'boolean', null, null, null::jsonb, true, 'السماح بالمرتجعات'),
  ('require_return_reason', 'true'::jsonb, 'returns', 'boolean', null, null, null::jsonb, true, 'إلزام سبب المرتجع'),
  ('require_return_condition', 'true'::jsonb, 'returns', 'boolean', null, null, null::jsonb, true, 'إلزام تحديد حالة القطعة المرتجعة'),
  ('maximum_return_days', '30'::jsonb, 'returns', 'number', 0, 3650, null::jsonb, true, 'أقصى مدة للمرتجع بالأيام'),
  ('allow_damaged_returns', 'true'::jsonb, 'returns', 'boolean', null, null, null::jsonb, true, 'قبول المرتجعات التالفة'),
  ('allow_cash_refund', 'true'::jsonb, 'returns', 'boolean', null, null, null::jsonb, true, 'السماح بالاسترداد النقدي'),
  ('allow_bank_refund', 'true'::jsonb, 'returns', 'boolean', null, null, null::jsonb, true, 'السماح بالاسترداد البنكي'),
  ('allow_customer_credit_refund', 'true'::jsonb, 'returns', 'boolean', null, null, null::jsonb, true, 'السماح بقيد رصيد للعميل'),
  ('allow_exchanges', 'true'::jsonb, 'exchanges', 'boolean', null, null, null::jsonb, true, 'السماح بالاستبدال'),
  ('require_exchange_reason', 'true'::jsonb, 'exchanges', 'boolean', null, null, null::jsonb, true, 'إلزام سبب الاستبدال'),
  ('allow_customer_pays_difference', 'true'::jsonb, 'exchanges', 'boolean', null, null, null::jsonb, true, 'السماح بتحصيل فرق من العميل'),
  ('allow_customer_receives_difference', 'true'::jsonb, 'exchanges', 'boolean', null, null, null::jsonb, true, 'السماح بإعادة فرق للعميل'),
  ('maximum_exchange_days', '30'::jsonb, 'exchanges', 'number', 0, 3650, null::jsonb, true, 'أقصى مدة للاستبدال بالأيام'),
  ('allow_negative_account_balance', 'false'::jsonb, 'finance', 'boolean', null, null, null::jsonb, true, 'السماح برصيد سالب في الحسابات'),
  ('require_expense_category', 'true'::jsonb, 'finance', 'boolean', null, null, null::jsonb, true, 'إلزام تصنيف المصروف'),
  ('require_expense_receipt', 'false'::jsonb, 'finance', 'boolean', null, null, null::jsonb, true, 'إلزام إرفاق إيصال المصروف'),
  ('require_transfer_notes', 'false'::jsonb, 'finance', 'boolean', null, null, null::jsonb, true, 'إلزام ملاحظات التحويل'),
  ('require_financial_adjustment_reason', 'true'::jsonb, 'finance', 'boolean', null, null, null::jsonb, true, 'إلزام سبب التسوية المالية'),
  ('allow_financial_adjustments', 'false'::jsonb, 'finance', 'boolean', null, null, null::jsonb, true, 'السماح بالتسويات المالية اليدوية'),
  ('default_report_range', '"month"'::jsonb, 'reports', 'enum', null, null, '["today","week","month","lastMonth","year"]'::jsonb, true, 'الفترة الافتراضية للتقارير'),
  ('default_rows_per_page', '20'::jsonb, 'reports', 'number', 5, 200, null::jsonb, true, 'عدد الصفوف الافتراضي في الجداول'),
  ('default_export_format', '"csv"'::jsonb, 'reports', 'enum', null, null, '["csv","xlsx"]'::jsonb, true, 'صيغة التصدير الافتراضية'),
  ('show_profit_on_dashboard', 'true'::jsonb, 'reports', 'boolean', null, null, null::jsonb, true, 'عرض الأرباح في لوحة الإدارة'),
  ('show_customer_debt', 'true'::jsonb, 'reports', 'boolean', null, null, null::jsonb, true, 'عرض ذمم العملاء في لوحة الإدارة'),
  ('show_supplier_debt', 'true'::jsonb, 'reports', 'boolean', null, null, null::jsonb, true, 'عرض ذمم الموردين في لوحة الإدارة'),
  ('notify_low_stock', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true, 'تنبيه المخزون المنخفض'),
  ('notify_out_of_stock', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true, 'تنبيه نفاد المخزون'),
  ('notify_customer_debt', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true, 'تنبيه ذمم العملاء المرتفعة'),
  ('notify_supplier_debt', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true, 'تنبيه ذمم الموردين المرتفعة'),
  ('notify_high_expenses', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true, 'تنبيه ارتفاع المصاريف'),
  ('notify_high_return_rate', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true, 'تنبيه ارتفاع معدل المرتجعات'),
  ('notify_cash_difference', 'true'::jsonb, 'notifications', 'boolean', null, null, null::jsonb, true, 'تنبيه فروقات جرد الصندوق'),
  ('cash_difference_threshold', '5'::jsonb, 'notifications', 'number', 0, 1000000, null::jsonb, true, 'الفرق المقبول في جرد الصندوق قبل التنبيه'),
  ('receipt_show_logo', 'true'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار الشعار على الإيصال'),
  ('receipt_show_phone', 'true'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار هاتف المحل'),
  ('receipt_show_address', 'true'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار عنوان المحل'),
  ('receipt_show_customer_name', 'true'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار اسم العميل'),
  ('receipt_show_customer_phone', 'false'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار هاتف العميل'),
  ('receipt_show_payment_method', 'true'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار طريقة الدفع'),
  ('receipt_show_salesperson', 'true'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار اسم البائع'),
  ('receipt_show_return_policy', 'true'::jsonb, 'receipts', 'boolean', null, null, null::jsonb, true, 'إظهار سياسة الاسترجاع'),
  ('receipt_footer_ar', '"شكراً لتعاملكم مع بيت القفطان"'::jsonb, 'receipts', 'text', null, null, null::jsonb, true, 'نص تذييل الإيصال'),
  ('return_policy_ar', '"يمكن استرجاع أو استبدال القطعة خلال ٣٠ يوماً من تاريخ الشراء مع إحضار الفاتورة، بشرط أن تكون القطعة بحالتها الأصلية."'::jsonb, 'receipts', 'text', null, null, null::jsonb, true, 'سياسة الاسترجاع بالعربية'),
  ('return_policy_en', '""'::jsonb, 'receipts', 'text', null, null, null::jsonb, true, 'سياسة الاسترجاع بالإنجليزية'),
  ('prefix_sale', '"SAL-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام فواتير المبيعات'),
  ('prefix_purchase', '"PUR-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام فواتير المشتريات'),
  ('prefix_return', '"RET-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام المرتجعات'),
  ('prefix_exchange', '"EXC-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام الاستبدالات'),
  ('prefix_expense', '"EXP-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام المصاريف'),
  ('prefix_account', '"ACC-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام الحسابات المالية'),
  ('prefix_financial', '"FIN-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام الحركات المالية'),
  ('prefix_transfer', '"TRF-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام التحويلات'),
  ('prefix_closing', '"CLS-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام إغلاق الصندوق'),
  ('prefix_adjustment', '"ADJ-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام تعديلات المخزون'),
  ('prefix_customer', '"CUS-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام العملاء'),
  ('prefix_financial_adjustment', '"FAD-"'::jsonb, 'numbering', 'prefix', null, null, null::jsonb, true, 'بادئة أرقام التسويات المالية'),
  ('maintenance_mode', 'false'::jsonb, 'system', 'boolean', null, null, null::jsonb, true, 'وضع الصيانة'),
  ('locale', '"ar"'::jsonb, 'system', 'enum', null, null, '["ar"]'::jsonb, true, 'لغة الواجهة')
on conflict (key) do update
   set category       = excluded.category,
       value_type     = excluded.value_type,
       min_value      = excluded.min_value,
       max_value      = excluded.max_value,
       allowed_values = excluded.allowed_values,
       is_public      = excluded.is_public,
       description    = excluded.description;

-- The permission matrix, generated from lib/permissions/permissions.ts so that
-- migrating changes nobody's access. Existing rows are left alone: after the
-- first run this table, not the constant, is the authority.
insert into public.role_permissions (role, permission, allowed)
values
  ('ADMIN', 'VIEW_DASHBOARD', true),
  ('MANAGER', 'VIEW_DASHBOARD', true),
  ('STAFF', 'VIEW_DASHBOARD', true),
  ('ADMIN', 'VIEW_PRODUCTS', true),
  ('MANAGER', 'VIEW_PRODUCTS', true),
  ('STAFF', 'VIEW_PRODUCTS', true),
  ('ADMIN', 'CREATE_PRODUCTS', true),
  ('MANAGER', 'CREATE_PRODUCTS', true),
  ('STAFF', 'CREATE_PRODUCTS', false),
  ('ADMIN', 'UPDATE_PRODUCTS', true),
  ('MANAGER', 'UPDATE_PRODUCTS', true),
  ('STAFF', 'UPDATE_PRODUCTS', false),
  ('ADMIN', 'DELETE_PRODUCTS', true),
  ('MANAGER', 'DELETE_PRODUCTS', true),
  ('STAFF', 'DELETE_PRODUCTS', false),
  ('ADMIN', 'VIEW_INVENTORY', true),
  ('MANAGER', 'VIEW_INVENTORY', true),
  ('STAFF', 'VIEW_INVENTORY', true),
  ('ADMIN', 'MANAGE_INVENTORY', true),
  ('MANAGER', 'MANAGE_INVENTORY', true),
  ('STAFF', 'MANAGE_INVENTORY', false),
  ('ADMIN', 'VIEW_SUPPLIERS', true),
  ('MANAGER', 'VIEW_SUPPLIERS', true),
  ('STAFF', 'VIEW_SUPPLIERS', false),
  ('ADMIN', 'CREATE_SUPPLIERS', true),
  ('MANAGER', 'CREATE_SUPPLIERS', true),
  ('STAFF', 'CREATE_SUPPLIERS', false),
  ('ADMIN', 'UPDATE_SUPPLIERS', true),
  ('MANAGER', 'UPDATE_SUPPLIERS', true),
  ('STAFF', 'UPDATE_SUPPLIERS', false),
  ('ADMIN', 'DELETE_SUPPLIERS', true),
  ('MANAGER', 'DELETE_SUPPLIERS', false),
  ('STAFF', 'DELETE_SUPPLIERS', false),
  ('ADMIN', 'MANAGE_SUPPLIERS', true),
  ('MANAGER', 'MANAGE_SUPPLIERS', true),
  ('STAFF', 'MANAGE_SUPPLIERS', false),
  ('ADMIN', 'VIEW_PURCHASES', true),
  ('MANAGER', 'VIEW_PURCHASES', true),
  ('STAFF', 'VIEW_PURCHASES', false),
  ('ADMIN', 'CREATE_PURCHASES', true),
  ('MANAGER', 'CREATE_PURCHASES', true),
  ('STAFF', 'CREATE_PURCHASES', false),
  ('ADMIN', 'UPDATE_PURCHASES', true),
  ('MANAGER', 'UPDATE_PURCHASES', true),
  ('STAFF', 'UPDATE_PURCHASES', false),
  ('ADMIN', 'CANCEL_PURCHASES', true),
  ('MANAGER', 'CANCEL_PURCHASES', true),
  ('STAFF', 'CANCEL_PURCHASES', false),
  ('ADMIN', 'VIEW_SUPPLIER_BALANCES', true),
  ('MANAGER', 'VIEW_SUPPLIER_BALANCES', true),
  ('STAFF', 'VIEW_SUPPLIER_BALANCES', false),
  ('ADMIN', 'CREATE_SUPPLIER_PAYMENTS', true),
  ('MANAGER', 'CREATE_SUPPLIER_PAYMENTS', true),
  ('STAFF', 'CREATE_SUPPLIER_PAYMENTS', false),
  ('ADMIN', 'VIEW_SALES', true),
  ('MANAGER', 'VIEW_SALES', true),
  ('STAFF', 'VIEW_SALES', true),
  ('ADMIN', 'CREATE_SALES', true),
  ('MANAGER', 'CREATE_SALES', true),
  ('STAFF', 'CREATE_SALES', true),
  ('ADMIN', 'UPDATE_SALES', true),
  ('MANAGER', 'UPDATE_SALES', true),
  ('STAFF', 'UPDATE_SALES', false),
  ('ADMIN', 'CANCEL_SALES', true),
  ('MANAGER', 'CANCEL_SALES', true),
  ('STAFF', 'CANCEL_SALES', false),
  ('ADMIN', 'VIEW_CUSTOMERS', true),
  ('MANAGER', 'VIEW_CUSTOMERS', true),
  ('STAFF', 'VIEW_CUSTOMERS', true),
  ('ADMIN', 'CREATE_CUSTOMERS', true),
  ('MANAGER', 'CREATE_CUSTOMERS', true),
  ('STAFF', 'CREATE_CUSTOMERS', true),
  ('ADMIN', 'UPDATE_CUSTOMERS', true),
  ('MANAGER', 'UPDATE_CUSTOMERS', true),
  ('STAFF', 'UPDATE_CUSTOMERS', false),
  ('ADMIN', 'DELETE_CUSTOMERS', true),
  ('MANAGER', 'DELETE_CUSTOMERS', false),
  ('STAFF', 'DELETE_CUSTOMERS', false),
  ('ADMIN', 'MANAGE_CUSTOMERS', true),
  ('MANAGER', 'MANAGE_CUSTOMERS', true),
  ('STAFF', 'MANAGE_CUSTOMERS', false),
  ('ADMIN', 'VIEW_CUSTOMER_BALANCES', true),
  ('MANAGER', 'VIEW_CUSTOMER_BALANCES', true),
  ('STAFF', 'VIEW_CUSTOMER_BALANCES', false),
  ('ADMIN', 'CREATE_CUSTOMER_PAYMENTS', true),
  ('MANAGER', 'CREATE_CUSTOMER_PAYMENTS', true),
  ('STAFF', 'CREATE_CUSTOMER_PAYMENTS', false),
  ('ADMIN', 'VIEW_PROFIT', true),
  ('MANAGER', 'VIEW_PROFIT', true),
  ('STAFF', 'VIEW_PROFIT', false),
  ('ADMIN', 'VIEW_RETURNS', true),
  ('MANAGER', 'VIEW_RETURNS', true),
  ('STAFF', 'VIEW_RETURNS', true),
  ('ADMIN', 'CREATE_RETURNS', true),
  ('MANAGER', 'CREATE_RETURNS', true),
  ('STAFF', 'CREATE_RETURNS', true),
  ('ADMIN', 'CANCEL_RETURNS', true),
  ('MANAGER', 'CANCEL_RETURNS', true),
  ('STAFF', 'CANCEL_RETURNS', false),
  ('ADMIN', 'CREATE_REFUNDS', true),
  ('MANAGER', 'CREATE_REFUNDS', true),
  ('STAFF', 'CREATE_REFUNDS', false),
  ('ADMIN', 'VIEW_RETURN_VALUES', true),
  ('MANAGER', 'VIEW_RETURN_VALUES', true),
  ('STAFF', 'VIEW_RETURN_VALUES', true),
  ('ADMIN', 'VIEW_EXCHANGES', true),
  ('MANAGER', 'VIEW_EXCHANGES', true),
  ('STAFF', 'VIEW_EXCHANGES', true),
  ('ADMIN', 'CREATE_EXCHANGES', true),
  ('MANAGER', 'CREATE_EXCHANGES', true),
  ('STAFF', 'CREATE_EXCHANGES', true),
  ('ADMIN', 'CANCEL_EXCHANGES', true),
  ('MANAGER', 'CANCEL_EXCHANGES', true),
  ('STAFF', 'CANCEL_EXCHANGES', false),
  ('ADMIN', 'VIEW_INVENTORY_ADJUSTMENTS', true),
  ('MANAGER', 'VIEW_INVENTORY_ADJUSTMENTS', true),
  ('STAFF', 'VIEW_INVENTORY_ADJUSTMENTS', true),
  ('ADMIN', 'CREATE_INVENTORY_ADJUSTMENTS', true),
  ('MANAGER', 'CREATE_INVENTORY_ADJUSTMENTS', true),
  ('STAFF', 'CREATE_INVENTORY_ADJUSTMENTS', false),
  ('ADMIN', 'CANCEL_INVENTORY_ADJUSTMENTS', true),
  ('MANAGER', 'CANCEL_INVENTORY_ADJUSTMENTS', true),
  ('STAFF', 'CANCEL_INVENTORY_ADJUSTMENTS', false),
  ('ADMIN', 'VIEW_FINANCE', true),
  ('MANAGER', 'VIEW_FINANCE', true),
  ('STAFF', 'VIEW_FINANCE', false),
  ('ADMIN', 'MANAGE_FINANCE', true),
  ('MANAGER', 'MANAGE_FINANCE', false),
  ('STAFF', 'MANAGE_FINANCE', false),
  ('ADMIN', 'VIEW_FINANCIAL_TRANSACTIONS', true),
  ('MANAGER', 'VIEW_FINANCIAL_TRANSACTIONS', true),
  ('STAFF', 'VIEW_FINANCIAL_TRANSACTIONS', false),
  ('ADMIN', 'VIEW_ACCOUNTS', true),
  ('MANAGER', 'VIEW_ACCOUNTS', true),
  ('STAFF', 'VIEW_ACCOUNTS', false),
  ('ADMIN', 'CREATE_ACCOUNT', true),
  ('MANAGER', 'CREATE_ACCOUNT', false),
  ('STAFF', 'CREATE_ACCOUNT', false),
  ('ADMIN', 'UPDATE_ACCOUNT', true),
  ('MANAGER', 'UPDATE_ACCOUNT', false),
  ('STAFF', 'UPDATE_ACCOUNT', false),
  ('ADMIN', 'VIEW_EXPENSES', true),
  ('MANAGER', 'VIEW_EXPENSES', true),
  ('STAFF', 'VIEW_EXPENSES', false),
  ('ADMIN', 'CREATE_EXPENSE', true),
  ('MANAGER', 'CREATE_EXPENSE', true),
  ('STAFF', 'CREATE_EXPENSE', false),
  ('ADMIN', 'UPDATE_EXPENSE', true),
  ('MANAGER', 'UPDATE_EXPENSE', true),
  ('STAFF', 'UPDATE_EXPENSE', false),
  ('ADMIN', 'CANCEL_EXPENSE', true),
  ('MANAGER', 'CANCEL_EXPENSE', true),
  ('STAFF', 'CANCEL_EXPENSE', false),
  ('ADMIN', 'CREATE_TRANSFER', true),
  ('MANAGER', 'CREATE_TRANSFER', true),
  ('STAFF', 'CREATE_TRANSFER', false),
  ('ADMIN', 'VIEW_RECEIVABLES', true),
  ('MANAGER', 'VIEW_RECEIVABLES', true),
  ('STAFF', 'VIEW_RECEIVABLES', false),
  ('ADMIN', 'VIEW_PAYABLES', true),
  ('MANAGER', 'VIEW_PAYABLES', true),
  ('STAFF', 'VIEW_PAYABLES', false),
  ('ADMIN', 'CREATE_FINANCIAL_ADJUSTMENT', true),
  ('MANAGER', 'CREATE_FINANCIAL_ADJUSTMENT', false),
  ('STAFF', 'CREATE_FINANCIAL_ADJUSTMENT', false),
  ('ADMIN', 'VIEW_REPORTS', true),
  ('MANAGER', 'VIEW_REPORTS', true),
  ('STAFF', 'VIEW_REPORTS', false),
  ('ADMIN', 'VIEW_PROFIT_REPORTS', true),
  ('MANAGER', 'VIEW_PROFIT_REPORTS', true),
  ('STAFF', 'VIEW_PROFIT_REPORTS', false),
  ('ADMIN', 'VIEW_SALES_REPORT', true),
  ('MANAGER', 'VIEW_SALES_REPORT', true),
  ('STAFF', 'VIEW_SALES_REPORT', false),
  ('ADMIN', 'VIEW_PURCHASE_REPORT', true),
  ('MANAGER', 'VIEW_PURCHASE_REPORT', true),
  ('STAFF', 'VIEW_PURCHASE_REPORT', false),
  ('ADMIN', 'VIEW_INVENTORY_REPORT', true),
  ('MANAGER', 'VIEW_INVENTORY_REPORT', true),
  ('STAFF', 'VIEW_INVENTORY_REPORT', false),
  ('ADMIN', 'VIEW_PROFIT_REPORT', true),
  ('MANAGER', 'VIEW_PROFIT_REPORT', true),
  ('STAFF', 'VIEW_PROFIT_REPORT', false),
  ('ADMIN', 'VIEW_EXPENSE_REPORT', true),
  ('MANAGER', 'VIEW_EXPENSE_REPORT', true),
  ('STAFF', 'VIEW_EXPENSE_REPORT', false),
  ('ADMIN', 'VIEW_CUSTOMER_REPORT', true),
  ('MANAGER', 'VIEW_CUSTOMER_REPORT', true),
  ('STAFF', 'VIEW_CUSTOMER_REPORT', false),
  ('ADMIN', 'VIEW_SUPPLIER_REPORT', true),
  ('MANAGER', 'VIEW_SUPPLIER_REPORT', true),
  ('STAFF', 'VIEW_SUPPLIER_REPORT', false),
  ('ADMIN', 'VIEW_CASH_FLOW', true),
  ('MANAGER', 'VIEW_CASH_FLOW', true),
  ('STAFF', 'VIEW_CASH_FLOW', false),
  ('ADMIN', 'VIEW_DAILY_CLOSING', true),
  ('MANAGER', 'VIEW_DAILY_CLOSING', true),
  ('STAFF', 'VIEW_DAILY_CLOSING', false),
  ('ADMIN', 'VIEW_FINANCIAL_ANALYTICS', true),
  ('MANAGER', 'VIEW_FINANCIAL_ANALYTICS', true),
  ('STAFF', 'VIEW_FINANCIAL_ANALYTICS', false),
  ('ADMIN', 'EXPORT_REPORTS', true),
  ('MANAGER', 'EXPORT_REPORTS', true),
  ('STAFF', 'EXPORT_REPORTS', false),
  ('ADMIN', 'MANAGE_USERS', true),
  ('MANAGER', 'MANAGE_USERS', false),
  ('STAFF', 'MANAGE_USERS', false),
  ('ADMIN', 'MANAGE_SETTINGS', true),
  ('MANAGER', 'MANAGE_SETTINGS', false),
  ('STAFF', 'MANAGE_SETTINGS', false),
  ('ADMIN', 'VIEW_AUDIT_LOG', true),
  ('MANAGER', 'VIEW_AUDIT_LOG', false),
  ('STAFF', 'VIEW_AUDIT_LOG', false),
  ('ADMIN', 'VIEW_NOTIFICATIONS', true),
  ('MANAGER', 'VIEW_NOTIFICATIONS', true),
  ('STAFF', 'VIEW_NOTIFICATIONS', false)
on conflict (role, permission) do nothing;

-- =============================================================================
-- 7. SETTINGS API (§56)
-- =============================================================================

-- Readers. `security definer` because business rules must be readable by the
-- code that enforces them regardless of who is calling — a salesperson cannot
-- read the settings table, but the sale they create still has to obey the
-- discount ceiling.
create or replace function public.get_setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $fn$
  select s.value from public.system_settings s where s.key = p_key;
$fn$;

create or replace function public.setting_bool(p_key text, p_default boolean default false)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce((public.get_setting(p_key))::text::boolean, p_default);
$fn$;

create or replace function public.setting_number(p_key text, p_default numeric default 0)
returns numeric language sql stable security definer set search_path = '' as $fn$
  select coalesce((public.get_setting(p_key))::text::numeric, p_default);
$fn$;

create or replace function public.setting_text(p_key text, p_default text default '')
returns text language sql stable security definer set search_path = '' as $fn$
  select coalesce(public.get_setting(p_key) #>> '{}', p_default);
$fn$;

create or replace function public.setting_uuid(p_key text)
returns uuid language sql stable security definer set search_path = '' as $fn$
  select nullif(public.get_setting(p_key) #>> '{}', '')::uuid;
$fn$;

create or replace function public.get_settings_by_category(p_category text)
returns table (
  key            text,
  value          jsonb,
  value_type     text,
  category       text,
  min_value      numeric,
  max_value      numeric,
  allowed_values jsonb,
  description    text,
  updated_at     timestamptz
)
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_manage_settings() then
    raise exception 'forbidden: insufficient permission to read settings'
      using errcode = '42501';
  end if;
  return query
    select s.key, s.value, s.value_type, s.category,
           s.min_value, s.max_value, s.allowed_values, s.description, s.updated_at
      from public.system_settings s
     where s.category = p_category
     order by s.key;
end;
$fn$;

-- Writer. Keys are an allowlist by construction: a key that is not already a
-- row cannot be written, so no caller can invent settings (§56).
create or replace function public.update_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_row     public.system_settings;
  v_old     jsonb;
  v_number  numeric;
  v_text    text;
begin
  if not public.can_manage_settings() then
    raise exception 'forbidden: insufficient permission to change settings'
      using errcode = '42501';
  end if;

  select * into v_row from public.system_settings where key = p_key for update;
  if not found then
    raise exception 'unknown_setting: %', p_key using errcode = '22023';
  end if;

  v_old := v_row.value;

  -- Validation is driven by the row's own metadata (§55).
  if v_row.value_type = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'invalid_setting_value: % expects a boolean', p_key using errcode = '22023';
    end if;

  elsif v_row.value_type = 'number' then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'invalid_setting_value: % expects a number', p_key using errcode = '22023';
    end if;
    v_number := p_value::text::numeric;
    if v_row.min_value is not null and v_number < v_row.min_value then
      raise exception 'setting_below_minimum: % (%)', p_key, v_row.min_value using errcode = '22023';
    end if;
    if v_row.max_value is not null and v_number > v_row.max_value then
      raise exception 'setting_above_maximum: % (%)', p_key, v_row.max_value using errcode = '22023';
    end if;

  elsif v_row.value_type = 'enum' then
    if v_row.allowed_values is null or not (v_row.allowed_values @> p_value) then
      raise exception 'invalid_setting_value: % is not an allowed value for %', p_value, p_key
        using errcode = '22023';
    end if;

  elsif v_row.value_type = 'uuid' then
    if jsonb_typeof(p_value) not in ('string', 'null') then
      raise exception 'invalid_setting_value: % expects an id or null', p_key using errcode = '22023';
    end if;
    if jsonb_typeof(p_value) = 'string' then
      begin
        perform (p_value #>> '{}')::uuid;
      exception when others then
        raise exception 'invalid_setting_value: % is not an id', p_key using errcode = '22023';
      end;
    end if;

  elsif v_row.value_type = 'prefix' then
    v_text := btrim(p_value #>> '{}');
    if v_text is null or v_text = '' then
      raise exception 'invalid_setting_value: % cannot be empty', p_key using errcode = '22023';
    end if;
    -- Latin letters, digits, dash and underscore only: the prefix ends up in a
    -- document number that people read out over the phone and type into search.
    if v_text !~ '^[A-Za-z0-9_-]{1,8}$' then
      raise exception 'invalid_prefix: %', v_text using errcode = '22023';
    end if;
    -- Prefixes must stay distinct or two documents could share a number (§62).
    if exists (
      select 1 from public.system_settings s
       where s.category = 'numbering' and s.key <> p_key
         and upper(s.value #>> '{}') = upper(v_text)
    ) then
      raise exception 'duplicate_prefix: %', v_text using errcode = '23505';
    end if;
    p_value := to_jsonb(v_text);

  else -- text
    if jsonb_typeof(p_value) <> 'string' then
      raise exception 'invalid_setting_value: % expects text', p_key using errcode = '22023';
    end if;
    if length(p_value #>> '{}') > 2000 then
      raise exception 'setting_too_long: %', p_key using errcode = '22023';
    end if;
  end if;

  if v_old = p_value then
    return jsonb_build_object('key', p_key, 'value', p_value, 'changed', false);
  end if;

  update public.system_settings
     set value = p_value, updated_by = v_actor, updated_at = now()
   where key = p_key;

  -- §54, §79: a settings change is only trustworthy if it leaves a trail.
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'SETTINGS_UPDATE', 'system_settings', v_row.id,
    jsonb_build_object(
      'key', p_key, 'category', v_row.category,
      'old_value', v_old, 'new_value', p_value
    )
  );

  return jsonb_build_object('key', p_key, 'value', p_value, 'changed', true);
end;
$fn$;

-- =============================================================================
-- 8. STORE PROFILE API
-- =============================================================================

create or replace function public.update_store_settings(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_old   public.store_settings;
  v_new   public.store_settings;
begin
  if not public.can_manage_settings() then
    raise exception 'forbidden: insufficient permission to change store settings'
      using errcode = '42501';
  end if;

  select * into v_old from public.store_settings where id for update;

  -- Currency is the one field that can quietly falsify history: the amounts
  -- already recorded were entered in the old one and nothing restates them.
  -- Only an administrator may change it, and only deliberately (§72, §73).
  if p_payload ? 'currency'
     and upper(btrim(p_payload ->> 'currency')) is distinct from v_old.currency then
    if not public.is_admin() then
      raise exception 'forbidden: only an administrator may change the currency'
        using errcode = '42501';
    end if;
    if coalesce((p_payload ->> 'confirm_currency_change')::boolean, false) is not true then
      raise exception 'currency_change_not_confirmed' using errcode = '22023';
    end if;
  end if;

  update public.store_settings set
    store_name      = coalesce(nullif(btrim(p_payload ->> 'store_name'), ''), store_name),
    store_name_ar   = coalesce(nullif(btrim(p_payload ->> 'store_name_ar'), ''), store_name_ar),
    store_name_en   = coalesce(nullif(btrim(p_payload ->> 'store_name_en'), ''), store_name_en),
    logo_path       = case when p_payload ? 'logo_path'
                             then nullif(btrim(p_payload ->> 'logo_path'), '')
                           else logo_path end,
    phone           = case when p_payload ? 'phone'
                             then nullif(btrim(p_payload ->> 'phone'), '') else phone end,
    secondary_phone = case when p_payload ? 'secondary_phone'
                             then nullif(btrim(p_payload ->> 'secondary_phone'), '')
                           else secondary_phone end,
    email           = case when p_payload ? 'email'
                             then nullif(btrim(p_payload ->> 'email'), '') else email end,
    address         = case when p_payload ? 'address'
                             then nullif(btrim(p_payload ->> 'address'), '') else address end,
    city            = case when p_payload ? 'city'
                             then nullif(btrim(p_payload ->> 'city'), '') else city end,
    country         = coalesce(nullif(btrim(p_payload ->> 'country'), ''), country),
    currency        = coalesce(nullif(upper(btrim(p_payload ->> 'currency')), ''), currency),
    currency_symbol = coalesce(nullif(btrim(p_payload ->> 'currency_symbol'), ''), currency_symbol),
    timezone        = coalesce(nullif(btrim(p_payload ->> 'timezone'), ''), timezone),
    date_format     = coalesce(nullif(btrim(p_payload ->> 'date_format'), ''), date_format),
    updated_at      = now()
  where id
  returning * into v_new;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'SETTINGS_UPDATE', 'store_settings', null,
    jsonb_build_object(
      'old_value', to_jsonb(v_old) - 'created_at' - 'updated_at',
      'new_value', to_jsonb(v_new) - 'created_at' - 'updated_at'
    )
  );

  return to_jsonb(v_new);
end;
$fn$;

-- =============================================================================
-- 9. PERMISSIONS
-- =============================================================================

create or replace function public.role_has_permission(p_role text, p_permission text)
returns boolean
language sql stable security definer set search_path = '' as $fn$
  select coalesce(
    (select rp.allowed
       from public.role_permissions rp
      where rp.role = p_role and rp.permission = p_permission),
    false);
$fn$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = '' as $fn$
  select public.is_active_user()
     and public.role_has_permission(public.current_user_role(), p_permission);
$fn$;

comment on function public.has_permission(text) is
  'Does the caller hold this permission? The single question every write path asks.';

-- The application needs the caller's own permission list to decide what to
-- render. Reading `role_permissions` directly is administrator-only, and quite
-- rightly — but knowing what *you* may do is not a privilege, so this returns
-- exactly that and nothing about anyone else's role.
create or replace function public.my_permissions()
returns setof text
language sql stable security definer set search_path = '' as $fn$
  select rp.permission
    from public.role_permissions rp
   where rp.role = public.current_user_role()
     and rp.allowed
     and public.is_active_user();
$fn$;

-- The Phase 1–7 helpers, rewritten to consult the matrix. Each keeps the exact
-- meaning it had: the permission chosen for each is the one whose seeded role
-- assignment reproduces the old role list, so behaviour is unchanged today and
-- configurable tomorrow. Every one now also requires an active account, which
-- two of them previously did not.
create or replace function public.can_manage_catalog()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_PRODUCTS');
$fn$;

create or replace function public.can_manage_purchases()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_PURCHASES');
$fn$;

create or replace function public.can_sell()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_SALES');
$fn$;

create or replace function public.can_manage_sales()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CANCEL_SALES');
$fn$;

create or replace function public.can_return()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_RETURNS');
$fn$;

create or replace function public.can_manage_returns()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_REFUNDS');
$fn$;

create or replace function public.can_adjust_inventory()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_INVENTORY_ADJUSTMENTS');
$fn$;

create or replace function public.can_view_finance()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('VIEW_FINANCE');
$fn$;

create or replace function public.can_manage_finance()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_EXPENSE');
$fn$;

create or replace function public.can_administer_finance()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('CREATE_FINANCIAL_ADJUSTMENT');
$fn$;

create or replace function public.can_view_reports()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('VIEW_REPORTS');
$fn$;

create or replace function public.can_manage_settings()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('MANAGE_SETTINGS');
$fn$;

create or replace function public.can_manage_users()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('MANAGE_USERS');
$fn$;

create or replace function public.can_view_audit_log()
returns boolean language sql stable set search_path = '' as $fn$
  select public.has_permission('VIEW_AUDIT_LOG');
$fn$;

-- Writer for the matrix.
create or replace function public.set_role_permission(
  p_role text, p_permission text, p_allowed boolean
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_old   boolean;
begin
  if not public.can_manage_settings() then
    raise exception 'forbidden: insufficient permission to change permissions'
      using errcode = '42501';
  end if;

  -- §16. An administrator with a missing permission is a system that can lock
  -- itself out, so the answer is that ADMIN is not a configurable role at all.
  if p_role = 'ADMIN' then
    raise exception 'admin_permissions_are_fixed' using errcode = '42501';
  end if;

  if not exists (select 1 from public.role_permissions where role = p_role and permission = p_permission) then
    raise exception 'unknown_permission: %', p_permission using errcode = '22023';
  end if;

  select allowed into v_old from public.role_permissions
   where role = p_role and permission = p_permission;

  if v_old = p_allowed then
    return jsonb_build_object('role', p_role, 'permission', p_permission, 'changed', false);
  end if;

  update public.role_permissions
     set allowed = p_allowed, updated_by = v_actor, updated_at = now()
   where role = p_role and permission = p_permission;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'SETTINGS_UPDATE', 'role_permissions', null,
    jsonb_build_object(
      'role', p_role, 'permission', p_permission,
      'old_value', v_old, 'new_value', p_allowed
    )
  );

  return jsonb_build_object('role', p_role, 'permission', p_permission, 'changed', true);
end;
$fn$;

-- =============================================================================
-- 10. RLS
-- =============================================================================

alter table public.store_settings   enable row level security;
alter table public.system_settings  enable row level security;
alter table public.role_permissions enable row level security;
alter table public.app_config       enable row level security;

-- The store profile is read by anyone signed in — the header and receipts need
-- the name and logo. Writing goes through update_store_settings.
drop policy if exists "store settings readable" on public.store_settings;
create policy "store settings readable"
  on public.store_settings for select to authenticated
  using (public.is_active_user());

drop policy if exists "settings readable by managers" on public.system_settings;
create policy "settings readable by managers"
  on public.system_settings for select to authenticated
  using (public.can_manage_settings());

drop policy if exists "permissions readable by managers" on public.role_permissions;
create policy "permissions readable by managers"
  on public.role_permissions for select to authenticated
  using (public.can_manage_settings());

drop policy if exists "app config readable" on public.app_config;
create policy "app config readable"
  on public.app_config for select to authenticated
  using (public.is_active_user());

-- No INSERT/UPDATE/DELETE policies anywhere above: every write goes through a
-- SECURITY DEFINER function that validates and audits. A table with no write
-- policy is a table nobody can write directly, which is the point.

-- =============================================================================
-- 11. GRANTS
-- =============================================================================

revoke all on function public.update_setting(text, jsonb)             from public;
revoke all on function public.update_store_settings(jsonb)            from public;
revoke all on function public.set_role_permission(text, text, boolean) from public;
revoke all on function public.get_settings_by_category(text)          from public;

grant execute on function public.get_setting(text)                     to authenticated;
grant execute on function public.setting_bool(text, boolean)           to authenticated;
grant execute on function public.setting_number(text, numeric)         to authenticated;
grant execute on function public.setting_text(text, text)              to authenticated;
grant execute on function public.setting_uuid(text)                    to authenticated;
grant execute on function public.get_settings_by_category(text)        to authenticated;
grant execute on function public.update_setting(text, jsonb)           to authenticated;
grant execute on function public.update_store_settings(jsonb)          to authenticated;
grant execute on function public.set_role_permission(text, text, boolean) to authenticated;
grant execute on function public.role_has_permission(text, text)       to authenticated;
grant execute on function public.has_permission(text)                  to authenticated;
grant execute on function public.my_permissions()                      to authenticated;
grant execute on function public.can_manage_settings()                 to authenticated;
grant execute on function public.can_manage_users()                    to authenticated;
grant execute on function public.can_view_audit_log()                  to authenticated;
