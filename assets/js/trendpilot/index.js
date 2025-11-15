'use strict';
/**
 * MODULE: trendpilot/index.js
 * Description: Orchestriert die Trendpilot-Analyse nach Abendmessungen: Severity ermitteln, Dialoge anzeigen, system_comments verwalten.
 *
 * Exports (AppModules.trendpilot):
 *  - runTrendpilotAnalysis(day)
 *  - getLastTrendpilotStatus()
 */

(function(global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

  const diag =
    global.diag ||
    appModules.diag ||
    appModules.diagnostics ||
    { add() {} };

  const toast = global.toast || appModules.ui?.toast || ((msg) => alert(msg));

  const tpData = appModules.trendpilot || {};
  const buildTrendWindow = tpData.buildTrendWindow;
  const calcLatestDelta = tpData.calcLatestDelta;
  const classifyTrendDelta = tpData.classifyTrendDelta;
  const TREND_PILOT_DEFAULTS = tpData.TREND_PILOT_DEFAULTS;
  const fetchDailyOverview =
    global.fetchDailyOverview ||
    appModules.fetchDailyOverview ||
    appModules.vitals?.fetchDailyOverview;

  const TREND_PILOT_FLAG = true;

  let lastStatus = null;

  const trendpilotApi = {
    getLastTrendpilotStatus: () => lastStatus,
    runTrendpilotAnalysis
  };

  appModules.trendpilot = Object.assign({}, appModules.trendpilot, trendpilotApi);
  global.runTrendpilotAnalysis = runTrendpilotAnalysis;

  if (!buildTrendWindow || !calcLatestDelta || !classifyTrendDelta || !TREND_PILOT_DEFAULTS || !fetchDailyOverview) {
    console.error(
      '[trendpilot] Missing dependencies: ensure trendpilot/data.js and fetchDailyOverview are loaded before trendpilot/index.js.'
    );
    return;
  }

  async function runTrendpilotAnalysis(dayIso) {
    if (!TREND_PILOT_FLAG) return { severity: 'info', reason: 'disabled' };
    try {
      const stats = await loadDailyStats(dayIso);
      if (stats.weekly.length < TREND_PILOT_DEFAULTS.minWeeks) {
        lastStatus = { severity: 'info', reason: 'not_enough_data' };
        toast('Trendpilot: Zu wenige Messwochen für Trendanalyse.');
        return lastStatus;
      }
      const delta = calcLatestDelta(stats.weekly, stats.baseline);
      const severity = classifyTrendDelta(delta);
      lastStatus = { severity, delta, day: dayIso };
      diag.add?.(`[trendpilot] severity=${severity} Δsys=${delta.deltaSys ?? 'n/a'} Δdia=${delta.deltaDia ?? 'n/a'}`);
      if (severity === 'info') {
        toast('Trend stabil. Weiter so!');
        return lastStatus;
      }
      await showSeverityDialog(severity, delta);
      await upsertSystemComment(dayIso, severity, delta);
      return lastStatus;
    } catch (err) {
      diag.add?.(`[trendpilot] analysis failed: ${err?.message || err}`);
      console.error('Trendpilot analysis failed', err);
      lastStatus = { severity: 'info', reason: 'error', delta: null, day: dayIso || null };
      return lastStatus;
    }
  }

  async function loadDailyStats(dayIso) {
    const end = dayIso || new Date().toISOString().slice(0, 10);
    const start = new Date(Date.parse(`${end}T00:00:00`));
    start.setUTCDate(start.getUTCDate() - TREND_PILOT_DEFAULTS.windowDays);
    const fromIso = start.toISOString().slice(0, 10);
    const days = await fetchDailyOverview(fromIso, end);
    return buildTrendWindow(days, TREND_PILOT_DEFAULTS);
  }

  async function showSeverityDialog(severity, delta) {
    const text =
      severity === 'critical'
        ? 'Trendpilot: deutlicher Anstieg – ärztliche Abklärung empfohlen.'
        : 'Trendpilot: leichter Aufwärtstrend – bitte beobachten.';
    alert(`${text}\nΔsys=${Math.round(delta.deltaSys ?? 0)} mmHg, Δdia=${Math.round(delta.deltaDia ?? 0)} mmHg`);
  }

  async function upsertSystemComment(dayIso, severity, delta) {
    // Placeholder: integrate Supabase system_comment helper
    diag.add?.(`[trendpilot] system_comment pending severity=${severity} day=${dayIso}`);
  }
})(typeof window !== 'undefined' ? window : globalThis);
