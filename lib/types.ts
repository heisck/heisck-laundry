export const PACKAGE_STATUSES = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
] as const;

export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const PACKAGE_TYPES = [
  "WASH_ONLY",
  "NORMAL_WASH_DRY",
  "EXPRESS_WASH_DRY",
] as const;

export type PackageType = (typeof PACKAGE_TYPES)[number];

export const PROCESSING_WEEK_STATUSES = ["ACTIVE", "CLOSED"] as const;
export type ProcessingWeekStatus = (typeof PROCESSING_WEEK_STATUSES)[number];

export const LAUNDRY_WORKERS = [
  "GIFTY_BLESSING",
  "EUGEN",
  "NOBODY",
] as const;

export type LaundryWorker = (typeof LAUNDRY_WORKERS)[number];

export const PAYOUT_OWNER_SIDES = ["YOUR_SIDE", "PARTNER_SIDE"] as const;
export type PayoutOwnerSide = (typeof PAYOUT_OWNER_SIDES)[number];

export const PAYABLE_TASK_TYPES = [
  "WASHING",
  "DRYING_DOWNSTAIRS",
  "REMOVED_FROM_LINE",
  "DRYER_OPERATION",
] as const;

export type PayableTaskType = (typeof PAYABLE_TASK_TYPES)[number];

export type NotificationTriggerType = "CREATED" | "STATUS_CHANGED";

export interface ProcessingWeek {
  id: string;
  label: string;
  start_at: string;
  end_at: string;
  status: ProcessingWeekStatus;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
}

export interface ProcessingWeekWithReport extends ProcessingWeek {
  package_count: number | null;
  total_clothes_count: number | null;
  total_weight_kg: number | null;
  total_price_ghs: number | null;
  generated_at: string | null;
}

export interface PackageRecord {
  id: string;
  week_id: string;
  order_id: string;
  tracking_token_id: string;
  customer_name: string;
  room_number: string;
  package_type: PackageType;
  clothes_count: number;
  total_weight_kg: number;
  total_price_ghs: number;
  primary_phone: string;
  secondary_phone: string | null;
  status: PackageStatus;
  eta_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  picked_up_at: string | null;
  expires_at: string;
  week_status: ProcessingWeekStatus;
  last_delivery_state: string | null;
  last_notification_at: string | null;
}

export interface NotificationLogRecord {
  id: string;
  package_id: string;
  trigger_type: NotificationTriggerType;
  status_context: PackageStatus | null;
  phone_number: string;
  provider: string;
  provider_message_id: string | null;
  delivery_state: string;
  error_text: string | null;
  sent_at: string;
}

export interface PackageTaskAssignmentRecord {
  id: string;
  package_id: string;
  week_id: string;
  task_type: PayableTaskType;
  worker_name: LaundryWorker;
  owner_side: PayoutOwnerSide;
  amount_ghs: number;
  assigned_by: string;
  assigned_at: string;
}

export interface WeekReportSummary {
  week_id: string;
  package_count: number;
  total_clothes_count: number;
  total_weight_kg: number;
  total_price_ghs: number;
  generated_at: string;
  generated_by: string | null;
}

export interface WeekReportRow {
  id: string;
  week_id: string;
  package_id: string;
  order_id: string;
  customer_name: string;
  room_number: string;
  package_type: PackageType;
  clothes_count: number;
  total_weight_kg: number;
  total_price_ghs: number;
  primary_phone: string;
  secondary_phone: string | null;
  status_at_close: PackageStatus;
  created_at: string;
}

export interface WeekTaskEntry {
  id: string;
  week_id: string;
  package_id: string;
  order_id: string;
  room_number: string;
  package_type: PackageType;
  task_type: PayableTaskType;
  worker_name: LaundryWorker;
  owner_side: PayoutOwnerSide;
  amount_ghs: number;
  assigned_at: string;
}

export interface PackageTypeSummary {
  wash_only_count: number;
  normal_wash_dry_count: number;
  express_wash_dry_count: number;
}

export interface ExpressBusinessSummary {
  express_package_count: number;
  express_total_weight_kg: number;
  your_express_share_ghs: number;
  partner_express_share_ghs: number;
  express_fixed_charge_total_ghs: number;
}

export interface WorkerPayoutSummary {
  worker_name: LaundryWorker;
  washing_count: number;
  drying_downstairs_count: number;
  removed_from_line_count: number;
  dryer_operation_count: number;
  your_side_total_ghs: number;
  partner_side_total_ghs: number;
  grand_total_ghs: number;
}

export interface WeekSnapshot {
  week: ProcessingWeek;
  report: WeekReportSummary;
  rows: WeekReportRow[];
  task_entries: WeekTaskEntry[];
  package_type_summary: PackageTypeSummary;
  express_business_summary: ExpressBusinessSummary;
  worker_payout_summaries: WorkerPayoutSummary[];
}
