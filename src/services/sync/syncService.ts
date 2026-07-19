import { outboxService } from '../outboxService';

export async function getLocalSyncPreparationStatus() {
  return outboxService.getStatusSummary();
}
