/** MODULE: supabase/api/vitals.js — extracted from supabase.js @v1.8.1 */

import { getUserId } from '../auth/core.js';
import { sbSelect } from './select.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;
const diag =
  (globalWindow?.diag ||
    globalWindow?.AppModules?.diag ||
    globalWindow?.AppModules?.diagnostics ||
    { add() {} });

const calcMAPValue = (sys, dia) => {
  const fn = globalWindow?.calcMAP;
  if (typeof fn !== 'function') {
    diag.add?.('[vitals] calcMAP not available on window');
    return null;
  }
  try {
    return fn(sys, dia);
  } catch (err) {
    diag.add?.(`[vitals] calcMAP threw: ${err?.message || err}`);
    console.warn('Supabase vitals calcMAP error', { sys, dia, error: err });
    return null;
  }
};

export async function loadBpFromView({ user_id, from, to }) {
  const filters = [['user_id', `eq.${user_id}`]];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to) filters.push(['day', `lte.${to}`]);
  return await sbSelect({
    table: 'v_events_bp',
    select: 'day,ctx,sys,dia,pulse',
    filters,
    order: 'day.asc'
  });
}

export async function loadBodyFromView({ user_id, from, to }) {
  const filters = [['user_id', `eq.${user_id}`]];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to) filters.push(['day', `lte.${to}`]);
  return await sbSelect({
    table: 'v_events_body',
    select: 'day,kg,cm,fat_pct,muscle_pct,fat_kg,muscle_kg',
    filters,
    order: 'day.asc'
  });
}

export async function loadFlagsFromView({ user_id, from, to }) {
  const filters = [['user_id', `eq.${user_id}`]];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to) filters.push(['day', `lte.${to}`]);
  return await sbSelect({
    table: 'v_events_day_flags',
    select:
      'day,training,sick,low_intake,salt_high,protein_high90,valsartan_missed,forxiga_missed,nsar_taken',
    filters,
    order: 'day.asc'
  });
}

const loadNotesLastPerDay = async ({ user_id, from, to }) => {
  const filters = [
    ['user_id', `eq.${user_id}`],
    ['type', 'eq.note']
  ];
  if (from) filters.push(['day', `gte.${from}`]);
  if (to) filters.push(['day', `lte.${to}`]);
  const rows = await sbSelect({
    table: 'health_events',
    select: 'day,ts,payload',
    filters,
    order: 'ts.asc'
  });
  const grouped = new Map();
  for (const row of rows) {
    const text = (row?.payload?.text || '').trim();
    if (!text) continue;
    if (!grouped.has(row.day)) grouped.set(row.day, []);
    grouped.get(row.day).push({ ts: row.ts, text });
  }
  const out = [];
  for (const [day, entries] of grouped.entries()) {
    entries.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const lastTs = entries.length ? entries[entries.length - 1].ts : null;
    out.push({ day, ts: lastTs, text: entries.map((entry) => entry.text).join(' ') });
  }
  return out;
};

const joinViewsToDaily = ({ bp, body, flags, notes = [] }) => {
  const days = new Map();
  const ensure = (day) => {
    let entry = days.get(day);
    if (!entry) {
      entry = {
        date: day,
        morning: { sys: null, dia: null, pulse: null, map: null },
        evening: { sys: null, dia: null, pulse: null, map: null },
        weight: null,
        waist_cm: null,
        fat_pct: null,
        muscle_pct: null,
        fat_kg: null,
        muscle_kg: null,
        notes: '',
        flags: {
          water_lt2: false,
          salt_gt5: false,
          protein_ge90: false,
          sick: false,
          meds: false,
          training: false
        },
        remoteIds: [],
        hasCloud: true
      };
      days.set(day, entry);
    }
    return entry;
  };

  for (const row of body) {
    const entry = ensure(row.day);
    if (row.kg != null) entry.weight = Number(row.kg);
    if (row.cm != null) entry.waist_cm = Number(row.cm);
    if (row.fat_pct != null) entry.fat_pct = Number(row.fat_pct);
    if (row.muscle_pct != null) entry.muscle_pct = Number(row.muscle_pct);
    if (row.fat_kg != null) entry.fat_kg = Number(row.fat_kg);
    if (row.muscle_kg != null) entry.muscle_kg = Number(row.muscle_kg);
  }

  for (const row of bp) {
    const entry = ensure(row.day);
    const block = row.ctx === 'Morgen' ? entry.morning : row.ctx === 'Abend' ? entry.evening : null;
    if (block) {
      if (row.sys != null) block.sys = Number(row.sys);
      if (row.dia != null) block.dia = Number(row.dia);
      if (row.pulse != null) block.pulse = Number(row.pulse);
      if (block.sys != null && block.dia != null) {
        let mapValue = null;
        try {
          mapValue = calcMAPValue(block.sys, block.dia);
        } catch (err) {
          // calcMAPValue should already guard, but keep this to be defensive
          diag.add?.(
            `[vitals] calcMAPValue error for day=${row.day} ctx=${row.ctx}: ${err?.message || err}`
          );
          console.warn('Supabase vitals map calculation failed', {
            day: row.day,
            ctx: row.ctx,
            error: err
          });
        }
        block.map = mapValue ?? null;
      }
    }
  }

  for (const row of flags) {
    const entry = ensure(row.day);
    entry.flags.training = !!row.training;
    entry.flags.sick = !!row.sick;
    entry.flags.water_lt2 = !!row.low_intake;
    entry.flags.salt_gt5 = !!row.salt_high;
    entry.flags.protein_ge90 = !!row.protein_high90;
    entry.flags.meds = !!(row.valsartan_missed || row.forxiga_missed || row.nsar_taken);
    entry.flags.valsartan_missed = !!row.valsartan_missed;
    entry.flags.forxiga_missed = !!row.forxiga_missed;
    entry.flags.nsar_taken = !!row.nsar_taken;
  }

  for (const note of notes) {
    const entry = ensure(note.day);
    entry.notes = note.text || '';
  }

  return Array.from(days.values()).sort((a, b) => b.date.localeCompare(a.date));
};

export async function fetchDailyOverview(fromIso, toIso) {
  const userId = await getUserId();
  if (!userId) return [];

  const [bp, body, flags, notes] = await Promise.all([
    loadBpFromView({ user_id: userId, from: fromIso, to: toIso }),
    loadBodyFromView({ user_id: userId, from: fromIso, to: toIso }),
    loadFlagsFromView({ user_id: userId, from: fromIso, to: toIso }),
    loadNotesLastPerDay({ user_id: userId, from: fromIso, to: toIso })
  ]);

  return joinViewsToDaily({ bp, body, flags, notes });
}
