'use strict';
/**
 * MODULE: supabase/api/notes.js
 * intent: Verwaltung und Synchronisierung von Notizen- und Tages-Flags-Einträgen über Supabase REST
 * exports: syncWebhook, patchDayFlags, appendNoteRemote, deleteRemote, deleteRemoteDay
 * version: 1.8.2
 * compat: ESM + Monolith (Hybrid)
 * notes:
 *   - Synchronisiert lokale "note" und "day_flags" Events mit dem Supabase-Backend
 *   - Nutzt Webhook-POST/PATCH-Fallbacks bei Konflikten oder Duplikaten
 *   - Integriert UI-Feedback (uiInfo/uiError) und lokale DB-Updates (updateEntry)
 *   - Unterstützt automatisches Entfernen alter Einträge per DELETE
 * author: System Integration Layer (M.I.D.A.S. v1.8)
 */

// SUBMODULE: imports @internal - Supabase Core- und Auth-Abhängigkeiten
import { fetchWithAuth } from '../core/http.js';
import { getUserId } from '../auth/core.js';
import { showLoginOverlay, hideLoginOverlay } from '../auth/ui.js';

// SUBMODULE: globals @internal - globale Hilfsfunktionen und Diagnose-Hooks
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

const uiInfo = (...args) => {
  const fn = globalWindow?.uiInfo;
  if (typeof fn === 'function') {
    return fn(...args);
  }
  return undefined;
};

const uiError = (...args) => {
  const fn = globalWindow?.uiError;
  if (typeof fn === 'function') {
    return fn(...args);
  }
  return undefined;
};

const updateEntry = (...args) => {
  const fn = globalWindow?.updateEntry;
  if (typeof fn !== 'function') return Promise.resolve(false);
  try {
    const result = fn(...args);
    return result instanceof Promise ? result : Promise.resolve(result);
  } catch (err) {
    return Promise.reject(err);
  }
};

const toHealthEvents = (entry) => {
  const fn = globalWindow?.toHealthEvents;
  if (typeof fn !== 'function') {
    throw new Error('toHealthEvents is not available');
  }
  return fn(entry);
};

const toggleLoginOverlay = (visible) => {
  try {
    return visible ? showLoginOverlay() : hideLoginOverlay();
  } catch (_) {
    return undefined;
  }
};

