'use strict';
/**
 * MODULE: supabase/api/system-comments.js
 * Description: Schreibt und aktualisiert system_comment-Einträge (Trendpilot etc.) in der Tabelle health_events.
 */

import { baseUrlFromRest } from '../core/client.js';
import { fetchWithAuth } from '../core/http.js';
import { getUserId } from '../auth/core.js';
import { sbSelect } from './select.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

const getConf = (...args) => {
  const fn = globalWindow?.getConf;
  if (typeof fn !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(fn(...args));
  } catch (err) {
    return Promise.reject(err);
  }
};

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TABLE_NAME = 'health_events';

const defaultTextBySeverity = {
  warning: 'Trendpilot: leichter Aufwärtstrend – bitte beobachten.',
  critical: 'Trendpilot: deutlicher Anstieg – ärztliche Abklärung empfohlen.'
};

const ALLOWED_DOCTOR_STATUS = new Set(['none', 'planned', 'done']);

const resolveRestEndpoint = async () => {
  const restUrl = await getConf('webhookUrl');
  const base = baseUrlFromRest(restUrl);
  if (!base) {
    const err = new Error('system-comment: missing REST endpoint');
    err.status = 500;
    throw err;
  }
  return `${base}/rest/v1/${TABLE_NAME}`;
};

export async function upsertSystemCommentRemote({ day, severity, metric = 'bp', context = {}, text }) {
  if (!ISO_DAY_RE.test(day || '')) throw new Error('system-comment: invalid day');
  if (!severity) throw new Error('system-comment: severity required');
  const userId = await getUserId();
  if (!userId) throw new Error('system-comment: user not available');

  const endpoint = await resolveRestEndpoint();
  const existing = await loadExistingComment({ userId, day, metric });
  const built = buildPayload({ severity, metric, context, text, existing });

  if (existing) {
    return await patchSystemComment({
      endpoint,
      id: existing.id,
      payload: built.payload
    });
  }
  return await postSystemComment({
    endpoint,
    userId,
    day,
    payload: built.payload
  });
}

const buildPayload = ({ severity, metric, context = {}, text, existing }) => {
  const payloadContext = { ...(existing?.payload?.context || {}), ...context };
  if (typeof payloadContext.ack !== 'boolean') {
    payloadContext.ack = Boolean(existing?.payload?.context?.ack);
  }
  if (!payloadContext.doctorStatus) {
    payloadContext.doctorStatus = existing?.payload?.context?.doctorStatus || 'none';
  }
  return {
    payload: {
      metric,
      severity,
      text: text || defaultTextBySeverity[severity] || 'Trendpilot-Hinweis',
      context: payloadContext
    }
  };
};

const normalizeSystemCommentRow = (row = {}, fallbackMetric = 'bp') => {
  const payload = row.payload || {};
  const ctx = payload.context || {};
  return {
    id: row.id ?? null,
    day: row.day || null,
    ts: row.ts ?? null,
    ack: Boolean(ctx.ack),
    doctorStatus: ctx.doctorStatus || 'none',
    metric: payload.metric || fallbackMetric,
    severity: payload.severity || 'info',
    text: payload.text || '',
    context: ctx
  };
};

const loadExistingComment = async ({ userId, day, metric }) => {
  try {
    const rows = await sbSelect({
      table: TABLE_NAME,
      select: 'id,payload',
      filters: [
        ['user_id', `eq.${userId}`],
        ['type', 'eq.system_comment'],
        ['day', `eq.${day}`],
        ['payload->>metric', `eq.${metric}`]
      ],
      order: 'ts.desc',
      limit: 1
    });
    if (!Array.isArray(rows)) return null;
    const first = rows[0] || null;
    if (first) first.doctorStatus = first.payload?.context?.doctorStatus || 'none';
    return first;
  } catch (err) {
    diag.add?.(`[system-comment] loadExisting failed: ${err?.message || err}`);
    return null;
  }
};

export async function fetchSystemCommentsRange({
  from,
  to,
  metric = 'bp',
  limit,
  order = 'day.asc'
} = {}) {
  const userId = await getUserId();
  if (!userId) return [];
  const filters = [
    ['user_id', `eq.${userId}`],
    ['type', 'eq.system_comment']
  ];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to) filters.push(['day', `lte.${to}`]);
  if (metric) filters.push(['payload->>metric', `eq.${metric}`]);
  const rows = await sbSelect({
    table: TABLE_NAME,
    select: 'id,day,ts,payload',
    filters,
    order,
    ...(limit ? { limit: Number(limit) } : {})
  });
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeSystemCommentRow(row, metric));
}

const postSystemComment = async ({ endpoint, userId, day, payload }) => {
  const res = await fetchWithAuth(
    (headers) =>
      fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: userId,
          day,
          type: 'system_comment',
          payload
        })
      }),
    { tag: 'systemComment:post', maxAttempts: 2 }
  );
  if (!res.ok) {
    const msg = await safeErrorMessage(res);
    throw new Error(`system-comment insert failed ${res.status} ${msg}`);
  }
  const data = await res.json();
  return { id: data?.[0]?.id ?? null, mode: 'insert' };
};

const patchSystemComment = async ({ endpoint, id, payload }) => {
  const url = `${endpoint}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetchWithAuth(
    (headers) =>
      fetch(url, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload })
      }),
    { tag: 'systemComment:patch', maxAttempts: 2 }
  );
  if (!res.ok) {
    const msg = await safeErrorMessage(res);
    throw new Error(`system-comment patch failed ${res.status} ${msg}`);
  }
  return { id, mode: 'patch' };
};

export async function setSystemCommentAck({ id, ack = true }) {
  if (!id) throw new Error('system-comment ack: id required');
  const endpoint = await resolveRestEndpoint();
  const rows = await sbSelect({
    table: TABLE_NAME,
    select: 'payload',
    filters: [['id', `eq.${id}`]],
    limit: 1
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('system-comment ack: entry not found');
  const payload = row.payload || {};
  payload.context = { ...(payload.context || {}), ack: Boolean(ack) };
  await patchSystemComment({ endpoint, id, payload });
  return { id, mode: 'ack' };
}

export async function setSystemCommentDoctorStatus({ id, doctorStatus }) {
  if (!id) throw new Error('system-comment doctorStatus: id required');
  const normalized =
    typeof doctorStatus === 'string' && ALLOWED_DOCTOR_STATUS.has(doctorStatus) ? doctorStatus : null;
  if (!normalized) throw new Error('system-comment doctorStatus: invalid status');
  const endpoint = await resolveRestEndpoint();
  const rows = await sbSelect({
    table: TABLE_NAME,
    select: 'payload',
    filters: [['id', `eq.${id}`]],
    limit: 1
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('system-comment doctorStatus: entry not found');
  const payload = row.payload || {};
  payload.context = { ...(payload.context || {}), doctorStatus: normalized };
  await patchSystemComment({ endpoint, id, payload });
  return { id, mode: 'doctorStatus' };
}

const safeErrorMessage = async (res) => {
  try {
    const json = await res.clone().json();
    return json?.message || json?.details || '';
  } catch (_) {
    return '';
  }
};

