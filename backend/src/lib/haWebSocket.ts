// Persistente WebSocket-Verbindung zu Home Assistant.
// Subscribed auf state_changed, broadcasted Events via Socket.io an
// den 'household'-Room. Frontend hört über useWallData darauf und
// aktualisiert React-Query-Cache live.
//
// Reconnect mit exponential backoff. Bei Konfigurationsfehlern (kein
// Token, auth_invalid) wird kein endloses Retry gefahren.

import type { Server } from 'socket.io';

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
}

interface StateChangedEvent {
  entity_id: string;
  new_state: HAState | null;
  old_state: HAState | null;
}

let socket: WebSocket | null = null;
let messageId = 1;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempt = 0;
let authFailed = false;

function nextId(): number {
  return messageId++;
}

function wsUrl(): string | null {
  const httpUrl = process.env.HOMEASSISTANT_URL?.replace(/\/+$/, '');
  if (!httpUrl) return null;
  // http(s)://host:port → ws(s)://host:port/api/websocket
  const wsScheme = httpUrl.startsWith('https://') ? 'wss://' : 'ws://';
  const hostAndPort = httpUrl.replace(/^https?:\/\//, '');
  return `${wsScheme}${hostAndPort}/api/websocket`;
}

function scheduleReconnect(io: Server) {
  if (authFailed) return; // kein Endlos-Retry bei Konfigfehler
  if (reconnectTimer) return;
  // Exponential backoff: 2s, 4s, 8s, ... max 60s
  const delay = Math.min(2000 * 2 ** reconnectAttempt, 60_000);
  reconnectAttempt++;
  console.log(`[ha-ws] Reconnect in ${delay / 1000}s (attempt ${reconnectAttempt})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectHA(io);
  }, delay);
}

export function connectHA(io: Server): void {
  const url = wsUrl();
  const token = process.env.HOMEASSISTANT_TOKEN;
  if (!url || !token) {
    console.log('[ha-ws] Keine HOMEASSISTANT_URL/TOKEN — WebSocket übersprungen, Frontend nutzt Polling-Fallback.');
    return;
  }
  if (socket && socket.readyState === WebSocket.OPEN) return;

  console.log(`[ha-ws] Connecting to ${url}`);
  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    console.log('[ha-ws] WebSocket open, waiting for auth handshake');
  });

  socket.addEventListener('message', (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    } catch (e) {
      console.warn('[ha-ws] Invalid JSON received');
      return;
    }

    if (msg.type === 'auth_required') {
      socket?.send(JSON.stringify({ type: 'auth', access_token: token }));
      return;
    }

    if (msg.type === 'auth_invalid') {
      console.error('[ha-ws] Auth invalid — Token prüfen. Kein Reconnect.');
      authFailed = true;
      socket?.close();
      return;
    }

    if (msg.type === 'auth_ok') {
      console.log(`[ha-ws] Authenticated, HA version ${msg.ha_version ?? '?'}`);
      reconnectAttempt = 0;
      // State-Changes abonnieren
      socket?.send(JSON.stringify({
        id: nextId(),
        type: 'subscribe_events',
        event_type: 'state_changed',
      }));
      return;
    }

    if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
      const data = msg.event.data as StateChangedEvent;
      if (!data?.entity_id || !data.new_state) return;
      // Auf den 'household'-Room broadcasten. Frontend filtert client-
      // seitig nach den entityIds, die in der eigenen WallConfig stehen.
      io.to('household').emit('ha-state-changed', {
        entity_id: data.entity_id,
        state: data.new_state.state,
        attributes: data.new_state.attributes,
        last_changed: data.new_state.last_changed,
      });
    }
  });

  socket.addEventListener('close', (ev) => {
    console.log(`[ha-ws] Closed (code=${ev.code})`);
    socket = null;
    scheduleReconnect(io);
  });

  socket.addEventListener('error', (ev) => {
    console.warn('[ha-ws] Error:', ev);
    // 'close' wird auch gefeuert, dort scheduleReconnect
  });
}