// SUBMODULE: syncWebhook @public - sendet lokale Einträge an Supabase (inkl. Fallback-Handling)
export async function syncWebhook(entry, localId) {
  const url = await getConf('webhookUrl');
  if (!url) {
    const err = new Error('syncWebhook: missing webhookUrl');
    err.status = 401;
    toggleLoginOverlay(true);
    throw err;
  }

  try {
    const uid = await getUserId();
    const events = toHealthEvents(entry);
    if (!events.length) {
      diag.add('Webhook: keine Events zu senden');
      return;
    }

    const payload = events.map((ev) => (uid ? { ...ev, user_id: uid } : ev));
    const res = await fetchWithAuth(
      (headers) => fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) }),
      { tag: 'webhook:post', maxAttempts: 2 }
    );

    if (!res.ok) {
      let details = '';
      try {
        const errJson = await res.clone().json();
        details = errJson?.message || errJson?.details || '';
      } catch (_) {
        /* plain text */
      }

// SUBMODULE: fallback-day_flags @internal - PATCH fallback für day_flags
      if (res.status === 409 || /duplicate|unique/i.test(details)) {
        const flagsEvent = events.find((ev) => ev.type === 'day_flags');
        try {
          if (flagsEvent && uid) {
            const dayIso = entry.date;
            await patchDayFlags({ user_id: uid, dayIso, flags: flagsEvent.payload });
            const others = events.filter((ev) => ev.type !== 'day_flags');
            if (others.length) {
              const res2 = await fetchWithAuth(
                (headers) =>
                  fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(others.map((ev) => ({ ...ev, user_id: uid })))
                  }),
                { tag: 'webhook:fallback', maxAttempts: 2 }
              );
              if (!res2.ok) throw new Error(`rest-post-failed-${res2.status}`);
            }
            uiInfo('Flags aktualisiert.');
            diag.add('Fallback: day_flags via PATCH');
            return;
          }
        } catch (errFallback) {
          diag.add?.(
            `[webhook] day_flags fallback failed uid=${uid || 'null'} day=${entry?.date || 'null'}: ${
              errFallback?.message || errFallback
            }`
          );
          console.error('Supabase notes fallback error (day_flags)', {
            uid,
            dayIso: entry?.date,
            error: errFallback
          });
        }

        // SUBMODULE: fallback-note @internal - PATCH fallback für note
        const noteEvent = events.find((ev) => ev.type === 'note');
        try {
          if (noteEvent && uid) {
            const dayIso = entry.date;
            const merged = await appendNoteRemote({ user_id: uid, dayIso, noteEvent: noteEvent });
            await updateEntry(localId, { remote_id: merged?.id ?? -1 });
            uiInfo('Kommentar aktualisiert.');
            diag.add('Fallback: note via PATCH');
            return;
          }
        } catch (errNoteFallback) {
          diag.add?.(
            `[webhook] note fallback failed uid=${uid || 'null'} day=${entry?.date || 'null'} localId=${
              localId ?? 'null'
            }: ${errNoteFallback?.message || errNoteFallback}`
          );
          console.error('Supabase notes fallback error (note patch)', {
            uid,
            dayIso: entry?.date,
            localId,
            error: errNoteFallback
          });
        }
      }

      if (res.status === 409 || /duplicate|unique/i.test(details)) {
        uiError('Es gibt bereits einen Eintrag fuer diesen Tag/Kontext.');
      } else if (res.status === 422 || /invalid|range|pflicht|check constraint/i.test(details)) {
        uiError('Eingaben ungueltig - bitte Wertebereiche/Pflichtfelder pruefen.');
      } else {
        uiError(`Speichern fehlgeschlagen (HTTP ${res.status}).`);
      }

      diag.add(`Webhook-Fehler ${res.status}: ${details || '-'}`);
      const err = new Error(`save-failed-${res.status}`);
      err.status = res.status;
      err.details = details;
      throw err;
    }

    const json = await res.json();
    const firstId = json?.[0]?.id ?? null;
    if (firstId != null) {
      await updateEntry(localId, { remote_id: firstId });
      uiInfo('Gespeichert.');
      diag.add(`Webhook: OK (${events.length} Event(s))`);
    } else {
      uiError('Unerwartete Antwort vom Server - kein Datensatz zurueckgegeben.');
    }
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      uiError('Bitte erneut anmelden, um weiter zu speichern.');
    } else {
      uiError('Netzwerkfehler beim Speichern. Bitte spaeter erneut versuchen.');
    }
    diag.add('Webhook: Netzwerkfehler');
    throw err;
  }
}

// SUBMODULE: patchDayFlags @public - aktualisiert day_flags eines bestimmten Tages
export async function patchDayFlags({ user_id, dayIso, flags }) {
  const url = await getConf('webhookUrl');
  if (!url || !user_id || !dayIso) {
    const err = new Error('patchDayFlags: missing params');
    err.status = 401;
    throw err;
  }

  const from = `${dayIso}T00:00:00Z`;
  const toNext = new Date(from);
  toNext.setUTCDate(toNext.getUTCDate() + 1);
  const toIso = toNext.toISOString().slice(0, 10);

  const query =
    `${url}?user_id=eq.${encodeURIComponent(user_id)}&type=eq.day_flags` +
    `&ts=gte.${encodeURIComponent(dayIso)}T00:00:00Z&ts=lt.${encodeURIComponent(toIso)}T00:00:00Z`;
  const res = await fetchWithAuth(
    (headers) =>
      fetch(query, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ payload: flags })
      }),
    { tag: 'flags:patch', maxAttempts: 2 }
  );
  if (!res.ok) {
    let details = '';
    try {
      const errJson = await res.json();
      details = errJson?.message || errJson?.details || '';
    } catch (_) {
      /* ignore */
    }
    throw new Error(`patch day_flags failed ${res.status} - ${details}`);
  }
  return await res.json();
}

