'use strict';
/**
 * MODULE: trendpilot/index.js
 * Description: Orchestriert Trendpilot-Analysen nach Abendmessungen (Severity, Dialog, system_comment).
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

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
  const fetchDailyOverview =
    global.fetchDailyOverview ||
    appModules.fetchDailyOverview ||
    appModules.vitals?.fetchDailyOverview;
  const supabaseApi = global.SupabaseAPI || appModules.supabase || {};
  const upsertSystemCommentRemote = supabaseApi.upsertSystemCommentRemote;

  const dependenciesReady =
    typeof buildTrendWindow === 'function' &&
    typeof calcLatestDelta === 'function' &&
    typeof classifyTrendDelta === 'function' &&
    TREND_PILOT_DEFAULTS &&
    typeof fetchDailyOverview === 'function' &&
    typeof upsertSystemCommentRemote === 'function';

  if (!dependenciesReady) {
    console.error(
      '[trendpilot] Missing dependencies: load trendpilot/data.js and Supabase API before trendpilot/index.js.'
    );
    return;
  }

  const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const config = appModules.config || {};
  const configFlag =
    typeof config.TREND_PILOT_ENABLED === 'boolean' ? config.TREND_PILOT_ENABLED : undefined;
  const globalFlag =
    typeof global.TREND_PILOT_ENABLED === 'boolean' ? global.TREND_PILOT_ENABLED : undefined;
  const TREND_PILOT_FLAG = Boolean(configFlag ?? globalFlag ?? false);

  function normalizeDayIso(value) {
    if (typeof value === 'string' && ISO_DAY_RE.test(value)) return value;
    return new Date().toISOString().slice(0, 10);
  }
  let lastStatus = null;

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
      await showSeverityDialog(severity, delta);
      await upsertSystemComment(normalizedDay, severity, delta);
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
    const days = await fetchDailyOverview(fromIso, end);
    return buildTrendWindow(days, TREND_PILOT_DEFAULTS);
  }

  function showSeverityDialog(severity, delta) {
    return new Promise((resolve) => {
      const doc = global.document;
      const deltaSys = Number.isFinite(delta?.deltaSys) ? Math.round(delta.deltaSys) : 'n/a';
      const deltaDia = Number.isFinite(delta?.deltaDia) ? Math.round(delta.deltaDia) : 'n/a';
      const text =
        severity === 'critical'
          ? 'Trendpilot: deutlicher Anstieg – ärztliche Abklärung empfohlen.'
          : 'Trendpilot: leichter Aufwärtstrend – bitte beobachten.';
      if (!doc || !doc.body) {
        toast(`${text} Δsys=${deltaSys} mmHg / Δdia=${deltaDia} mmHg`);
        resolve();
        return;
      }
      const overlay = doc.createElement('div');
      overlay.className = 'trendpilot-overlay';
      const card = doc.createElement('div');
      card.className = 'trendpilot-dialog';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      const msg = doc.createElement('div');
      const msgId = 'trendpilotDialogMessage';
      msg.id = msgId;
      msg.textContent = text;
      msg.style.marginBottom = '10px';
      card.setAttribute('aria-labelledby', msgId);
      const deltas = doc.createElement('div');
      deltas.textContent = `Δsys=${deltaSys} mmHg / Δdia=${deltaDia} mmHg`;
      deltas.style.marginBottom = '18px';
      deltas.style.opacity = '0.85';
      const btn = doc.createElement('button');
      btn.textContent = 'Okay';
      btn.type = 'button';
      btn.className = 'trendpilot-dialog-btn';
      const previousActive = doc.activeElement;
      const previousOverflow = doc.body.style.overflow;
      doc.body.style.overflow = 'hidden';
      const closeDialog = () => {
        doc.removeEventListener('keydown', onKeydown, true);
        doc.body.style.overflow = previousOverflow;
        overlay.remove();
        if (previousActive && typeof previousActive.focus === 'function' && doc.contains(previousActive)) {
          try {
            previousActive.focus();
          } catch (_) {
            /* ignore */
          }
        }
        resolve();
      };
      const onKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeDialog();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          btn.focus();
        }
      };
      doc.addEventListener('keydown', onKeydown, true);
      btn.addEventListener('click', closeDialog);
      card.append(msg, deltas, btn);
      overlay.appendChild(card);
      doc.body.appendChild(overlay);
      setTimeout(() => btn.focus(), 0);
    });
  }

  async function upsertSystemComment(dayIso, severity, delta) {
    const context = {
      window_days: TREND_PILOT_DEFAULTS.windowDays,
      delta_sys: Number.isFinite(delta?.deltaSys) ? delta.deltaSys : null,
      delta_dia: Number.isFinite(delta?.deltaDia) ? delta.deltaDia : null
    };
    try {
      await upsertSystemCommentRemote({
        day: dayIso,
        severity,
        metric: 'bp',
        context
      });
    } catch (err) {
      diag.add?.(`[trendpilot] system_comment failed: ${err?.message || err}`);
    }
  }

  const trendpilotApi = {
    getLastTrendpilotStatus: () => lastStatus,
    runTrendpilotAnalysis
  };

  appModules.trendpilot = Object.assign(appModules.trendpilot || {}, trendpilotApi);
  global.runTrendpilotAnalysis = runTrendpilotAnalysis;
})(typeof window !== 'undefined' ? window : globalThis);
