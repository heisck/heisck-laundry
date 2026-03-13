do $$
begin
  if not exists (select 1 from pg_type where typname = 'laundry_worker') then
    create type laundry_worker as enum (
      'GIFTY_BLESSING',
      'EUGEN',
      'NOBODY'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payout_owner_side') then
    create type payout_owner_side as enum (
      'YOUR_SIDE',
      'PARTNER_SIDE'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payable_task_type') then
    create type payable_task_type as enum (
      'WASHING',
      'DRYING_DOWNSTAIRS',
      'REMOVED_FROM_LINE',
      'DRYER_OPERATION'
    );
  end if;
end
$$;

alter table week_report_rows
  add column if not exists package_type laundry_package_type;

update week_report_rows
set package_type = 'NORMAL_WASH_DRY'
where package_type is null;

alter table week_report_rows
  alter column package_type set default 'NORMAL_WASH_DRY';

alter table week_report_rows
  alter column package_type set not null;

create table if not exists package_task_assignments (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  week_id uuid not null references processing_weeks(id) on delete cascade,
  task_type payable_task_type not null,
  worker_name laundry_worker not null,
  owner_side payout_owner_side not null,
  amount_ghs numeric(12, 2) not null check (amount_ghs >= 0),
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  constraint package_task_assignments_unique_task unique (package_id, task_type)
);

create index if not exists package_task_assignments_week_id_idx
  on package_task_assignments(week_id);

create index if not exists package_task_assignments_worker_name_idx
  on package_task_assignments(worker_name);

create table if not exists week_report_task_entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references processing_weeks(id) on delete cascade,
  package_id uuid not null,
  order_id text not null,
  room_number text not null,
  package_type laundry_package_type not null,
  task_type payable_task_type not null,
  worker_name laundry_worker not null,
  owner_side payout_owner_side not null,
  amount_ghs numeric(12, 2) not null check (amount_ghs >= 0),
  assigned_at timestamptz not null
);

create index if not exists week_report_task_entries_week_id_idx
  on week_report_task_entries(week_id);
