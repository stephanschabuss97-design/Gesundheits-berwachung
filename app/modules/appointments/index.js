'use strict';
/**
 * MODULE: appointments/index.js
 * Description: Termin-Panel mit Supabase-Anbindung (CRUD + Übersicht + Assistant-Snapshot)
 * Notes:
 *  - Nutzt appointments_v2 (Phase 4.2). Fällt bei fehlender Config auf lokale Anzeige zurück.
 *  - Exponiert getUpcoming() für Assistant-Header.
 */
(function initAppointmentsModule(global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  const doc = global.document;
  const diag = appModules.diag || global.diag || null;
  const log = (msg) => diag?.add?.(`[appointments] ${msg}`);

  const getSupabaseApi = () => appModules.supabase || {};

  const selectors = {
    panel: '#hubAppointmentsPanel',
    form: '#appointmentsForm',
    title: '#apptTitle',
    date: '#apptDate',
    time: '#apptTime',
    location: '#apptLocation',
    notes: '#apptNotes',
    repeat: '#apptRepeatRule',
    overviewBtn: '#appointmentsOverviewBtn',
    overview: '#appointmentsOverview',
    overviewSubtitle: '#appointmentsOverviewSubtitle',
    columns: '#appointmentsColumns',
  };

  const state = {
    items: [],
    syncing: false,
    loaded: false,
    syncPromise: null,
  };

  let refs = null;
  let initialized = false;
  const notifyChange = (reason = 'update') => {
    if (!doc) return;
    try {
      const evt = new CustomEvent('appointments:changed', { detail: { reason } });
      doc.dispatchEvent(evt);
    } catch (_) {
      // ignore
    }
  };

  const ensureRefs = () => {
    if (refs) return refs;
    const panel = doc?.querySelector(selectors.panel);
    if (!panel) return null;
    refs = {
      panel,
      form: panel.querySelector(selectors.form),
      title: panel.querySelector(selectors.title),
      date: panel.querySelector(selectors.date),
      time: panel.querySelector(selectors.time),
      location: panel.querySelector(selectors.location),
      notes: panel.querySelector(selectors.notes),
      repeat: panel.querySelector(selectors.repeat),
      overviewBtn: panel.querySelector(selectors.overviewBtn),
      overview: panel.querySelector(selectors.overview),
      overviewSubtitle: panel.querySelector(selectors.overviewSubtitle),
      columns: panel.querySelector(selectors.columns),
    };
    return refs;
  };

  const sanitize = (value = '') => String(value ?? '').trim();
  const pad2 = (num) => String(num).padStart(2, '0');

  const toDate = (dateStr, timeStr) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    if (timeStr) {
      const [h = 0, m = 0] = timeStr.split(':').map((val) => Number(val) || 0);
      date.setHours(h, m, 0, 0);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    return date;
  };

  const toIsoUtc = (dateStr, timeStr) => toDate(dateStr, timeStr).toISOString();

  const normalizeAppointment = (row) => {
    if (!row) return null;
    const start = row.start_at ? new Date(row.start_at) : null;
    const localDate = start
      ? new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
      : (row.date || '');
    const localTime = start ? `${pad2(start.getHours())}:${pad2(start.getMinutes())}` : (row.time || '');
    return {
      id: row.id,
      title: row.title || 'Unbenannter Termin',
      start_at: row.start_at || null,
      date: localDate,
      time: localTime,
      location: row.location || '',
      notes: row.notes || '',
      status: row.status || 'scheduled',
      repeatRule: row.repeat_rule || row.repeatRule || 'none',
      meta: row.meta || null,
    };
  };

  const formatDateDisplay = (iso) => {
    if (!iso) return '--';
    try {
      const dt = new Date(iso);
      return dt.toLocaleDateString('de-AT', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (_) {
      return iso;
    }
  };

  const renderOverview = () => {
    if (!refs?.columns) return;
    refs.columns.innerHTML = '';
    if (!state.items.length) {
      updateSubtitle();
      return;
    }
    state.items.forEach((appt) => {
      const card = doc.createElement('article');
      card.className = 'appointments-card';
      card.dataset.id = appt.id;
      card.innerHTML = `
        <header>
          <strong>${appt.title}</strong>
          <span class="appointments-meta">${formatDateDisplay(appt.start_at)} • ${appt.time || '--:--'}</span>
        </header>
        <p class="muted small">${appt.location || 'Ort folgt'}</p>
        ${appt.notes ? `<p class="muted small">${appt.notes}</p>` : ''}
        <div class="appointments-meta">
          Status: ${appt.status === 'done' ? 'Erledigt' : 'Geplant'}${
            appt.repeatRule !== 'none' ? ` • Wiederholen: ${appt.repeatRule}` : ''
          }
        </div>
        <div class="appointments-actions">
          <button class="btn ghost small" data-action="toggle" type="button">
            ${appt.status === 'done' ? 'Zurücksetzen' : 'Erledigt'}
          </button>
          <button class="btn ghost small" data-action="delete" type="button">Löschen</button>
        </div>
      `;
      refs.columns.appendChild(card);
    });
    updateSubtitle();
  };

  const updateSubtitle = () => {
    if (!refs?.overviewSubtitle) return;
    if (!state.items.length) {
      refs.overviewSubtitle.textContent = 'Noch keine Einträge.';
      return;
    }
    refs.overviewSubtitle.textContent = `${state.items.filter((item) => item.status !== 'done').length} offene Termine • Insgesamt ${state.items.length}`;
  };

  const setFormDisabled = (flag) => {
    if (!refs?.form) return;
    refs.form.querySelectorAll('input, textarea, select, button').forEach((node) => {
      node.disabled = !!flag;
    });
    refs.panel?.classList.toggle('is-loading', !!flag);
  };

  const requireSupabaseClient = async () => {
    const api = getSupabaseApi();
    const ensure = api?.ensureSupabaseClient;
    if (typeof ensure !== 'function') throw new Error('Supabase-Konfiguration fehlt');
    const client = await ensure();
    if (!client) throw new Error('Supabase Client nicht verfügbar');
    return client;
  };

  const syncAppointments = async ({ reason = 'manual' } = {}) => {
    if (state.syncing) return state.syncPromise;
    state.syncing = true;
    setFormDisabled(true);
    const promise = (async () => {
      try {
        const client = await requireSupabaseClient();
        const { data, error } = await client
          .from('appointments_v2')
          .select('id,title,start_at,location,notes,status,repeat_rule,meta')
          .order('start_at', { ascending: true });
        if (error) throw error;
        state.items = Array.isArray(data) ? data.map(normalizeAppointment).filter(Boolean) : [];
        state.loaded = true;
        renderOverview();
        log?.(`sync ok reason=${reason} items=${state.items.length}`);
        notifyChange('sync');
      } catch (err) {
        diag?.add?.(`[appointments] sync failed (${reason}) ${err.message || err}`);
      } finally {
        state.syncing = false;
        state.syncPromise = null;
        setFormDisabled(false);
      }
    })();
    state.syncPromise = promise;
    return promise;
  };

  const requireUserId = async () => {
    const api = getSupabaseApi();
    const fn = api?.getUserId;
    if (typeof fn !== 'function') throw new Error('Supabase userId fehlt');
    const uid = await fn();
    if (!uid) throw new Error('Kein Supabase-User angemeldet');
    return uid;
  };

  const insertAppointmentRemote = async (payload) => {
    const client = await requireSupabaseClient();
    const userId = await requireUserId();
    const { data, error } = await client
      .from('appointments_v2')
      .insert({ ...payload, user_id: userId })
      .select('id,title,start_at,location,notes,status,repeat_rule,meta')
      .single();
    if (error) throw error;
    return normalizeAppointment(data);
  };

  const updateAppointmentRemote = async (id, patch) => {
    const client = await requireSupabaseClient();
    const { data, error } = await client
      .from('appointments_v2')
      .update(patch)
      .eq('id', id)
      .select('id,title,start_at,location,notes,status,repeat_rule,meta')
      .single();
    if (error) throw error;
    return normalizeAppointment(data);
  };

  const deleteAppointmentRemote = async (id) => {
    const client = await requireSupabaseClient();
    const { error } = await client.from('appointments_v2').delete().eq('id', id);
    if (error) throw error;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!refs) return;
    const title = sanitize(refs.title?.value);
    const date = refs.date?.value;
    if (!title || !date) {
      log?.('Speichern abgebrochen (Titel/Datum fehlt)');
      return;
    }
    const iso = toIsoUtc(date, refs.time?.value);
    const payload = {
      title,
      start_at: iso,
      location: sanitize(refs.location?.value),
      notes: sanitize(refs.notes?.value),
      repeat_rule: refs.repeat?.value || 'none',
    };
    try {
      setFormDisabled(true);
      const inserted = await insertAppointmentRemote(payload);
      if (inserted) {
        state.items.push(inserted);
        state.items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        renderOverview();
        refs.form?.reset();
        if (refs.repeat) refs.repeat.value = 'none';
        log?.(`saved ${inserted.title}`);
        notifyChange('insert');
      }
    } catch (err) {
      diag?.add?.(`[appointments] save failed ${err.message || err}`);
    } finally {
      setFormDisabled(false);
    }
  };

  const handleCardAction = async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.appointments-card');
    if (!card) return;
    const id = card.dataset.id;
    const idx = state.items.findIndex((item) => item.id === id);
    if (idx === -1) return;
    const action = btn.dataset.action;
    btn.disabled = true;
    try {
      if (action === 'delete') {
        await deleteAppointmentRemote(id);
        state.items.splice(idx, 1);
        notifyChange('delete');
      } else if (action === 'toggle') {
        const nextStatus = state.items[idx].status === 'done' ? 'scheduled' : 'done';
        const updated = await updateAppointmentRemote(id, { status: nextStatus });
        if (updated) {
          state.items[idx] = updated;
          notifyChange('toggle');
        }
      }
      renderOverview();
    } catch (err) {
      diag?.add?.(`[appointments] action ${action} failed ${err.message || err}`);
    } finally {
      btn.disabled = false;
    }
  };

  const scrollToOverview = () => {
    refs?.overview?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const computeUpcomingFromState = (limit = 2) => {
    const now = Date.now();
    return state.items
      .filter((item) => item.status !== 'done')
      .map((item) => ({
        ...item,
        timestamp: item.start_at ? new Date(item.start_at).getTime() : toDate(item.date, item.time).getTime(),
      }))
      .filter((item) => !Number.isNaN(item.timestamp) && item.timestamp >= now)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date,
        time: item.time,
        location: item.location,
        repeatRule: item.repeatRule,
        status: item.status,
      }));
  };

  const getUpcoming = async (limit = 2, { reason = 'assistant' } = {}) => {
    if (!state.loaded && !state.syncing) {
      await syncAppointments({ reason });
    }
    return computeUpcomingFromState(limit);
  };

  const init = () => {
    if (initialized) return;
    const panelRefs = ensureRefs();
    if (!panelRefs) return;
    panelRefs.form?.addEventListener('submit', handleSubmit);
    panelRefs.overviewBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      scrollToOverview();
    });
    panelRefs.columns?.addEventListener('click', handleCardAction);
    initialized = true;
    log?.('module initialised');
    syncAppointments({ reason: 'init' });
    doc.addEventListener(
      'supabase:ready',
      () => {
        syncAppointments({ reason: 'supabase-ready' });
      },
      { once: true }
    );
  };

  appModules.appointments = {
    init,
    refresh: renderOverview,
    getUpcoming,
    sync: syncAppointments,
    getAll: () => state.items.slice(),
  };

  if (doc?.readyState === 'complete' || doc?.readyState === 'interactive') {
    init();
  } else {
    doc?.addEventListener('DOMContentLoaded', init, { once: true });
  }
})(window);
