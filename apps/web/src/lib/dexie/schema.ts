export const dexieSchema = {
  databaseName: 'bagyoRescue',
  version: 1,
  stores: {
    reports: 'id, createdAt, priority, status, location',
  },
} as const;
