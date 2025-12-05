'use strict';

const DEFAULTS = {
  saltLimit: 5,
  proteinMax: 110,
};

function calculateDiff(value, limit) {
  if (!Number.isFinite(value) || !Number.isFinite(limit)) return null;
  return limit - value;
}

function formatDiff(value, unit) {
  if (!Number.isFinite(value)) return null;
  const rounded = unit === 'g' ? value.toFixed(1) : value.toFixed(0);
  return `${rounded} ${unit}`;
}

function extractNextAppointment(appointments = []) {
  if (!Array.isArray(appointments) || appointments.length === 0) return null;
  return appointments
    .filter((appt) => appt && appt.start)
    .map((appt) => {
      const startDate = new Date(appt.start);
      return { ...appt, startDate };
    })
    .filter((appt) => !Number.isNaN(appt.startDate.getTime()))
    .sort((a, b) => a.startDate - b.startDate)[0];
}

export function generateDayPlan(snapshot = {}, options = {}) {
  const lines = [];
  const profile = snapshot.profile || {};
  const totals = snapshot.intake?.totals || {};

  const saltDiff = calculateDiff(
    totals.salt_g,
    Number.isFinite(profile.salt_limit_g) ? profile.salt_limit_g : DEFAULTS.saltLimit,
  );
  if (saltDiff !== null) {
    if (saltDiff > 0) {
      lines.push(`Für Salz bleiben dir heute noch ${formatDiff(saltDiff, 'g')} Luft.`);
    } else {
      lines.push(`Achte auf Salz – du liegst bereits ${formatDiff(Math.abs(saltDiff), 'g')} über deinem Limit.`);
    }
  }

  const proteinDiff = calculateDiff(
    totals.protein_g,
    Number.isFinite(profile.protein_target_max)
      ? profile.protein_target_max
      : DEFAULTS.proteinMax,
  );
  if (proteinDiff !== null) {
    if (proteinDiff > 0) {
      lines.push(`Protein: ${formatDiff(proteinDiff, 'g')} wären noch möglich.`);
    } else {
      lines.push('Protein-Ziel erreicht – zusätzliche Portionen sind optional.');
    }
  }

  const nextAppointment = extractNextAppointment(snapshot.appointments || []);
  if (nextAppointment?.label && nextAppointment.startDate) {
    const formatter =
      options.dateFormatter ||
      ((date) => {
        try {
          return new Intl.DateTimeFormat('de-AT', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }).format(date);
        } catch {
          return date.toLocaleString();
        }
      });
    lines.push(`Merker: ${nextAppointment.label} am ${formatter(nextAppointment.startDate)}.`);
  }

  if (!lines.length && snapshot.suggestion?.recommendation) {
    lines.push(snapshot.suggestion.recommendation);
  }

  return {
    lines,
    hasWarnings: lines.some((line) => /achte|übers|limit/i.test(line)),
  };
}

if (typeof window !== 'undefined') {
  window.AppModules = window.AppModules || {};
  window.AppModules.assistantDayPlan = {
    generateDayPlan,
  };
}

export default generateDayPlan;
