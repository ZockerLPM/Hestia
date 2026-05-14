import { api } from './client';

export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    unit_of_measurement?: string;
    device_class?: string;
    icon?: string;
  };
  last_changed: string;
}

export interface HAEntityDescriptor {
  entityId: string;
  friendlyName: string;
  domain: string;
  unit: string | null;
  deviceClass: string | null;
}

export interface HAHealth {
  configured: boolean;
  ok?: boolean;
  version?: string;
  error?: string;
}

/** Gibt nur die States der gewünschten entityIds zurück (kein Full Dump). */
export async function fetchHAStates(entityIds: string[]): Promise<HAState[]> {
  if (entityIds.length === 0) return [];
  const { data } = await api.post('/ha/states', { entityIds });
  return data;
}

/** Auto-Discovery für den Config-Editor. */
export async function fetchHAEntities(): Promise<HAEntityDescriptor[]> {
  const { data } = await api.get('/ha/entities');
  return data;
}

export async function fetchHAHealth(): Promise<HAHealth> {
  const { data } = await api.get('/ha/health');
  return data;
}

/** Service-Call ausführen. service_data optional (z.B. brightness, color etc.). */
export async function callHAService(
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>,
): Promise<void> {
  await api.post(`/ha/service/${domain}/${service}`, serviceData ?? {});
}
