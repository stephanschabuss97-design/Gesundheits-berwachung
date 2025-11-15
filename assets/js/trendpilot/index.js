'use strict';
/**
 * MODULE: trendpilot/index.js
 * Description: Orchestriert Trendpilot-Analysen nach Abendmessungen (Severity, Dialog, system_comment).
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  let trendpilotInitialized = false;
  let dependencyWarned = false;

  const getSupabaseApi = () => global.SupabaseAPI || global.AppModules?.supabase || {};

  const initTrendpilot = () => {
    if (trendpilotInitialized) return;
    trendpilotInitialized = true;

  const config = appModules.config || {};
  const configFlag =
    typeof config.TREND_PILOT_ENABLED === 'boolean' ? config.TREND_PILOT_ENABLED : undefined;
  const globalFlag =
    typeof global.TREND_PILOT_ENABLED === 'boolean' ? global.TREND_PILOT_ENABLED : undefined;
  const TREND_PILOT_FLAG = Boolean(configFlag ?? globalFlag ?? false);

  const diag =
    global.diag ||
    appModules.diag ||
    appModules.diagnostics ||
    { add() {} };

  const toast = global.toast || appModules.ui?.toast || ((msg) => console.info('[trendpilot]', msg));

  const stubApi = {
    getLastTrendpilotStatus: () => null,
    runTrendpilotAnalysis: () =>
      Promise.resolve({ severity: 'info', reason: 'dependencies_missing', delta: null, day: null })
  };
  appModules.trendpilot = Object.assign(appModules.trendpilot || {}, stubApi);
  global.runTrendpilotAnalysis = stubApi.runTrendpilotAnalysis;

  const tpData = appModules.trendpilot || {};
  const buildTrendWindow = tpData.buildTrendWindow;
  const calcLatestDelta = tpData.calcLatestDelta;
  const classifyTrendDelta = tpData.classifyTrendDelta;
  const TREND_PILOT_DEFAULTS = tpData.TREND_PILOT_DEFAULTS;
  const grabTrendpilotDeps = () => {
    const supabaseApi = getSupabaseApi();
    return {
      supabaseApi,
      fetchDailyOverview: supabaseApi.fetchDailyOverview || global.fetchDailyOverview,
      upsertSystemCommentRemote: supabaseApi.upsertSystemCommentRemote,
      setSystemCommentAck: supabaseApi.setSystemCommentAck,
      fetchSystemCommentsRange: supabaseApi.fetchSystemCommentsRange || global.fetchSystemCommentsRange
    };
  };

  if (!TREND_PILOT_FLAG) {
    trendpilotInitialized = true;
    dependencyWarned = false;
    return;
  }

  const {
    supabaseApi,
    fetchDailyOverview: fetchDailyOverviewFn,
    upsertSystemCommentRemote,
    setSystemCommentAck,
    fetchSystemCommentsRange
  } = grabTrendpilotDeps();

  const hasDependencies =
    typeof buildTrendWindow === 'function' &&
    typeof calcLatestDelta === 'function' &&
    typeof classifyTrendDelta === 'function' &&
    TREND_PILOT_DEFAULTS &&
    typeof fetchDailyOverviewFn === 'function' &&
    typeof upsertSystemCommentRemote === 'function' &&
    typeof setSystemCommentAck === 'function';

  if (!hasDependencies) {
    if (!dependencyWarned) {
      console.warn(
        '[trendpilot] Dependencies missing; waiting for Supabase/system comments to load.'
      );
      dependencyWarned = true;
    }
    setTimeout(() => {
      trendpilotInitialized = false;
      initTrendpilot();
    }, 250);
    return;
  }
  dependencyWarned = false;

  const ISO_DAY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  function normalizeDayIso(value) {
    const fallback = new Date().toISOString().slice(0, 10);
    if (typeof value !== 'string') return fallback;
    const match = ISO_DAY_RE.exec(value);
    if (!match) return fallback;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return match[0];
    }
    return fallback;
  }
  let lastStatus = null;
  let latestSystemComment = null;

  async function runTrendpilotAnalysis(dayIso) {
    const normalizedDay = normalizeDayIso(dayIso);
    if (!TREND_PILOT_FLAG) {
      lastStatus = { severity: 'info', reason: 'disabled', delta: null, day: normalizedDay };
      return lastStatus;
    }
    try {
      const stats = await loadDailyStats(normalizedDay);
      const weekly = Array.isArray(stats?.weekly) ? stats.weekly : [];
      const baseline = Array.isArray(stats?.baseline) ? stats.baseline : [];
      const minWeeks =
        Number.isInteger(TREND_PILOT_DEFAULTS.minWeeks) && TREND_PILOT_DEFAULTS.minWeeks > 0
          ? TREND_PILOT_DEFAULTS.minWeeks
          : 8;
      if (weekly.length < minWeeks) {
        lastStatus = { severity: 'info', reason: 'not_enough_data', delta: null, day: normalizedDay };
        toast('Trendpilot: Zu wenige Messwochen für Trendanalyse.');
        return lastStatus;
      }
      const delta = calcLatestDelta(weekly, baseline);
      const severity = classifyTrendDelta(delta);
      lastStatus = { severity, delta, day: normalizedDay };
      diag.add?.(
        `[trendpilot] severity=${severity} deltaSys=${delta?.deltaSys ?? 'n/a'} deltaDia=${delta?.deltaDia ?? 'n/a'}`
      );
      if (severity === 'info') {
        toast('Trendpilot: Trend stabil. Weiter so!');
        return lastStatus;
      }
      const record = await persistSystemComment(normalizedDay, severity, delta);
      const acknowledged = await showSeverityDialog(severity, delta);
      if (acknowledged) {
        await acknowledgeSystemComment(record?.id);
      }
      refreshLatestSystemComment({ silent: true }).catch(() => {});
      return lastStatus;
    } catch (err) {
      diag.add?.(`[trendpilot] analysis failed: ${err?.message || err}`);
      console.error('Trendpilot analysis failed', err);
      lastStatus = { severity: 'info', reason: 'error', delta: null, day: normalizedDay };
      return lastStatus;
    }
  }

  async function loadDailyStats(dayIso) {
    const end = normalizeDayIso(dayIso);
    const start = new Date(`${end}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (TREND_PILOT_DEFAULTS.windowDays || 180));
    const fromIso = start.toISOString().slice(0, 10);
    const timeoutMs = TREND_PILOT_DEFAULTS.fetchTimeoutMs || 6000;
    const days = await withTimeout(
      fetchDailyOverviewFn(fromIso, end),
      timeoutMs,
      'Trendpilot fetch timed out'
    );
    return buildTrendWindow(days, TREND_PILOT_DEFAULTS);
  }

  function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(message || 'Operation timed out'));
      }, timeoutMs);
      promise
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function showSeverityDialog(severity, delta) {
    return new Promise((resolve) => {
      const doc = global.document;
      const deltaSys = Number.isFinite(delta?.deltaSys) ? Math.round(delta.deltaSys) : 'n/a';
      const deltaDia = Number.isFinite(delta?.deltaDia) ? Math.round(delta.deltaDia) : 'n/a';
      const text =
        severity === 'critical'
          ? 'Trendpilot: deutlicher Anstieg - aerztliche Klaerung empfohlen.'
          : 'Trendpilot: leichter Aufwaertstrend - bitte beobachten.';
      if (!doc || !doc.body) {
        toast(`${text} · Δsys=${deltaSys} mmHg / Δdia=${deltaDia} mmHg`);
        resolve(false);
        return;
      }
      const overlay = doc.createElement('div');
      overlay.className = 'trendpilot-overlay';
      const card = doc.createElement('div');
      card.className = 'trendpilot-dialog';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      const msg = doc.createElement('div');
      msg.className = 'trendpilot-dialog-message';
      const msgId = 'trendpilotDialogMessage';
      msg.id = msgId;
      msg.textContent = text;
      card.setAttribute('aria-labelledby', msgId);
      const deltas = doc.createElement('div');
      deltas.className = 'trendpilot-dialog-deltas';
      deltas.textContent = `Δsys=${deltaSys} mmHg / Δdia=${deltaDia} mmHg`;
      const btn = doc.createElement('button');
      btn.textContent = 'Zur Kenntnis genommen';
      btn.type = 'button';
      btn.className = 'btn primary trendpilot-dialog-btn';
      const previousActive = doc.activeElement;
      const previousOverflow = doc.body.style.overflow;
      doc.body.classList.add('trendpilot-lock');
      let resolved = false;
      const closeDialog = (acknowledged) => {
        if (resolved) return;
        resolved = true;
        doc.removeEventListener('keydown', onKeydown, true);
        doc.body.classList.remove('trendpilot-lock');
        doc.body.style.overflow = previousOverflow;
        overlay.remove();
        if (previousActive && typeof previousActive.focus === 'function' && doc.contains(previousActive)) {
          try {
            previousActive.focus();
          } catch (_) {
            /* ignore */
          }
        }
        resolve(Boolean(acknowledged));
      };
      const confirmAndClose = () => closeDialog(true);
      const onKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          confirmAndClose();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          btn.focus();
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          confirmAndClose();
        }
      };
      doc.addEventListener('keydown', onKeydown, true);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) confirmAndClose();
      });
      card.addEventListener('click', (event) => event.stopPropagation());
      btn.addEventListener('click', confirmAndClose);
      card.append(msg, deltas, btn);
      overlay.appendChild(card);
      doc.body.appendChild(overlay);
      setTimeout(() => btn.focus(), 0);
    });
  }
  async function persistSystemComment(dayIso, severity, delta) {
    const context = {
      window_days: TREND_PILOT_DEFAULTS.windowDays,
      delta_sys: Number.isFinite(delta?.deltaSys) ? delta.deltaSys : null,
      delta_dia: Number.isFinite(delta?.deltaDia) ? delta.deltaDia : null
    };
    try {
      return await upsertSystemCommentRemote({
        day: dayIso,
        severity,
        metric: 'bp',
        context
      });
    } catch (err) {
      diag.add?.(`[trendpilot] system_comment failed: ${err?.message || err}`);
      return null;
    }
  }

  async function acknowledgeSystemComment(id) {
    if (!id) return;
    try {
      await setSystemCommentAck({ id, ack: true });
    } catch (err) {
      diag.add?.(`[trendpilot] system_comment ack failed: ${err?.message || err}`);
    }
  }

  function emitLatestTrendpilot(entry) {
    const doc = global.document;
    if (!doc || typeof doc.dispatchEvent !== 'function') return;
    try {
      doc.dispatchEvent(new CustomEvent('trendpilot:latest', { detail: { entry } }));
    } catch (_) {
      /* ignore */
    }
  }

  async function refreshLatestSystemComment({ silent = false } = {}) {
    const fetcher =
      (typeof fetchSystemCommentsRange === 'function' && fetchSystemCommentsRange) ||
      supabaseApi.fetchSystemCommentsRange;
    if (typeof fetcher !== 'function') {
      if (!silent) {
        diag.add?.('[trendpilot] fetchSystemCommentsRange not available');
      }
      return null;
    }
    try {
      const rows = await fetcher({ metric: 'bp', order: 'day.desc', limit: 1 });
      latestSystemComment = Array.isArray(rows) && rows.length ? rows[0] : null;
      emitLatestTrendpilot(latestSystemComment);
      return latestSystemComment;
    } catch (err) {
      diag.add?.(`[trendpilot] latest load failed: ${err?.message || err}`);
      return null;
    }
  }

  const trendpilotApi = {
    getLastTrendpilotStatus: () => lastStatus,
    runTrendpilotAnalysis,
    getLatestSystemComment: () => latestSystemComment,
    refreshLatestSystemComment
  };

  appModules.trendpilot = Object.assign(appModules.trendpilot || {}, trendpilotApi);
  global.runTrendpilotAnalysis = runTrendpilotAnalysis;
  refreshLatestSystemComment({ silent: true }).catch(() => {});
  };

  if (global.SupabaseAPI || appModules.supabase) {
    initTrendpilot();
  } else if (global.document) {
    const onReady = () => {
      global.document.removeEventListener('supabase:ready', onReady);
      initTrendpilot();
    };
    global.document.addEventListener('supabase:ready', onReady);
  }
})(typeof window !== 'undefined' ? window : globalThis);
