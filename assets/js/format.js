'use strict';
/**
 * MODULE: format
 * intent: Formatiert Werte und mappt Capture-Einträge auf health_events
 * exports: formatDateTimeDE, calcMAP, toHealthEvents, isWeightOnly
 * version: 1.1
 * compat: Hybrid (Monolith + window.AppModules)
 * notes: Logik unverändert, aber kapsuliert und vereinheitlicht
 */

(function (global) {
  const appModules = (global.AppModules = global.AppModules || {});

  // SUBMODULE: formatDateTimeDE @public - formatiert ISO-Zeitstempel für Arzt-Ansicht
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

  // SUBMODULE: calcMAP @public - mittlerer arterieller Druck aus Sys/Dia
  function calcMAP(sys, dia) {
    if (sys == null || dia == null) return null;
    return Number(dia) + (Number(sys) - Number(dia)) / 3;
  }

  // SUBMODULE: toHealthEvents @public - mappt Capture-Eintrag auf health_events-Payloads
  function toHealthEvents(entry) {
    if (!entry || typeof entry !== 'object') return [];

    const tsIso = entry.dateTime;
    const out = [];

    try {
      // Blutdruck & Puls
      if (entry.context === 'Morgen' || entry.context === 'Abend') {
        const hasVitals = entry.sys != null || entry.dia != null || entry.pulse != null;
        if (hasVitals) {
          const payload = {};
          if (entry.sys != null) payload.sys = Number(entry.sys);
          if (entry.dia != null) payload.dia = Number(entry.dia);
          if (entry.pulse != null) payload.pulse = Number(entry.pulse);
          payload.ctx = entry.context;
          out.push({ ts: tsIso, type: 'bp', payload });
        }
      }

      // Körperwerte, Flags, Notizen
      if (entry.context === 'Tag') {
        const hasBody = entry.weight != null || entry.waist_cm != null;
        if (hasBody) {
          const payload = {};
          if (entry.weight != null) payload.kg = Number(entry.weight);
          if (entry.waist_cm != null) payload.cm = Number(entry.waist_cm);
          if (entry.fat_pct != null) payload.fat_pct = Number(entry.fat_pct);
          if (entry.muscle_pct != null) payload.muscle_pct = Number(entry.muscle_pct);
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

  // SUBMODULE: isWeightOnly @public - erkennt reine Gewichts-Einträge
  function isWeightOnly(entry) {
    if (!entry) return false;
    const hasVitals = !!(entry.sys || entry.dia || entry.pulse);
    return !hasVitals && entry.weight != null;
  }

  // Exportfläche
  const formatApi = { formatDateTimeDE, calcMAP, toHealthEvents, isWeightOnly };
  appModules.format = formatApi;

  // Legacy read-only globals (mit modernem hasOwn)
  const hasOwn = Object.hasOwn
    ? Object.hasOwn
    : (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

  Object.entries(formatApi).forEach(([key, value]) => {
    if (!hasOwn(global, key)) {
      Object.defineProperty(global, key, {
        value,
        writable: false,
        configurable: true,
        enumerable: false
      });
    }
  });
})(window);
