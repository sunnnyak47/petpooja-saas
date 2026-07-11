/**
 * useStaffChat — data layer for the Staff Chat (internal messaging) screen.
 *
 * Exposes:
 *   • pure transforms (normalizeMessage / mergeMessages / formatMessageTime /
 *     dayLabel / groupMessagesByDay) — unit-tested in __tests__/staffchat.test.js
 *   • useStaffMessages()   — react-query poll (5s) of GET /api/chat/messages
 *   • useSendMessage()     — optimistic POST /api/chat/messages
 *   • useStaffChatRealtime — native WS listener that refetches on CHAT_MESSAGE
 *
 * Every fetch is scoped to the SELECTED outlet (useOutlet().outletId) — the
 * owner's user row often has no outlet_id, so we must never rely on the
 * server default.
 */
import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';
import { getAccessToken } from '../lib/tokenStore';

const WS_URL = 'wss://petpooja-saas.onrender.com/ws';
const POLL_MS = 5000;
const DEFAULT_LIMIT = 100;
const BASE_RECONNECT_MS = 5000;
const MAX_RECONNECT_MS = 60000;

/** react-query key for an outlet's chat transcript. */
export const chatKey = (outletId, limit = DEFAULT_LIMIT) => ['staff-chat', outletId, limit];

// ─── Pure transforms (unit-tested) ───────────────────────────────────────────

/**
 * Normalize a raw server message row into a stable shape the UI reads.
 * Tolerates optimistic rows (client-generated id, pending flag).
 * @param {object} m
 * @returns {object|null}
 */
export function normalizeMessage(m) {
  if (!m || typeof m !== 'object') return null;
  const id = m.id ?? m._id ?? null;
  return {
    id: id != null ? String(id) : null,
    outlet_id: m.outlet_id ?? null,
    user_id: m.user_id != null ? String(m.user_id) : null,
    user_name: m.user_name || 'Staff',
    body: typeof m.body === 'string' ? m.body : '',
    created_at: m.created_at || new Date().toISOString(),
    pending: !!m.pending,
    failed: !!m.failed,
  };
}

/**
 * Pull the messages array out of any of the envelope shapes the backend / axios
 * interceptor may hand us, then normalize + sort oldest-first (chat order).
 * @param {*} res
 * @returns {Array<object>}
 */
export function extractMessages(res) {
  let arr = [];
  if (Array.isArray(res)) arr = res;
  else if (Array.isArray(res?.data?.items)) arr = res.data.items;
  else if (Array.isArray(res?.data)) arr = res.data;
  else if (Array.isArray(res?.items)) arr = res.items;
  return arr.map(normalizeMessage).filter(Boolean).sort(sortByCreatedAsc);
}

/** Comparator: oldest message first, stable on equal timestamps. */
export function sortByCreatedAsc(a, b) {
  const ta = new Date(a.created_at).getTime() || 0;
  const tb = new Date(b.created_at).getTime() || 0;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * Merge server rows with any locally-appended (optimistic) rows, de-duped by id.
 * A confirmed server row always wins over a pending row with the same id. Kept
 * oldest-first.
 * @param {Array<object>} serverMsgs
 * @param {Array<object>} localMsgs
 * @returns {Array<object>}
 */
export function mergeMessages(serverMsgs = [], localMsgs = []) {
  const byId = new Map();
  for (const m of [...localMsgs, ...serverMsgs]) {
    const n = normalizeMessage(m);
    if (!n || !n.id) continue;
    const existing = byId.get(n.id);
    // Prefer the confirmed (non-pending) copy.
    if (!existing || (existing.pending && !n.pending)) byId.set(n.id, n);
  }
  return Array.from(byId.values()).sort(sortByCreatedAsc);
}

/**
 * Is this message authored by the current user? Compares stringified ids so a
 * numeric vs string id mismatch never mis-attributes a bubble.
 * @param {object} msg
 * @param {string|number} currentUserId
 * @returns {boolean}
 */
export function isMine(msg, currentUserId) {
  if (!msg || currentUserId == null) return false;
  return String(msg.user_id) === String(currentUserId);
}

/**
 * Format a timestamp as a short clock time (e.g. "3:07 PM"). Falls back to ''.
 * @param {string|number|Date} ts
 * @returns {string}
 */
export function formatMessageTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Human day label for a date-separator row: Today / Yesterday / e.g. "12 Jul".
 * @param {string|number|Date} ts
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function dayLabel(ts, now = new Date()) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * Turn an oldest-first message list into a flat render list with day-separator
 * rows injected whenever the calendar day changes. Separators have
 * { type: 'day', id, label }; messages have { type: 'msg', ...message }.
 * @param {Array<object>} messages
 * @param {Date} [now]
 * @returns {Array<object>}
 */
export function groupMessagesByDay(messages = [], now = new Date()) {
  const out = [];
  let lastLabel = null;
  for (const m of messages) {
    const label = dayLabel(m.created_at, now);
    if (label && label !== lastLabel) {
      out.push({ type: 'day', id: `day-${label}-${m.id}`, label });
      lastLabel = label;
    }
    out.push({ type: 'msg', ...m });
  }
  return out;
}

/** Build an optimistic message row for immediate append. */
export function makeOptimisticMessage({ body, userId, userName, outletId }) {
  return normalizeMessage({
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    outlet_id: outletId,
    user_id: userId,
    user_name: userName,
    body,
    created_at: new Date().toISOString(),
    pending: true,
  });
}

// ─── Query: poll the transcript ──────────────────────────────────────────────

export function useStaffMessages(limit = DEFAULT_LIMIT) {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: chatKey(outletId, limit),
    queryFn: async () => {
      const res = await api.get('/chat/messages', {
        params: { outlet_id: outletId, limit },
      });
      return res;
    },
    select: extractMessages,
    enabled: !!outletId,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 2000,
  });
}