// SUBMODULE: appendNoteRemote @public - hängt neue Text-Notiz an bestehenden Tageskommentar an
export async function appendNoteRemote(opts) {
  const { user_id, dayIso, noteEvent } = opts || {};
  const url = await getConf('webhookUrl');
  if (!url || !user_id || !dayIso) {
    const err = new Error('appendNoteRemote: missing params');
    err.status = 401;
    throw err;
  }

  const from = `${dayIso}T00:00:00Z`;
  const toNext = new Date(from);
  toNext.setUTCDate(toNext.getUTCDate() + 1);
  const toIso = toNext.toISOString().slice(0, 10);
  const baseQuery =
    `${url}?user_id=eq.${encodeURIComponent(user_id)}&type=eq.note` +
    `&ts=gte.${encodeURIComponent(dayIso)}T00:00:00Z&ts=lt.${encodeURIComponent(toIso)}T00:00:00Z`;

  const resGet = await fetchWithAuth(
    (headers) => fetch(baseQuery, { method: 'GET', headers }),
    { tag: 'note:get', maxAttempts: 2 }
  );
  if (!resGet.ok) throw new Error(`note-get-failed-${resGet.status}`);
  const rows = await resGet.json();
  const existing = Array.isArray(rows) && rows[0] ? rows[0] : null;

  const addition = (noteEvent?.payload?.text || '').trim();
  if (!addition) {
    return existing
      ? { id: existing.id, text: existing?.payload?.text || '' }
      : { id: null, text: '' };
  }

  const combineText = (prev, add) => {
    if (!prev) return add;
    return `${prev.trim()}\n${add}`.trim();
  };

  if (existing) {
    const combined = combineText(existing?.payload?.text || '', addition);
    const patchRes = await fetchWithAuth(
      (headers) =>
        fetch(`${url}?id=eq.${encodeURIComponent(existing.id)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ payload: { text: combined } })
        }),
      { tag: 'note:patch', maxAttempts: 2 }
    );
    if (!patchRes.ok) throw new Error(`note-patch-failed-${patchRes.status}`);
    const patched = await patchRes.json().catch(() => null);
    const patchedId = patched?.[0]?.id ?? existing.id;
    return { id: patchedId, text: combined };
  }

  const body = [{ ...noteEvent, user_id }];
  const postRes = await fetchWithAuth(
    (headers) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }),
    { tag: 'note:post', maxAttempts: 2 }
  );
  if (!postRes.ok) throw new Error(`note-post-failed-${postRes.status}`);
  const created = await postRes.json().catch(() => null);
  const newId = created?.[0]?.id ?? null;
  return { id: newId, text: addition };
}

// SUBMODULE: deleteRemote @public - löscht einzelnen Remote-Eintrag anhand ID
export async function deleteRemote(remoteId) {
  const url = await getConf('webhookUrl');
  if (!url || !remoteId) return { ok: false };
  const query = `${url}?id=eq.${encodeURIComponent(remoteId)}`;
  try {
    const res = await fetchWithAuth(
      (headers) => fetch(query, { method: 'DELETE', headers }),
      { tag: 'remote:delete', maxAttempts: 2 }
    );
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: err?.status ?? 0 };
  }
}

// SUBMODULE: deleteRemoteDay @public - löscht alle Remote-Einträge eines bestimmten Tages
export async function deleteRemoteDay(dateIso) {
  const url = await getConf('webhookUrl');
  if (!url) return { ok: false, status: 0 };

  const from = `${dateIso}T00:00:00Z`;
  const toNext = new Date(from);
  toNext.setUTCDate(toNext.getUTCDate() + 1);
  const toIso = toNext.toISOString().slice(0, 10);

  const query =
    `${url}?ts=gte.${encodeURIComponent(dateIso)}T00:00:00Z` +
    `&ts=lt.${encodeURIComponent(toIso)}T00:00:00Z`;
  try {
    const res = await fetchWithAuth(
      (headers) => fetch(query, { method: 'DELETE', headers }),
      { tag: 'remote:delete-day', maxAttempts: 2 }
    );
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: err?.status ?? 0 };
  }
}
