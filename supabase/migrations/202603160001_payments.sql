alter table packages
  add column if not exists payment_status text not null default 'UNPAID'
    check (payment_status in ('UNPAID', 'PENDING', 'PAID'));

alter table packages
  add column if not exists payment_reference text;

alter table packages
  add column if not exists payment_paid_at timestamptz;

create index if not exists packages_payment_status_idx on packages(payment_status);
create index if not exists packages_payment_reference_idx on packages(payment_reference);
