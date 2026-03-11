export const PACKAGE_STATUSES = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
] as const;

export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const PROCESSING_WEEK_STATUSES = ["ACTIVE", "CLOSED"] as const;
export type ProcessingWeekStatus = (typeof PROCESSING_WEEK_STATUSES)[number];

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
  clothes_count: number;
  total_weight_kg: number;
  total_price_ghs: number;
  primary_phone: string;
  secondary_phone: string | null;
  status_at_close: PackageStatus;
  created_at: string;
}

export interface WeekSnapshot {
  week: ProcessingWeek;
  report: WeekReportSummary;
  rows: WeekReportRow[];
}
