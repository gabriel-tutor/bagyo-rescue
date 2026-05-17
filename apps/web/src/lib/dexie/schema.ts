export const dexieSchema = {
  databaseName: 'bagyoRescue',
  version: 7,
  stores: {
    reportHistories: 'id, family_code, type, status, created_at, [family_code+type]',
    reportHistoryOutbox:
      'id, report_history_id, family_code, status, created_at, [family_code+status]',
  },
} as const;
