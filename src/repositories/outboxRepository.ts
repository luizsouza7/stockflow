import { localDb } from '../services/db/localDb';
import type { OutboxEntry, OutboxStatus } from '../types/Sync';

export const outboxRepository = {
  async add(entry: OutboxEntry): Promise<string> {
    return localDb.outbox.add(entry);
  },

  async findAll(): Promise<OutboxEntry[]> {
    return localDb.outbox.orderBy('createdAt').toArray();
  },

  async countByStatus(status: OutboxStatus): Promise<number> {
    return localDb.outbox.where('status').equals(status).count();
  },
};
