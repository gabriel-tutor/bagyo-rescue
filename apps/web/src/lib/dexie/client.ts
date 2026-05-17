import Dexie, { type EntityTable } from 'dexie';
import { dexieSchema } from './schema';
import type { RescueReport } from './types';

export type BagyoRescueDexie = Dexie & {
  reports: EntityTable<RescueReport, 'id'>;
};

export function createDexieClient() {
  const dexie = new Dexie(dexieSchema.databaseName) as BagyoRescueDexie;

  dexie.version(dexieSchema.version).stores(dexieSchema.stores);

  return dexie;
}

export const dexie = createDexieClient();
