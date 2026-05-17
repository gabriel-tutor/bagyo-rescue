import Dexie, { type EntityTable } from 'dexie';
import { dexieSchema } from './schema';
import type { ReportHistory, ReportHistoryOutbox } from './types';

export type BagyoRescueDexie = Dexie & {
  reportHistories: EntityTable<ReportHistory, 'id'>;
  reportHistoryOutbox: EntityTable<ReportHistoryOutbox, 'id'>;
};

export function createDexieClient() {
  const dexie = new Dexie(dexieSchema.databaseName) as BagyoRescueDexie;

  dexie.version(dexieSchema.version).stores(dexieSchema.stores);

  return dexie;
}

export const dexie = createDexieClient();
