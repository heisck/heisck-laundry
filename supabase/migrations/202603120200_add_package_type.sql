do $$
begin
  if not exists (select 1 from pg_type where typname = 'laundry_package_type') then
    create type laundry_package_type as enum (
      'WASH_ONLY',
      'NORMAL_WASH_DRY',
      'EXPRESS_WASH_DRY'
    );
  end if;
end
$$;

alter table packages
  add column if not exists package_type laundry_package_type;

update packages
set package_type = 'NORMAL_WASH_DRY'
where package_type is null;

alter table packages
  alter column package_type set default 'NORMAL_WASH_DRY';

alter table packages
  alter column package_type set not null;

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
      new.package_type is distinct from old.package_type or
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
