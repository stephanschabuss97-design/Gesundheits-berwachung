'use strict';
/**
 * MODULE: format.js
 * Description: Formatiert Messwerte, berechnet medizinisch plausible Kennzahlen und mappt Capture-Einträge auf Health-Events-Strukturen.
 * Submodules:
 *  - namespace init (AppModules.format)
 *  - toNumberOrNull (Helper)
 *  - formatDateTimeDE (Datumsformatierung)
 *  - calcMAP (mittlerer arterieller Druck)
 *  - toHealthEvents (Event-Mapping)
 *  - isWeightOnly (Eintragsklassifizierung)
 *  - formatApi export (AppModules.format + readonly globals)
 */

// SUBMODULE: namespace init @internal - initialisiert globales Format-Modul
(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: toNumberOrNull @internal - wandelt Eingaben in Zahl oder null um (NaN-safe)
  function toNumberOrNull(val) {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  }

 // SUBMODULE: formatDateTimeDE @public - formatiert ISO-Zeitstempel nach deutschem Schema (Europe/Vienna)
  function formatDateTimeDE(iso) {
    if (!iso) return '\u2014';
    try {
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return '\u2014';
      return new Intl.DateTimeFormat('de-AT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Vienna'
      }).format(dt);
    } catch (err) {
      console.error('[format:formatDateTimeDE] invalid date input:', err);
      return '\u2014';
    }
  }

// SUBMODULE: calcMAP @public - berechnet mittleren arteriellen Druck (MAP) mit Plausibilitätsprüfung
  function calcMAP(sys, dia) {
    const s = toNumberOrNull(sys);
    const d = toNumberOrNull(dia);
    if (s === null || d === null) return null;

    // Medizinische Plausibilitätsprüfung
    const valid =
      s > d &&
      s >= 50 &&
      s <= 300 &&
      d >= 30 &&
      d <= 200;

    if (!valid) return null;

    return d + (s - d) / 3;
  }

// SUBMODULE: toHealthEvents @public - mappt Capture-Eintrag auf Health-Event-Payloads für REST-Sync
  function toHealthEvents(entry) {
    if (!entry || typeof entry !== 'object') return [];

    const tsIso = entry.dateTime;
    const out = [];

    try {
      // Blutdruck & Puls
      if (entry.context === 'Morgen' || entry.context === 'Abend') {
        const hasVitals =
          entry.sys != null || entry.dia != null || entry.pulse != null;
        if (hasVitals) {
          const payload = {};
          const sys = toNumberOrNull(entry.sys);
          const dia = toNumberOrNull(entry.dia);
          const pulse = toNumberOrNull(entry.pulse);
          if (sys !== null) payload.sys = sys;
          if (dia !== null) payload.dia = dia;
          if (pulse !== null) payload.pulse = pulse;
          payload.ctx = entry.context;
          out.push({ ts: tsIso, type: 'bp', payload });
        }
      }

      // Körperwerte, Flags, Notizen
      if (entry.context === 'Tag') {
        const hasBody = entry.weight != null || entry.waist_cm != null;
        if (hasBody) {
          const payload = {};
          const weight = toNumberOrNull(entry.weight);
          const waist = toNumberOrNull(entry.waist_cm);
          const fat = toNumberOrNull(entry.fat_pct);
          const muscle = toNumberOrNull(entry.muscle_pct);
          if (weight !== null) payload.kg = weight;
          if (waist !== null) payload.cm = waist;
          if (fat !== null) payload.fat_pct = fat;
          if (muscle !== null) payload.muscle_pct = muscle;
          out.push({ ts: tsIso, type: 'body', payload });
        }

        const flags = {
          training: !!entry.training,
          sick: !!entry.sick,
          low_intake: !!entry.low_intake,
          salt_high: !!entry.salt_high,
          protein_high90: !!entry.protein_high90,
          valsartan_missed: !!entry.valsartan_missed,
          forxiga_missed: !!entry.forxiga_missed,
          nsar_taken: !!entry.nsar_taken
        };
        const anyFlag = Object.values(flags).some(Boolean);
        if (anyFlag) out.push({ ts: tsIso, type: 'day_flags', payload: flags });

        const note = (entry.notes || '').trim();
        if (note) out.push({ ts: tsIso, type: 'note', payload: { text: note } });
      }
    } catch (err) {
      console.error('[format:toHealthEvents] mapping failed:', err, entry);
    }

    return out;
  }

  // SUBMODULE: isWeightOnly @public - erkennt reine Gewichts-Einträge ohne Vitaldaten
  function isWeightOnly(entry) {
    if (!entry) return false;
    const hasVitals =
      entry.sys != null || entry.dia != null || entry.pulse != null;
    return !hasVitals && entry.weight != null;
  }

// SUBMODULE: formatApi export @internal - registriert Funktionen unter AppModules.format und setzt read-only globals
  const formatApi = { formatDateTimeDE, calcMAP, toHealthEvents, isWeightOnly };
  appModules.format = formatApi;

  const hasOwn = Object.hasOwn
    ? Object.hasOwn
    : (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

  Object.entries(formatApi).forEach(([key, value]) => {
    if (!hasOwn(global, key)) {
      Object.defineProperty(global, key, {
        value,
        writable: false,
        configurable: false,
        enumerable: false
      });
    }
  });
})(window);
