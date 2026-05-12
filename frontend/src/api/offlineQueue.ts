import { get, set, del } from 'idb-keyval';
import { api } from './client';

const KEY = 'hestia-offline-queue';

export interface QueuedRequest {
  id: string;
  method: 'post' | 'put' | 'delete' | 'patch';
  url: string;
  data?: unknown;
  createdAt: number;
}

async function load(): Promise<QueuedRequest[]> {
  return (await get<QueuedRequest[]>(KEY)) ?? [];
}

async function save(queue: QueuedRequest[]) {
  if (queue.length === 0) await del(KEY);
  else await set(KEY, queue);
}

export async function enqueue(req: Omit<QueuedRequest, 'id' | 'createdAt'>) {
  const queue = await load();
  queue.push({ ...req, id: crypto.randomUUID(), createdAt: Date.now() });
  await save(queue);
  return queue.length;
}

export async function queueSize(): Promise<number> {
  return (await load()).length;
}

let flushing = false;

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const queue = await load();
    const remaining: QueuedRequest[] = [];
    for (const item of queue) {
      try {
        await api.request({ method: item.method, url: item.url, data: item.data, silent: true });
        sent++;
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status && status >= 400 && status < 500) {
          failed++;
        } else {
          remaining.push(item);
        }
      }
    }
    await save(remaining);
  } finally {
    flushing = false;
  }
  return { sent, failed };
}