// ─── Mutation: send with optimistic append ───────────────────────────────────

export function useSendMessage(user) {
  const qc = useQueryClient();
  const { outletId } = useOutlet();
  const key = chatKey(outletId);

  return useMutation({
    mutationFn: ({ body }) =>
      api.post('/chat/messages', { outlet_id: outletId, body }),
    onMutate: async ({ body }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      const optimistic = makeOptimisticMessage({
        body,
        userId: user?.id,
        userName: user?.full_name || user?.name || 'You',
        outletId,
      });
      // Cache holds the RAW envelope; select() normalizes on read. Append the
      // optimistic row as a normalized item so select() passes it through.
      qc.setQueryData(key, (old) => {
        const items = extractMessages(old);
        return { success: true, data: { items: [...items, optimistic] }, message: 'optimistic' };
      });
      return { prev, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back to the pre-send cache.
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ─── Realtime: native WS listener ────────────────────────────────────────────
// Mirrors useRealtimeOrders' /ws?token pattern. On CHAT_MESSAGE we refetch the
// transcript (rather than splice) so ordering + de-dup stay authoritative.

export function useStaffChatRealtime() {
  const qc = useQueryClient();
  const { outletId } = useOutlet();
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const unmounted = useRef(false);
  const appState = useRef(AppState.currentState);

  function clearReconnect() {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }

  function scheduleReconnect(connect) {
    if (unmounted.current) return;
    clearReconnect();
    const exp = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * Math.pow(2, reconnectAttempts.current));
    const delay = Math.min(MAX_RECONNECT_MS, exp + Math.random() * BASE_RECONNECT_MS);
    reconnectAttempts.current += 1;
    reconnectTimer.current = setTimeout(connect, delay);
  }

  useEffect(() => {
    unmounted.current = false;

    async function connect() {
      if (unmounted.current) return;
      if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;
      try {
        const token = await getAccessToken();
        if (!token) { scheduleReconnect(connect); return; }
        ws.current = new WebSocket(`${WS_URL}?token=${token}`);
        ws.current.onopen = () => { clearReconnect(); reconnectAttempts.current = 0; };
        ws.current.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'CHAT_MESSAGE') {
              qc.invalidateQueries({ queryKey: ['staff-chat', outletId] });
            }
          } catch (_) {}
        };
        ws.current.onclose = () => scheduleReconnect(connect);
        ws.current.onerror = () => { ws.current?.close(); };
      } catch (_) {
        scheduleReconnect(connect);
      }
    }

    connect();

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        reconnectAttempts.current = 0;
        clearReconnect();
        connect();
        // Refresh immediately on resume so we don't wait a poll cycle.
        qc.invalidateQueries({ queryKey: ['staff-chat', outletId] });
      }
      appState.current = next;
    });

    return () => {
      unmounted.current = true;
      clearReconnect();
      if (ws.current) {
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onclose = null;
        ws.current.onerror = null;
        ws.current.close();
        ws.current = null;
      }
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);
}
