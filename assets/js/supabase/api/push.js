'use strict';
/**
 * MODULE: supabase/api/push.js
 * intent: pushes pending capture entries to Supabase webhooks
 * exports: pushPendingToRemote
 */

import { fetchWithAuth } from '../core/http.js';
import { getUserId } from '../auth/core.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;

const diag =
  globalWindow?.diag ||
  globalWindow?.AppModules?.diag ||
  globalWindow?.AppModules?.diagnostics ||
  { add() {} };

const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// Sentinel used to mark entries that had no events to push (prevents reprocessing loops).
const REMOTE_ID_NO_EVENTS = -1;

const callGlobal = (name, ...args) => {
  const fn = globalWindow?.[name];
  if (typeof fn === 'function') {
    return fn(...args);
  }
  return undefined;
};

const logPushError = (message, details) => {
  const msg = `[push] ${message}`;
  diag.add?.(details ? `${msg} ${details}` : msg);
  if (details instanceof Error) {
    console.error(msg, details);
  } else if (details) {
    console.error(msg, details);
  } else {
    console.error(msg);
  }
};

export async function pushPendingToRemote() {
  const url = await callGlobal('getConf', 'webhookUrl');
  if (!url) return { pushed: 0, failed: 0 };

  const allEntries = (await callGlobal('getAllEntries')) || [];
  const pending = allEntries.filter((entry) => !entry?.remote_id);

  let pushed = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      const uid = await getUserId();
      const events = callGlobal('toHealthEvents', entry) || [];
      if (!events.length) {
        await callGlobal('updateEntry', entry.id, { remote_id: REMOTE_ID_NO_EVENTS });
        continue;
      }
      const payload = uid ? events.map((ev) => ({ ...ev, user_id: uid })) : events;
      const response = await fetchWithAuth(
        (headers) =>
          fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }),
        { tag: 'pending:post', maxAttempts: 2 }
      );
      if (!response.ok) {
        let bodyText = '';
        try {
          bodyText = await response.text();
        } catch (bodyErr) {
          bodyText = `(body read failed: ${bodyErr?.message || bodyErr})`;
        }
        logPushError(
          `webhook failed entry=${entry?.id ?? '?'} status=${response.status} ${response.statusText || ''}`.trim(),
          bodyText
        );
        failed += 1;
        continue;
      }
      let json;
      try {
        json = await response.json();
      } catch (parseErr) {
        logPushError(
          `invalid webhook response (json parse) entry=${entry?.id ?? '?'} status=${response.status}`,
          parseErr
        );
        failed += 1;
        continue;
      }
      const firstId = json?.[0]?.id ?? null;
      const validId = typeof firstId === 'number' || typeof firstId === 'string' ? firstId : null;
      if (validId == null) {
        logPushError(
          `invalid webhook response payload entry=${entry?.id ?? '?'} status=${response.status}`,
          json
        );
        failed += 1;
        continue;
      }
      await callGlobal('updateEntry', entry.id, { remote_id: validId });
      pushed += 1;
      await delay(50);
    } catch (err) {
      failed += 1;
      logPushError(`push failed entry=${entry?.id ?? '?'}`, err);
      if (err?.status === 401 || err?.status === 403) {
        diag.add?.('[push] auth error, abbrechen');
        break;
      }
    }
  }

  return { pushed, failed };
}
