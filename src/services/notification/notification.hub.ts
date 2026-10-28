import type { Response } from 'express';
import { HEARTBEAT_INTERVAL_MS, MAX_CONNECTIONS_PER_USER } from '../../constants/notification.constants.js';

// Live SSE connections, keyed by user. In-memory, so it only reaches clients connected to this
// instance; running more than one instance would need a shared pub/sub in front of it.
const connections = new Map<string, Set<Response>>();

// Registers a connection and returns the function that removes it. The oldest connection is closed
// when a user goes over the cap (e.g. many open tabs), so a client can't hold unbounded sockets.
export function subscribe(userId: string, res: Response): () => void {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  while (set.size >= MAX_CONNECTIONS_PER_USER) {
    const oldest = set.values().next().value as Response;
    set.delete(oldest);
    oldest.end();
  }
  set.add(res);

  return () => {
    const current = connections.get(userId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) connections.delete(userId);
  };
}

export function publish(userId: string, event: string, payload: unknown): void {
  const set = connections.get(userId);
  if (!set) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(frame);
}

// Ends every stream the user has open, e.g. after a password change revokes their sessions.
export function closeUser(userId: string): void {
  const set = connections.get(userId);
  if (!set) return;
  connections.delete(userId);
  for (const res of set) res.end();
}

// Keeps idle connections alive with a comment frame on a timer.
export function startHeartbeat(): void {
  setInterval(() => {
    for (const set of connections.values()) for (const res of set) res.write(': ping\n\n');
  }, HEARTBEAT_INTERVAL_MS).unref();
}
