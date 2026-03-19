create table if not exists package_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  tracking_token_id text not null,
  order_id text not null,
  paystack_reference text not null unique,
  paystack_access_code text,
  paystack_authorization_url text,
  status text not null default 'PENDING'
    check (
      status in (
        'PENDING',
        'SUCCESS',
        'FAILED',
        'CANCELLED',
        'VERIFICATION_FAILED',
        'AMOUNT_MISMATCH'
      )
    ),
  amount_expected_kobo integer not null check (amount_expected_kobo >= 0),
  amount_paid_kobo integer check (amount_paid_kobo >= 0),
  currency text not null default 'GHS',
  paystack_status text,
  verification_message text,
  failure_reason text,
  customer_email text not null,
  metadata jsonb not null default '{}'::jsonb,
  paystack_response jsonb,
  paid_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists package_payment_attempts_package_id_idx
  on package_payment_attempts(package_id);

create index if not exists package_payment_attempts_tracking_token_id_idx
  on package_payment_attempts(tracking_token_id);

create index if not exists package_payment_attempts_status_idx
  on package_payment_attempts(status);

create index if not exists package_payment_attempts_created_at_idx
  on package_payment_attempts(created_at desc);

drop trigger if exists package_payment_attempts_set_updated_at
  on package_payment_attempts;

create trigger package_payment_attempts_set_updated_at
before update on package_payment_attempts
for each row
execute function set_updated_at_timestamp();
