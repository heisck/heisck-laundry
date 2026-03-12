create index if not exists notification_logs_package_id_sent_at_desc_idx
  on notification_logs(package_id, sent_at desc);
