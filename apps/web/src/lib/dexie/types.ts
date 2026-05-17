import type { PublicTableRow } from '@/data';

export type ReportHistory = PublicTableRow<'report_histories'>;
export type ReportHistoryType = ReportHistory['type'];
export type ReportHistoryWaterLevel = ReportHistory['water_level'];
export type ResidentAccessMethod = 'scan' | 'upload' | 'manual';

export type ReportHistoryOutboxAction = 'insert_report_history';
export type ReportHistoryOutboxStatus = 'queued' | 'sending' | 'sent' | 'failed';

export type ReportHistoryOutbox = {
  id: string;
  report_history_id: string;
  family_code: string | null;
  action: ReportHistoryOutboxAction;
  status: ReportHistoryOutboxStatus;
  attempt_count: number;
  last_error: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportHistoryWithOutboxState = ReportHistory & {
  outbox_status: ReportHistoryOutboxStatus;
  outbox_attempt_count: number;
  outbox_last_error: string | null;
  outbox_synced_at: string | null;
};
