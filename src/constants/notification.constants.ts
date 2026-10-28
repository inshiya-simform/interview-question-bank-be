// Read notifications older than this are deleted by the retention sweep; unread ones are kept.
export const READ_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Cap on open SSE streams per user (e.g. many tabs); the oldest is closed past it.
export const MAX_CONNECTIONS_PER_USER = 5;
// Proxies drop idle connections (Render's after ~55s), so a comment frame is sent on this interval.
export const HEARTBEAT_INTERVAL_MS = 25_000;
