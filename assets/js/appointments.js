'use strict';
/**
 * MODULE: appointments
 * intent: CRUD & UI sync for doctor appointments (badge + summary mapping)
 * exports: refreshAppointments, handleAppointmentSave, handleAppointmentDone, bindAppointmentsPanel, setAppointmentBadge
 * compat: legacy globals + window.AppModules.appointments
 */

(function (global) {
  const config = global.AppModules?.config || global;
  const {
    APPOINTMENT_ROLES = [],
    APPOINTMENT_GRACE_MS = 0,
    appointmentsState = { data: Object.create(null), loading: false, loaded: false, next: null }
  } = config;

  const debounce = global.AppModules?.uiCore?.debounce || global.debounce;
  const formatDateTimeDE = global.formatDateTimeDE;
  const recordPerfStat = global.recordPerfStat || (() => {});
  const uiError = global.uiError || ((msg) => console.error('[appointments]', msg));
  const uiInfo = global.uiInfo || ((msg) => console.info('[appointments]', msg));
  const uiRestError =
    global.uiRestError ||
    ((status, details, fallback) => {
      console.error('[appointments] REST error', status, details || fallback);
    });
  const showLoginOverlay = global.showLoginOverlay || (() => {});
  const withBusy = global.withBusy || ((el, on) => (el.disabled = !!on));
  const diag = global.diag || { add() {} };
  const requireFn = (name) => {
    const fn = global[name];
    if (typeof fn !== 'function') {
      throw new Error(`[appointments] missing dependency: ${name}`);
    }
    return fn;
  };

  async function getAppointmentsEndpoint() {
    const rest = await requireFn('getConf')('webhookUrl');
    if (!rest) return null;
    const base = requireFn('baseUrlFromRest')(rest);
    if (!base) {
      const setConfigStatus = global.setConfigStatus;
      setConfigStatus?.('Bitte REST-Endpoint konfigurieren.', 'error');
      return null;
    }
    return { base };
  }

  function getAppointmentRoleLabel(code) {
    const role = APPOINTMENT_ROLES.find((r) => r.code === code);
    return role ? role.label : code || '';
  }

  const setAppointmentBadge = debounce(function (details) {
    const badge = document.getElementById('nextApptBadge');
    if (!badge) return;
    const startedAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
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
    return nextRole && nextIso ? { role: nextRole, dt: nextIso } : null;
  }

  function validateAppointmentInput({ date, time }) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: 'date' };
    }
    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return { ok: false, error: 'time' };
    }
    // Parse numeric parts and create a UTC Date to avoid local-timezone shifts.
    const dateParts = date.split('-').map((p) => Number(p));
    const timeParts = time.split(':').map((p) => Number(p));
    const [year, month, day] = dateParts;
    const [hour, minute] = timeParts;

    // Basic numeric validation
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return { ok: false, error: 'invalid' };
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return { ok: false, error: 'invalid' };
    }

    // Construct UTC date and verify components to reject overflowed dates like 2021-02-30
    const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    if (Number.isNaN(dt.getTime())) return { ok: false, error: 'invalid' };
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== (month - 1) ||
      dt.getUTCDate() !== day ||
      dt.getUTCHours() !== hour ||
      dt.getUTCMinutes() !== minute
    ) {
      return { ok: false, error: 'invalid' };
    }

    return { ok: true, iso: dt.toISOString() };
  }

  function resetAppointmentsUi() {
    APPOINTMENT_ROLES.forEach(({ code }) => {
      const nextEl = document.getElementById(`appt-${code}-next`);
      const lastEl = document.getElementById(`appt-${code}-last`);
      const doneBtn = document.getElementById(`appt-${code}-done`);
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
      const nextEl = document.getElementById(`appt-${code}-next`);
      const lastEl = document.getElementById(`appt-${code}-last`);
      const doneBtn = document.getElementById(`appt-${code}-done`);
      if (nextEl) nextEl.textContent = formatDateTimeDE(record.next);
      if (lastEl) lastEl.textContent = formatDateTimeDE(record.last);
      if (doneBtn) {
        const hasNext = !!record.next;
        doneBtn.disabled = !hasNext;
        doneBtn.dataset.hasNext = hasNext ? '1' : '0';
        doneBtn.hidden = !hasNext;
      }
    });
  }

  async function fetchAppointmentsSummary() {
    const rest = await requireFn('getConf')('webhookUrl');
    if (!rest) return null;
    const base = requireFn('baseUrlFromRest')(rest);
    if (!base) return null;

    const fetchJson = async (url) => {
      const res = await requireFn('fetchWithAuth')(
        (headers) => fetch(url.toString(), { headers }),
        { tag: 'appt:summary', maxAttempts: 2 }
      );
      if (res.status === 404) return [];
      if (!res.ok) {
        let details = '';
        try {
          const err = await res.json();
          details = err?.message || err?.details || '';
        } catch (_) {}
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

    const [scheduled, done] = await Promise.all([fetchJson(scheduledUrl), fetchJson(doneUrl)]);
    return { scheduled, done };
  }

  async function refreshAppointments() {
    if (appointmentsState.loading) return;
    appointmentsState.loading = true;
    try {
      const summaryRaw = await fetchAppointmentsSummary();
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
    } catch (err) {
      diag.add?.('appointments refresh error: ' + (err?.message || err));
      appointmentsState.data = Object.create(null);
      appointmentsState.loaded = false;
      resetAppointmentsUi();
    } finally {
      appointmentsState.loading = false;
    }
  }

  async function handleAppointmentSave(role) {
    const dateEl = document.getElementById(`appt-${role}-date`);
    const timeEl = document.getElementById(`appt-${role}-time`);
    const saveBtn = document.getElementById(`appt-${role}-save`);
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

    const hasScheduled =
      !!appointmentsState.data &&
      !!appointmentsState.data[role] &&
      !!appointmentsState.data[role].next;
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

      let saved = false;
      if (hasScheduled) {
        const res = await requireFn('fetchWithAuth')(
          (headers) => fetch(patchUrl.toString(), { method: 'PATCH', headers, body }),
          { tag: 'appt:patch', maxAttempts: 2 }
        );
        if (!res.ok) {
          let details = '';
          try {
            const err = await res.json();
            details = err?.message || err?.details || '';
          } catch (_) {}
          if (res.status === 400) {
            uiError('Bitte Datum/Uhrzeit pruefen (HH:MM).');
            timeEl.focus();
            return;
          }
          if (res.status !== 404) {
            const errPatch = new Error('appointments-patch-failed');
            errPatch.status = res.status;
            errPatch.details = details;
            throw errPatch;
          }
        } else {
          saved = true;
        }
      }

      if (!saved) {
        const uid = await requireFn('getUserId')();
        if (!uid) {
          const errAuth = new Error('appointments-user-missing');
          errAuth.status = 401;
          throw errAuth;
        }
        const postUrl = new URL(base + '/rest/v1/appointments');
        const payload = JSON.stringify([{ role, dt: iso, status: 'scheduled', user_id: uid }]);
        const resPost = await requireFn('fetchWithAuth')(
          (headers) => fetch(postUrl.toString(), { method: 'POST', headers, body: payload }),
          { tag: 'appt:post', maxAttempts: 2 }
        );
        if (resPost.status === 409) {
          uiError('Es existiert bereits ein geplanter Termin. Bitte aktualisieren.');
          return;
        }
        if (!resPost.ok) {
          let details = '';
          try {
            const err = await resPost.json();
            details = err?.message || err?.details || '';
          } catch (_) {}
          if (resPost.status === 400) {
            uiError('Bitte Datum/Uhrzeit pruefen (HH:MM).');
            timeEl.focus();
            return;
          }
          const errPost = new Error('appointments-post-failed');
          errPost.status = resPost.status;
          errPost.details = details;
          throw errPost;
        }
      }

      dateEl.value = '';
      timeEl.value = '';
      await refreshAppointments();
      uiInfo('Termin gespeichert.');
    } catch (e) {
      if (e?.status === 400) {
        uiError('Bitte Datum/Uhrzeit pruefen (HH:MM).');
        timeEl.focus();
      } else if (e?.status === 401 || e?.status === 403) {
        showLoginOverlay(true);
        uiError('Bitte erneut anmelden.');
      } else if (e?.status) {
        uiRestError(e.status, e.details || e.message);
        try {
          diag.add?.('appointments save error (' + role + '): ' + (e?.details || e?.message || e));
        } catch (logErr) {
          console.error('diag.add failed', logErr);
        }
      } else {
        uiError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
        try {
          diag.add?.('appointments save error (' + role + '): ' + (e?.message || e));
        } catch (logErr) {
          console.error('diag.add failed', logErr);
        }
      }
    } finally {
      withBusy(saveBtn, false);
    }
  }

  async function handleAppointmentDone(role) {
    const btn = document.getElementById(`appt-${role}-done`);
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

      const res = await requireFn('fetchWithAuth')(
        (headers) => fetch(url.toString(), { method: 'PATCH', headers, body }),
        { tag: 'appt:done', maxAttempts: 2 }
      );
      if (!res.ok) {
        let details = '';
        try {
          const err = await res.json();
          details = err?.message || err?.details || '';
        } catch (_) {}
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
        showLoginOverlay(true);
        uiError('Bitte erneut anmelden.');
      } else if (e?.status) {
        uiRestError(e.status, e.details || e.message, 'Termin konnte nicht abgeschlossen werden.');
        try {
          diag.add?.('appointments done error (' + role + '): ' + (e?.details || e?.message || e));
        } catch (logErr) {
          console.error('diag.add failed', logErr);
        }
      } else {
        uiError('Termin konnte nicht abgeschlossen werden.');
        try {
          diag.add?.('appointments done error (' + role + '): ' + (e?.message || e));
        } catch (logErr) {
          console.error('diag.add failed', logErr);
        }
      }
    } finally {
      withBusy(btn, false);
    }
  }

  function bindAppointmentsPanel() {
    APPOINTMENT_ROLES.forEach(({ code }) => {
      const saveBtn = document.getElementById(`appt-${code}-save`);
      const doneBtn = document.getElementById(`appt-${code}-done`);
      if (saveBtn) saveBtn.addEventListener('click', () => handleAppointmentSave(code));
      if (doneBtn) doneBtn.addEventListener('click', () => handleAppointmentDone(code));
    });
  }

  const appointmentsApi = {
    refreshAppointments,
    handleAppointmentSave,
    handleAppointmentDone,
    bindAppointmentsPanel,
    setAppointmentBadge,
    computeNextAppointment,
    validateAppointmentInput,
    applyAppointmentsUi,
    resetAppointmentsUi
  };

  global.AppModules = global.AppModules || {};
  global.AppModules.appointments = appointmentsApi;
  Object.assign(global, appointmentsApi);
})(typeof window !== 'undefined' ? window : globalThis);
