'use strict';
/**
 * MODULE: appointments
 * intent: CRUD und UI-Sync fuer Arzttermine inkl. Badge und Summary Mapping
 * exports: refreshAppointments, handleAppointmentSave, handleAppointmentDone, bindAppointmentsPanel, setAppointmentBadge, resetAppointmentsUi
 * compat: window.AppModules + Legacy Globals (refreshAppointments, handleAppointmentSave, handleAppointmentDone, bindAppointmentsPanel, setAppointmentBadge)
 */

(function (global) {
  const appModules = global.AppModules = global.AppModules || {};
  const configApi = appModules.config || {};
  const formatApi = appModules.format || {};
  const diagnosticsApi = appModules.diagnostics || global.diag || {};
  const dataLocalApi = appModules.dataLocal || {};
  const uiCoreApi = appModules.uiCore || {};

  const APPOINTMENT_ROLES = Array.isArray(configApi.APPOINTMENT_ROLES)
    ? configApi.APPOINTMENT_ROLES
    : Array.isArray(global.APPOINTMENT_ROLES)
      ? global.APPOINTMENT_ROLES
      : [];
  const APPOINTMENT_GRACE_MS = typeof configApi.APPOINTMENT_GRACE_MS === 'number'
    ? configApi.APPOINTMENT_GRACE_MS
    : typeof global.APPOINTMENT_GRACE_MS === 'number'
      ? global.APPOINTMENT_GRACE_MS
      : 5 * 60 * 1000;
  const appointmentsState = configApi.appointmentsState || global.appointmentsState || {
    data: Object.create(null),
    loading: false,
    loaded: false,
    next: null
  };

  const formatDateTimeDE = typeof formatApi.formatDateTimeDE === 'function'
    ? formatApi.formatDateTimeDE
    : typeof global.formatDateTimeDE === 'function'
      ? global.formatDateTimeDE
      : (iso) => {
          if (!iso) return '\u2014';
          try {
            return new Date(iso).toLocaleString('de-DE');
          } catch (_) {
            return iso;
          }
        };
  const recordPerfStat = typeof global.recordPerfStat === 'function'
    ? global.recordPerfStat
    : () => {};
  const debounce = typeof global.debounce === 'function'
    ? global.debounce
    : typeof uiCoreApi.debounce === 'function'
      ? uiCoreApi.debounce
      : createFallbackDebounce();
  const getConf = typeof dataLocalApi.getConf === 'function'
    ? dataLocalApi.getConf
    : global.getConf;
  if (typeof getConf !== 'function') {
    throw new Error('[appointments] getConf fehlt');
  }

  const diagAdd = typeof diagnosticsApi.add === 'function'
    ? diagnosticsApi.add.bind(diagnosticsApi)
    : null;
  const withBusy = typeof global.withBusy === 'function' ? global.withBusy : () => {};
  const uiError = typeof global.uiError === 'function' ? global.uiError : (msg) => console.error(msg);
  const uiInfo = typeof global.uiInfo === 'function' ? global.uiInfo : (msg) => console.info(msg);
  const uiRestError = typeof global.uiRestError === 'function'
    ? global.uiRestError
    : (status, details, fallback) => uiError(fallback || details || status);

  const createSupabaseProxy = (name, { optional = false } = {}) => (...args) => {
    const api = global.SupabaseAPI;
    const fn = api && api[name];
    if (typeof fn !== 'function') {
      if (optional) return undefined;
      throw new Error(`SupabaseAPI.${name} fehlt`);
    }
    return fn(...args);
  };

  const fetchWithAuth = createSupabaseProxy('fetchWithAuth');
  const baseUrlFromRest = createSupabaseProxy('baseUrlFromRest');
  const setConfigStatus = createSupabaseProxy('setConfigStatus', { optional: true });
  const showLoginOverlay = createSupabaseProxy('showLoginOverlay', { optional: true });

  const getConfSafe = (key) => getConf(key);
  const logDiag = (msg) => {
    if (!diagAdd) return;
    try { diagAdd(msg); } catch (_) {}
  };

  const setAppointmentBadge = debounce(function (details) {
    const badge = global.document?.getElementById('nextApptBadge');
    if (!badge) return;

    const startedAt = typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
      ? global.performance.now()
      : null;
    try {
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      badge.setAttribute('tabindex', '0');

      const role = details?.role || null;
      const dtIso = details?.dt || null;

      if (!role || !dtIso) {
        badge.textContent = 'Kein Termin geplant';
        badge.title = 'Kein Termin geplant';
        badge.setAttribute('aria-label', 'Kein Termin geplant');
        badge.dataset.role = '';
        badge.dataset.dt = '';
        return;
      }

      const label = getAppointmentRoleLabel(role);
      const formatted = formatDateTimeDE(dtIso);
      const text = `N\u00e4chster Arzttermin bei: ${label} am: ${formatted}`;
      badge.textContent = text;
      badge.title = `Arzttermin bei ${label} am ${formatted}`;
      badge.setAttribute('aria-label', text);
      badge.dataset.role = role;
      badge.dataset.dt = dtIso;
    } finally {
      recordPerfStat('header_appt', startedAt);
    }
  }, 160);

  async function getAppointmentsEndpoint() {
    const rest = await getConfSafe('webhookUrl');
    if (!rest) return null;
    const base = baseUrlFromRest(rest);
    if (!base) {
      setConfigStatus?.('Bitte REST-Endpoint konfigurieren.', 'error');
      return null;
    }
    return { base };
  }

  function getAppointmentRoleLabel(code) {
    const role = APPOINTMENT_ROLES.find((r) => r.code === code);
    return role ? role.label : code || '';
  }

  function computeNextAppointment(summary) {
    if (!summary) return null;
    let nextRole = null;
    let nextIso = null;
    let nextTs = Number.POSITIVE_INFINITY;
    const nowTs = Date.now();

    for (const { code } of APPOINTMENT_ROLES) {
      const nextCandidate = summary[code]?.next;
      if (!nextCandidate) continue;
      const ts = Date.parse(nextCandidate);
      if (!Number.isFinite(ts)) continue;
      if (ts < nowTs - APPOINTMENT_GRACE_MS) continue;
      if (ts < nextTs) {
        nextTs = ts;
        nextRole = code;
        nextIso = nextCandidate;
      }
    }

    if (!nextRole || !nextIso) return null;
    return { role: nextRole, dt: nextIso };
  }

  function validateAppointmentInput({ date, time }) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: 'date' };
    }
    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return { ok: false, error: 'time' };
    }
    const isoCandidate = `${date}T${time}:00`;
    const dt = new Date(isoCandidate);
    if (Number.isNaN(dt.getTime())) {
      return { ok: false, error: 'invalid' };
    }
    return { ok: true, iso: dt.toISOString() };
  }

  function resetAppointmentsUi() {
    APPOINTMENT_ROLES.forEach(({ code }) => {
      const nextEl = global.document?.getElementById(`appt-${code}-next`);
      const lastEl = global.document?.getElementById(`appt-${code}-last`);
      const doneBtn = global.document?.getElementById(`appt-${code}-done`);
      if (nextEl) nextEl.textContent = '\u2014';
      if (lastEl) lastEl.textContent = '\u2014';
      if (doneBtn) {
        doneBtn.disabled = true;
        doneBtn.dataset.hasNext = '0';
        doneBtn.hidden = true;
      }
    });
    appointmentsState.next = null;
    setAppointmentBadge();
  }

  function applyAppointmentsUi(summary) {
    APPOINTMENT_ROLES.forEach(({ code }) => {
      const record = summary && summary[code] ? summary[code] : { next: null, last: null };
      const nextEl = global.document?.getElementById(`appt-${code}-next`);
      const lastEl = global.document?.getElementById(`appt-${code}-last`);
      const doneBtn = global.document?.getElementById(`appt-${code}-done`);
      if (nextEl) nextEl.textContent = formatDateTimeDE(record.next);
      if (lastEl) lastEl.textContent = formatDateTimeDE(record.last);
      if (doneBtn) {
        doneBtn.disabled = !record.next;
        doneBtn.dataset.hasNext = record.next ? '1' : '0';
        doneBtn.hidden = !record.next;
      }
    });
  }

  async function fetchAppointmentsSummary({ signal } = {}) {
    const rest = await getConfSafe('webhookUrl');
    if (!rest) return null;
    const base = baseUrlFromRest(rest);
    if (!base) return null;

    const fetchJson = async (url) => {
      const res = await fetchWithAuth(
        (headers) => global.fetch(url.toString(), { headers, signal }),
        { tag: 'appt:summary', maxAttempts: 2 }
      );
      if (res.status === 404) return [];
      if (!res.ok) {
        let details = '';
        try { const err = await res.json(); details = err?.message || err?.details || ''; } catch (_) {}
        throw new Error(`appointments fetch failed ${res.status} ${details}`);
      }
      return res.json();
    };

    const scheduledUrl = new URL(`${base}/rest/v1/appointments`);
    scheduledUrl.searchParams.set('select', 'role,dt');
    scheduledUrl.searchParams.set('status', 'eq.scheduled');
    scheduledUrl.searchParams.set('order', 'dt.asc');

    const doneUrl = new URL(`${base}/rest/v1/appointments`);
    doneUrl.searchParams.set('select', 'role,dt');
    doneUrl.searchParams.set('status', 'eq.done');
    doneUrl.searchParams.set('order', 'dt.desc');

    const [scheduled, done] = await Promise.all([
      fetchJson(scheduledUrl),
      fetchJson(doneUrl)
    ]);
    return { scheduled, done };
  }

  async function refreshAppointments() {
    if (appointmentsState.loading) return;
    appointmentsState.loading = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = 10_000;
    let timeoutId = null;
    if (controller) {
      timeoutId = global.setTimeout(() => {
        logDiag('appointments refresh timeout (aborting request)');
        try { controller.abort(); } catch (_) {}
      }, timeoutMs);
    }
    try {
      const summaryRaw = await fetchAppointmentsSummary({ signal: controller?.signal });
      const scheduledList = Array.isArray(summaryRaw?.scheduled) ? summaryRaw.scheduled : [];
      const doneList = Array.isArray(summaryRaw?.done) ? summaryRaw.done : [];

      const scheduledMap = new Map();
      for (const item of scheduledList) {
        const role = item?.role;
        const dt = item?.dt;
        if (!role || !dt) continue;
        if (!scheduledMap.has(role)) {
          scheduledMap.set(role, item);
        }
      }

      const doneMap = new Map();
      for (const item of doneList) {
        const role = item?.role;
        const dt = item?.dt;
        if (!role || !dt) continue;
        if (!doneMap.has(role)) {
          doneMap.set(role, item);
        }
      }

      const summary = Object.create(null);
      const now = Date.now();

      APPOINTMENT_ROLES.forEach(({ code }) => {
        let nextIso = null;
        let lastIso = doneMap.get(code)?.dt ?? null;

        const scheduled = scheduledMap.get(code);
        if (scheduled?.dt) {
          const ts = Date.parse(scheduled.dt);
          if (Number.isFinite(ts)) {
            if (ts >= now - APPOINTMENT_GRACE_MS) {
              nextIso = scheduled.dt;
            } else if (!lastIso) {
              lastIso = scheduled.dt;
            }
          }
        }

        summary[code] = { next: nextIso, last: lastIso };
      });

      appointmentsState.data = summary;
      appointmentsState.loaded = true;
      applyAppointmentsUi(summary);
      const nextAppt = computeNextAppointment(summary);
      appointmentsState.next = nextAppt;
      setAppointmentBadge(nextAppt);
    } catch (e) {
      if (e?.name === 'AbortError') {
        logDiag('appointments refresh aborted (timeout or manual abort)');
      } else {
        logDiag('appointments refresh error: ' + (e?.message || e));
      }
      appointmentsState.data = Object.create(null);
      appointmentsState.loaded = false;
      resetAppointmentsUi();
    } finally {
      if (timeoutId) {
        global.clearTimeout(timeoutId);
      }
      appointmentsState.loading = false;
    }
  }

  async function handleAppointmentSave(role) {
    const dateEl = global.document?.getElementById(`appt-${role}-date`);
    const timeEl = global.document?.getElementById(`appt-${role}-time`);
    const saveBtn = global.document?.getElementById(`appt-${role}-save`);
    if (!dateEl || !timeEl || !saveBtn) return;

    const date = (dateEl.value || '').trim();
    const time = (timeEl.value || '').trim();
    const validation = validateAppointmentInput({ date, time });
    if (!validation.ok) {
      if (validation.error === 'date') {
        uiError('Bitte Datum waehlen.');
        dateEl.focus();
      } else if (validation.error === 'time') {
        uiError('Bitte Uhrzeit im Format HH:MM angeben.');
        timeEl.focus();
      } else {
        uiError('Bitte Datum/Uhrzeit pruefen.');
        timeEl.focus();
      }
      return;
    }

    const endpoint = await getAppointmentsEndpoint();
    const base = endpoint?.base || null;
    const iso = validation.iso;

    const hasScheduled = !!(appointmentsState.data && appointmentsState.data[role] && appointmentsState.data[role].next);
    const patchUrl = base ? new URL(base + '/rest/v1/appointments') : null;
    if (patchUrl) {
      patchUrl.searchParams.set('status', 'eq.scheduled');
      patchUrl.searchParams.set('role', 'eq.' + role);
    }

    const body = JSON.stringify({ dt: iso });
    withBusy(saveBtn, true);
    try {
      if (!base || !patchUrl) {
        const errMissing = new Error('appointments-endpoint-missing');
        errMissing.status = 401;
        throw errMissing;
      }
      const headersHandler = (headers) => {
        const opts = { method: hasScheduled ? 'PATCH' : 'POST', headers, body };
        const target = hasScheduled ? patchUrl : new URL(base + '/rest/v1/appointments');
        if (!hasScheduled) {
          target.searchParams.set('role', role);
          target.searchParams.set('status', 'scheduled');
        }
        return global.fetch(target.toString(), opts);
      };
      const res = await fetchWithAuth(headersHandler, {
        tag: hasScheduled ? 'appt:update' : 'appt:create',
        maxAttempts: 2
      });
      if (!res.ok) {
        let details = '';
        try { const err = await res.json(); details = err?.message || err?.details || ''; } catch (_) {}
        const errSave = new Error('appointments-save-failed');
        errSave.status = res.status;
        errSave.details = details;
        throw errSave;
      }
      await refreshAppointments();
      uiInfo('Termin gespeichert.');
    } catch (e) {
      if (e?.status === 400) {
        uiError('Bitte Datum/Uhrzeit pruefen (HH:MM).');
        timeEl.focus();
      } else if (e?.status === 401 || e?.status === 403) {
        showLoginOverlay?.(true);
        uiError('Bitte erneut anmelden.');
      } else if (e?.status) {
        uiRestError(e.status, e.details || e.message);
        logDiag('appointments save error (' + role + '): ' + (e?.details || e?.message || e));
      } else {
        uiError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
        logDiag('appointments save error (' + role + '): ' + (e?.message || e));
      }
    } finally {
      withBusy(saveBtn, false);
    }
  }

  async function handleAppointmentDone(role) {
    const btn = global.document?.getElementById(`appt-${role}-done`);
    if (!btn || btn.hidden || btn.disabled || btn.dataset.hasNext !== '1') return;

    const endpoint = await getAppointmentsEndpoint();
    const base = endpoint?.base || null;
    withBusy(btn, true);
    try {
      if (!base) {
        const errMissing = new Error('appointments-endpoint-missing');
        errMissing.status = 401;
        throw errMissing;
      }
      const url = new URL(base + '/rest/v1/appointments');
      url.searchParams.set('status', 'eq.scheduled');
      url.searchParams.set('role', 'eq.' + role);
      const body = JSON.stringify({ status: 'done' });

      const res = await fetchWithAuth(
        (headers) => global.fetch(url.toString(), { method: 'PATCH', headers, body }),
        { tag: 'appt:done', maxAttempts: 2 }
      );
      if (!res.ok) {
        let details = '';
        try { const err = await res.json(); details = err?.message || err?.details || ''; } catch (_) {}
        if (res.status === 404) {
          uiError('Kein geplanter Termin vorhanden.');
          await refreshAppointments();
          return;
        }
        const errDone = new Error('appointments-done-failed');
        errDone.status = res.status;
        errDone.details = details;
        throw errDone;
      }
      await refreshAppointments();
      uiInfo('Termin abgeschlossen.');
    } catch (e) {
      if (e?.status === 401 || e?.status === 403) {
        showLoginOverlay?.(true);
        uiError('Bitte erneut anmelden.');
      } else if (e?.status) {
        uiRestError(e.status, e.details || e.message, 'Termin konnte nicht abgeschlossen werden.');
        logDiag('appointments done error (' + role + '): ' + (e?.details || e?.message || e));
      } else {
        uiError('Termin konnte nicht abgeschlossen werden.');
        logDiag('appointments done error (' + role + '): ' + (e?.message || e));
      }
    } finally {
      withBusy(btn, false);
    }
  }

  function bindAppointmentsPanel() {
    const wrap = global.document?.getElementById('appointmentsWrap');
    if (!wrap) return;
    if (wrap.dataset.appointmentsBound === '1') return;

    const handler = (event) => {
      const btn = event.target?.closest('button');
      if (!btn || !wrap.contains(btn) || !btn.id) return;
      const match = btn.id.match(/^appt-([a-z]+)-(save|done)$/);
      if (!match) return;
      const [, role, action] = match;
      if (action === 'save') {
        handleAppointmentSave(role);
      } else if (action === 'done') {
        handleAppointmentDone(role);
      }
    };

    wrap.addEventListener('click', handler);
    wrap.dataset.appointmentsBound = '1';
  }

  const appointmentsApi = {
    refreshAppointments,
    handleAppointmentSave,
    handleAppointmentDone,
    bindAppointmentsPanel,
    setAppointmentBadge,
    resetAppointmentsUi
  };

  appModules.appointments = appointmentsApi;

  ['refreshAppointments', 'handleAppointmentSave', 'handleAppointmentDone', 'bindAppointmentsPanel', 'setAppointmentBadge', 'resetAppointmentsUi']
    .forEach((name) => {
      Object.defineProperty(global, name, {
        configurable: true,
        writable: true,
        value: appointmentsApi[name]
      });
    });

  function createFallbackDebounce() {
    return (fn, ms = 150) => {
      let timer = null;
      return (...args) => {
        if (timer) global.clearTimeout(timer);
        timer = global.setTimeout(() => {
          timer = null;
          fn(...args);
        }, ms);
      };
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
