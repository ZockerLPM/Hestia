import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { connectSocket, disconnectSocket } from '../api/socket';

const EVENT_INVALIDATIONS: Record<string, string[][]> = {
  'shopping:item-added':     [['shopping-items'], ['shopping-lists']],
  'shopping:item-updated':   [['shopping-items']],
  'shopping:item-deleted':   [['shopping-items'], ['shopping-lists']],
  'shopping:checked-cleared':[['shopping-items'], ['shopping-lists']],
  'tasks:created':           [['tasks']],
  'tasks:updated':           [['tasks']],
  'tasks:deleted':           [['tasks']],
  'calendar:created':        [['calendar-events']],
  'calendar:updated':        [['calendar-events']],
  'calendar:deleted':        [['calendar-events']],
  'pantry:changed':          [['pantry-items'], ['pantry-low-stock'], ['pantry-expiring']],
  'finance:changed':         [['finance-entries'], ['finance-summary']],
  'mealplan:changed':        [['meal-plans']],
};

export function useRealtimeSync() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    const handlers: Array<[string, () => void]> = Object.entries(EVENT_INVALIDATIONS).map(
      ([event, keys]) => [
        event,
        () => keys.forEach((key) => qc.invalidateQueries({ queryKey: key })),
      ],
    );

    handlers.forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      handlers.forEach(([event, handler]) => socket.off(event, handler));
    };
  }, [token, qc]);

  useEffect(() => {
    return () => {
      if (!useAuthStore.getState().token) disconnectSocket();
    };
  }, []);
}
