create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'processing_week_status') then
    create type processing_week_status as enum ('ACTIVE', 'CLOSED');
  end if;

  if not exists (select 1 from pg_type where typname = 'package_status') then
    create type package_status as enum (
      'RECEIVED',
      'WASHING',
      'DRYING',
      'READY_FOR_PICKUP',
      'PICKED_UP'
    );
  end if;
end
$$;

create table if not exists processing_weeks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status processing_week_status not null default 'ACTIVE',
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  constraint processing_weeks_time_check check (end_at > start_at)
);

create unique index if not exists processing_weeks_single_active_idx
  on processing_weeks ((status))
  where status = 'ACTIVE';

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references processing_weeks(id) on delete restrict,
  order_id text not null unique,
  tracking_token_id text not null unique,
  customer_name text not null,
  room_number text not null,
  clothes_count integer not null check (clothes_count >= 0),
  total_weight_kg numeric(12, 2) not null check (total_weight_kg >= 0),
  total_price_ghs numeric(12, 2) not null check (total_price_ghs >= 0),
  primary_phone text not null,
  secondary_phone text,
  status package_status not null default 'RECEIVED',
  eta_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  picked_up_at timestamptz,
  expires_at timestamptz not null
);

create index if not exists packages_week_id_idx on packages(week_id);
create index if not exists packages_room_number_idx on packages(room_number);
create index if not exists packages_customer_name_idx on packages(customer_name);
create index if not exists packages_status_idx on packages(status);
create index if not exists packages_expires_at_idx on packages(expires_at);

create table if not exists package_status_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  from_status package_status,
  to_status package_status not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now()
);

create index if not exists package_status_events_package_id_idx
  on package_status_events(package_id);

create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('CREATED', 'STATUS_CHANGED')),
  status_context package_status,
  phone_number text not null,
  provider text not null default 'arkesel',
  provider_message_id text,
  delivery_state text not null,
  error_text text,
  sent_at timestamptz not null default now()
);

create index if not exists notification_logs_package_id_idx
  on notification_logs(package_id);

create table if not exists week_reports (
  week_id uuid primary key references processing_weeks(id) on delete cascade,
  package_count integer not null,
  total_clothes_count integer not null,
  total_weight_kg numeric(12, 2) not null,
  total_price_ghs numeric(12, 2) not null,
  generated_at timestamptz not null default now(),
  generated_by uuid
);

create table if not exists week_report_rows (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references processing_weeks(id) on delete cascade,
  package_id uuid not null,
  order_id text not null,
  customer_name text not null,
  room_number text not null,
  clothes_count integer not null,
  total_weight_kg numeric(12, 2) not null,
  total_price_ghs numeric(12, 2) not null,
  primary_phone text not null,
  secondary_phone text,
  status_at_close package_status not null,
  created_at timestamptz not null
);

create index if not exists week_report_rows_week_id_idx
  on week_report_rows(week_id);

create or replace function set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists packages_set_updated_at on packages;
create trigger packages_set_updated_at
before update on packages
for each row
execute function set_updated_at_timestamp();

create or replace function prevent_closed_week_core_mutations()
returns trigger
language plpgsql
as $$
declare
  week_status processing_week_status;
begin
  select status into week_status from processing_weeks where id = old.week_id;

  if week_status = 'CLOSED' then
    if
      new.customer_name is distinct from old.customer_name or
      new.room_number is distinct from old.room_number or
      new.clothes_count is distinct from old.clothes_count or
      new.total_weight_kg is distinct from old.total_weight_kg or
      new.total_price_ghs is distinct from old.total_price_ghs or
      new.primary_phone is distinct from old.primary_phone or
      new.secondary_phone is distinct from old.secondary_phone or
      new.eta_at is distinct from old.eta_at
    then
      raise exception 'Core package fields are locked after week closure.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists packages_lock_closed_week_core_fields on packages;
create trigger packages_lock_closed_week_core_fields
before update on packages
for each row
execute function prevent_closed_week_core_mutations();
