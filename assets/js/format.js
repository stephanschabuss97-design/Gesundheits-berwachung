/**
 * MODULE: FORMAT HELPERS
 * intent: formatiert Werte und mappt Capture-Eintraege auf health_events
 * exports: formatDateTimeDE, calcMAP, toHealthEvents, isWeightOnly
 * notes: Logik unveraendert aus index.html extrahiert
 */

// SUBMODULE: formatDateTimeDE @internal - formatiert ISO-Zeitstempel fuer Arzt-Ansicht
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
  } catch (_) {
    return '\u2014';
  }
}

// SUBMODULE: calcMAP @internal - mittlerer Arteriendruck aus Sys/Dia
function calcMAP(sys, dia) {
  if (sys == null || dia == null) return null;
  return Number(dia) + (Number(sys) - Number(dia)) / 3;
}

// === Mapping: lokaler Erfassungseintrag -> 0..N health_events ===
// SUBMODULE: toHealthEvents @internal - mappt Capture-Eintrag auf health_events payloads
function toHealthEvents(entry) {
  const tsIso = entry.dateTime;
  const out = [];

  if (entry.context === 'Morgen' || entry.context === 'Abend') {
    const hasVitals =
      entry.sys != null || entry.dia != null || entry.pulse != null;
    if (hasVitals) {
      const payload = {};
      if (entry.sys != null) payload.sys = Number(entry.sys);
      if (entry.dia != null) payload.dia = Number(entry.dia);
      if (entry.pulse != null) payload.pulse = Number(entry.pulse);
      payload.ctx = entry.context;
      out.push({ ts: tsIso, type: 'bp', payload });
    }
  }

  if (entry.context === 'Tag') {
    const hasBody =
      entry.weight != null || entry.waist_cm != null;
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
    if (anyFlag) {
      out.push({ ts: tsIso, type: 'day_flags', payload: flags });
    }

    const note = (entry.notes || '').trim();
    if (note) {
      out.push({ ts: tsIso, type: 'note', payload: { text: note } });
    }
  }

  return out;
}

// SUBMODULE: isWeightOnly @internal - erkennt reine Gewichts-Eintraege
function isWeightOnly(entry) {
  const hasVitals = !!(entry?.sys || entry?.dia || entry?.pulse);
  return !hasVitals && entry?.weight != null;
}

