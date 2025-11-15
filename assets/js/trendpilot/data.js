'use strict';
/**
 * MODULE: trendpilot/data.js
 * Description: Aggregiert Blutdrucktage zu Trendfenstern und liefert Hysterese-/Baseline-Helfer für den Trendpilot.
 *
 * API:
 *  - computeDailyBpStats(days)
 *  - groupDailyStatsByWeek(dailyStats)
 *  - calcMovingBaseline(weeklyStats, span)
 *  - calcLatestDelta(weeklyStats, baselineSeries)
 *  - classifyTrendDelta(delta, thresholds)
 *  - applyHysteresis(sequence, config)
 *  - TREND_PILOT_DEFAULTS
 */

(function(global) {
  const AppModules = global.AppModules = global.AppModules || {};

  const TREND_PILOT_DEFAULTS = Object.freeze({
    windowDays: 180,
    minWeeks: 8,
    baselineWeeks: 12,
    hysteresisWeeks: { escalate: 2, relax: 2 },
    thresholds: {
      warning: { sys: 5, dia: 3 },
      critical: { sys: 10, dia: 6 }
    }
  });

  const ORDER = { info: 0, warning: 1, critical: 2 };

  const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

  const median = (list) => {
    const values = list.filter(isFiniteNumber).sort((a, b) => a - b);
    if (!values.length) return null;
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  };

  const toIsoDate = (input) => {
    if (!input) return null;
    const date = new Date(input);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  };

  const getIsoWeekInfo = (dateStr) => {
    const date = new Date(`${dateStr}T00:00:00Z`);
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    const weekKey = `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

    const start = new Date(date);
    start.setUTCDate(date.getUTCDate() - 3);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);

    return {
      weekKey,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10)
    };
  };

  const collectValues = (entry, field) => {
    const out = [];
    const morningVal = Number(entry?.morning?.[field]);
    if (isFiniteNumber(morningVal)) out.push(morningVal);
    const eveningVal = Number(entry?.evening?.[field]);
    if (isFiniteNumber(eveningVal)) out.push(eveningVal);
    return out;
  };

  function computeDailyBpStats(days = []) {
    return days
      .map((day) => {
        const date = toIsoDate(day.date);
        if (!date) return null;
        const sysValues = collectValues(day, 'sys');
        const diaValues = collectValues(day, 'dia');
        const validCount = Math.max(sysValues.length, diaValues.length);
        if (!validCount) return null;
        return {
          date,
          sysValues,
          diaValues,
          sysMean: sysValues.length ? sysValues.reduce((p, c) => p + c, 0) / sysValues.length : null,
          diaMean: diaValues.length ? diaValues.reduce((p, c) => p + c, 0) / diaValues.length : null,
          hasMorning: isFiniteNumber(day?.morning?.sys) || isFiniteNumber(day?.morning?.dia),
          hasEvening: isFiniteNumber(day?.evening?.sys) || isFiniteNumber(day?.evening?.dia)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function groupDailyStatsByWeek(dailyStats = []) {
    const buckets = new Map();
    dailyStats.forEach((day) => {
      const info = getIsoWeekInfo(day.date);
      if (!info) return;
      if (!buckets.has(info.weekKey)) {
        buckets.set(info.weekKey, {
          week: info.weekKey,
          startDate: info.startDate,
          endDate: info.endDate,
          days: [],
          sysValues: [],
          diaValues: []
        });
      }
      const bucket = buckets.get(info.weekKey);
      bucket.days.push(day);
      bucket.sysValues.push(...day.sysValues);
      bucket.diaValues.push(...day.diaValues);
    });
    return Array.from(buckets.values())
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((bucket) => ({
        week: bucket.week,
        startDate: bucket.startDate,
        endDate: bucket.endDate,
        pointCount: bucket.days.length,
        sysMedian: median(bucket.sysValues),
        diaMedian: median(bucket.diaValues)
      }));
  }

  function calcMovingBaseline(weeklyStats = [], span = TREND_PILOT_DEFAULTS.baselineWeeks) {
    const result = [];
    weeklyStats.forEach((week, idx) => {
      const start = Math.max(0, idx - span + 1);
      const slice = weeklyStats.slice(start, idx + 1);
      result.push({
        week: week.week,
        sys: median(slice.map((w) => w.sysMedian)),
        dia: median(slice.map((w) => w.diaMedian))
      });
    });
    return result;
  }

  function calcLatestDelta(weeklyStats = [], baselineStats = []) {
    if (!weeklyStats.length || !baselineStats.length) return { deltaSys: null, deltaDia: null };
    const latestWeek = weeklyStats[weeklyStats.length - 1];
    const baseline = baselineStats[baselineStats.length - 1];
    const deltaSys =
      isFiniteNumber(latestWeek.sysMedian) && isFiniteNumber(baseline.sys)
        ? latestWeek.sysMedian - baseline.sys
        : null;
    const deltaDia =
      isFiniteNumber(latestWeek.diaMedian) && isFiniteNumber(baseline.dia)
        ? latestWeek.diaMedian - baseline.dia
        : null;
    return { deltaSys, deltaDia };
  }

  function classifyTrendDelta(delta, thresholds = TREND_PILOT_DEFAULTS.thresholds) {
    const { deltaSys, deltaDia } = delta || {};
    if (
      (isFiniteNumber(deltaSys) && deltaSys >= thresholds.critical.sys) ||
      (isFiniteNumber(deltaDia) && deltaDia >= thresholds.critical.dia)
    ) {
      return 'critical';
    }
    if (
      (isFiniteNumber(deltaSys) && deltaSys >= thresholds.warning.sys) ||
      (isFiniteNumber(deltaDia) && deltaDia >= thresholds.warning.dia)
    ) {
      return 'warning';
    }
    return 'info';
  }

  function applyHysteresis(sequence = [], config = TREND_PILOT_DEFAULTS.hysteresisWeeks) {
    const escalateTarget = config?.escalate ?? 2;
    const relaxTarget = config?.relax ?? 2;
    let applied = 'info';
    let escalateRun = 0;
    let relaxRun = 0;

    return sequence.map((entry) => {
      const desired = entry?.severity || 'info';
      if (ORDER[desired] > ORDER[applied]) {
        escalateRun += 1;
        relaxRun = 0;
        if (escalateRun >= escalateTarget) {
          applied = desired;
          escalateRun = 0;
        }
      } else if (ORDER[desired] < ORDER[applied]) {
        relaxRun += 1;
        escalateRun = 0;
        if (relaxRun >= relaxTarget) {
          applied = desired;
          relaxRun = 0;
        }
      } else {
        escalateRun = 0;
        relaxRun = 0;
      }
      return { ...entry, appliedSeverity: applied };
    });
  }

  function buildTrendWindow(days = [], options = {}) {
    const cfg = {
      windowDays: options?.windowDays ?? TREND_PILOT_DEFAULTS.windowDays,
      minWeeks: options?.minWeeks ?? TREND_PILOT_DEFAULTS.minWeeks,
      baselineWeeks: options?.baselineWeeks ?? TREND_PILOT_DEFAULTS.baselineWeeks,
      hysteresisWeeks: {
        ...TREND_PILOT_DEFAULTS.hysteresisWeeks,
        ...(options?.hysteresisWeeks || {})
      },
      thresholds: {
        warning: {
          ...TREND_PILOT_DEFAULTS.thresholds.warning,
          ...(options?.thresholds?.warning || {})
        },
        critical: {
          ...TREND_PILOT_DEFAULTS.thresholds.critical,
          ...(options?.thresholds?.critical || {})
        }
      }
    };
    const cutoff = cfg.windowDays
      ? days.filter((entry) => {
          if (!entry?.date) return false;
          const targetTs = Date.parse(`${entry.date}T00:00:00`);
          if (!Number.isFinite(targetTs)) return false;
          const windowStart = Date.now() - cfg.windowDays * 86400000;
          return targetTs >= windowStart;
        })
      : days;
    const daily = computeDailyBpStats(cutoff);
    const weekly = groupDailyStatsByWeek(daily);
    const baseline = calcMovingBaseline(weekly, cfg.baselineWeeks);
    return { daily, weekly, baseline };
  }

  const trendpilotApi = {
    TREND_PILOT_DEFAULTS,
    computeDailyBpStats,
    groupDailyStatsByWeek,
    calcMovingBaseline,
    calcLatestDelta,
    classifyTrendDelta,
    applyHysteresis,
    buildTrendWindow
  };

  AppModules.trendpilot = Object.assign({}, AppModules.trendpilot, trendpilotApi);
})(typeof window !== 'undefined' ? window : globalThis);
