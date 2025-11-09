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

const callGlobal = (name, ...args) => {
  const fn = globalWindow?.[name];
  if (typeof fn === 'function') {
    return fn(...args);
  }
  return undefined;
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
        await callGlobal('updateEntry', entry.id, { remote_id: -1 });
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
        failed += 1;
        continue;
      }
      const json = await response.json();
      const firstId = json?.[0]?.id ?? null;
      if (firstId != null) {
        await callGlobal('updateEntry', entry.id, { remote_id: firstId });
        pushed += 1;
      } else {
        failed += 1;
      }
      await delay(50);
    } catch (err) {
      failed += 1;
      if (err?.status === 401 || err?.status === 403) {
        diag.add?.('[push] auth error, abbrechen');
        break;
      }
    }
  }

  return { pushed, failed };
}
