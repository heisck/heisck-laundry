do $$
begin
  if exists (select 1 from pg_type where typname = 'payable_task_type') then
    alter type payable_task_type add value if not exists 'INTAKE';
    alter type payable_task_type add value if not exists 'FOLDED';
    alter type payable_task_type add value if not exists 'REMOVED_AND_FOLDED_FROM_DRYER';
  end if;
end
$$;

alter table packages
  add column if not exists payment_source text not null default 'NONE'
    check (payment_source in ('NONE', 'PAYSTACK', 'MANUAL'));

update packages
set payment_source =
  case
    when payment_status in ('PENDING', 'PAID') and payment_reference is not null then 'PAYSTACK'
    else 'NONE'
  end
where payment_source = 'NONE';

create index if not exists packages_payment_source_idx on packages(payment_source);

create table if not exists private_access_settings (
  singleton boolean primary key default true check (singleton),
  password_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into private_access_settings (singleton, password_hash, updated_at, updated_by)
values
  (
    true,
    'scrypt:1a2a9355571266e4ecf0b960704c8f7f:5a9ae799799f31bdff1bb69b0e488245bcd441eef8fe2d61d1d849837390386897d7f759644dfe1793f8af65fcbf82b01cdcf411f8790347001450f2bab1910e',
    now(),
    null
  )
on conflict (singleton) do nothing;
