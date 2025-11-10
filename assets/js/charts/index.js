'use strict';
/**
 * MODULE: app/charts/index.js
 * Description: Rendert SVG/Canvas-Charts für Blutdruck- und Körperdaten, inklusive KPI-Leiste, Tooltip-Logik und Flag-Overlays.
 * Submodules:
 *  - globals & helpers (Supabase-Fallbacks, FocusTrap, Konfiguration)
 *  - chartPanel controller (Panel-Lifecycle, Events, Tooltip-Handling)
 *  - chartPanel.getFiltered (Aggregation von Cloud-/Local-Daten)
 *  - chartPanel.draw (Rendering-Pipeline: Skalen, SVG-Layer, WHO-Ampel, Flags)
 *  - chartPanel.ensureKpiFields / layoutKpis (KPI-Struktur & WHO-Farbskala)
 *  - tooltip handling (Hover, Sticky, Accessibility)
 *  - body composition bars (Fett- & Muskelanteile)
 *  - appModules registration (global exposure im Namespace)
 */

// SUBMODULE: globals & helpers @internal - initialisiert global.AppModules, Supabase-Fallbacks und FocusTrap
(function(global){
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

/* Fallbacks nur, wenn extern nicht verfuegbar */
const safeEnsureSupabaseClient = async () => {
  try { if (typeof ensureSupabaseClient === "function") return await ensureSupabaseClient(); } catch(_) {}
  return null;
};
const safeGetConf = async (k) => {
  try { if (typeof getConf === "function") return await getConf(k); } catch(_) {}
  return null;
};

const getFocusTrap = () => {
  const trap = global.AppModules?.uiCore?.focusTrap || global.focusTrap || null;
  return trap;
};

// SUBMODULE: chartPanel controller @extract-candidate - steuert Panel-Lifecycle, Datenbeschaffung und Zeichnung
const chartPanel = {
  el: null,
  svg: null,
  legend: null,
  open: false,
  tip: null,
  tipSticky: false,
  hoverSeries: null,
  SHOW_BODY_COMP_BARS: true,

  // SUBMODULE: chartPanel.init @internal - richtet Panel, Tooltip und Event-Handler ein
  initialized: false,

  init() {
    if (this.initialized) return;
    this.el = $("#chart");
    this.svg = $("#chartSvg");
    this.legend = $("#chartLegend");

    // Panel initial nicht anzeigen
    if (this.el) this.el.style.display = "none";

    // Close + Metric-Select
    const closeBtn = $("#chartClose");
    if (closeBtn) closeBtn.addEventListener("click", () => this.hide());
    const metricSel = $("#metricSel");
    if (metricSel) metricSel.addEventListener("change", () => this.draw());

    // Tooltip (hover/click)
    const contentHost = this.el?.querySelector(".content") || this.el || document.body;
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.id = "chartTip";
    contentHost.style.position = "relative";
    contentHost.appendChild(tip);
    this.tip = tip;
    this.tipHideTimer = null;

    // ARIA Live-Region (nur Text, fuer Screenreader)
    const live = document.createElement("div");
    live.id = "chartAria";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("role", "status");
    Object.assign(live.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      padding: 0,
      border: 0,
      margin: "-1px",
      clip: "rect(0 0 0 0)",
      overflow: "hidden",
      whiteSpace: "nowrap",
    });
    contentHost.appendChild(live);
    this.live = live;

    // Interaktivitaet
    if (this.svg) {
      this.svg.addEventListener("pointermove", (e) => {
        if (this.tipSticky) return;
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit"));
        if (!(isPt || isHit)) { this.hideTip(); return; }
        const date = tgt.getAttribute("data-date") || "";
        const hasNote = !!(tgt.getAttribute("data-note"));
        const hasFlags = this.hasFlagsForDate?.(date);
        if (!(hasNote || hasFlags)) { this.hideTip(); return; }
        this.fillTipFromTarget(tgt);
        this.positionTip(e);
      });

      this.svg.addEventListener("pointerleave", () => {
        if (this.tipSticky) return;
        this.hideTip();
      });

      // Click/Tap: Tooltip toggeln (mobil-freundlich)
      this.svg.addEventListener("click", (e) => {
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit"));
        if (!(isPt || isHit)) { if (this.tipSticky) { this.tipSticky = false; this.hideTip(); } return; }
        const date = tgt.getAttribute("data-date") || "";
        const hasNote = !!(tgt.getAttribute("data-note"));
        const hasFlags = this.hasFlagsForDate?.(date);
        if (!(hasNote || hasFlags)) { if (this.tipSticky) { this.tipSticky = false; this.hideTip(); } return; }
        this.fillTipFromTarget(tgt);
        this.tipSticky = !this.tipSticky;
        this.positionTip(e);
      });

      // Keyboard: Enter/Space toggelt Tooltip, ESC schliesst
      this.svg.addEventListener("keydown", (e) => {
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit"));
        if (!(isPt || isHit)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const date = tgt.getAttribute("data-date") || "";
          const hasNote = !!(tgt.getAttribute("data-note"));
          const hasFlags = this.hasFlagsForDate?.(date);
          if (!(hasNote || hasFlags)) return;
          this.fillTipFromTarget(tgt);
          this.tipSticky = !this.tipSticky;
        } else if (e.key === "Escape") {
          this.tipSticky = false; this.hideTip();
        }
      });
    }

    // Redraw bei Resize/Orientation
    if (this.el) {
      const ro = new ResizeObserver(() => { if (this.open) this.draw(); });
      ro.observe(this.el);
      this._ro = ro;
    }
    window.addEventListener("orientationchange", () => {
      setTimeout(() => { if (this.open) this.draw(); }, 150);
    });

    // KPI-Box: Felder sicherstellen
    this.ensureKpiFields();
    this.initialized = true;
  },

  // SUBMODULE: chartPanel.toggle @internal - schaltet Chart-Panel an/aus inkl. Fokus
  toggle() {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  },

  // SUBMODULE: chartPanel.show @internal - oeffnet Panel und aktiviert focusTrap
  show() {
    this.open = true;
    if (this.el) {
      this.el.style.display = "flex";
      getFocusTrap()?.activate?.(this.el);
    }
  },

  // SUBMODULE: chartPanel.hide @internal - schliesst Panel, deaktiviert focusTrap und Tooltips
  hide() {
    this.open = false;
    if (this.el) {
      this.el.style.display = "none";
      getFocusTrap()?.deactivate?.();
    }
    this.tipSticky = false;
    this.hideTip();
  },
  // ----- Helpers -----
  // SUBMODULE: chartPanel.getFiltered @extract-candidate - aggregiert Cloud/Local Daten fuer Zeichnung
async getFiltered() {
  const from = $("#from")?.value;
  const to   = $("#to")?.value;

  // Wenn eingeloggt: Cloud nehmen (Events -> Daily), sonst fallback: lokale Entries
  if (await isLoggedIn()) {
    // gleiche Aggregation wie Arzt-Ansicht
    const days = await fetchDailyOverview(from, to);
    // Fuer die Chart-Logik bauen wir flache "entry"-aehnliche Objekte
    const flat = [];
    for (const d of days) {
      // Morgen
      if (d.morning.sys != null || d.morning.dia != null || d.morning.pulse != null) {
        const ts = Date.parse(d.date + "T07:00:00Z"); // Fix-Zeit am Tag
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Morgen",
          sys: d.morning.sys,
          dia: d.morning.dia,
          pulse: d.morning.pulse,
          weight: null,
          waist_cm: null,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: null,
          muscle_kg: null
        });
      }
      // Abend
      if (d.evening.sys != null || d.evening.dia != null || d.evening.pulse != null) {
        const ts = Date.parse(d.date + "T19:00:00Z");
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Abend",
          sys: d.evening.sys,
          dia: d.evening.dia,
          pulse: d.evening.pulse,
          weight: null,
          waist_cm: null,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: null,
          muscle_kg: null
        });
      }
      // Body (Gewicht/Bauch)
      if (d.weight != null || d.waist_cm != null) {
        const ts = Date.parse(d.date + "T12:00:00Z");
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Tag",
          sys: null, dia: null, pulse: null,
          weight: d.weight,
          waist_cm: d.waist_cm,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: d.fat_kg,
          muscle_kg: d.muscle_kg
        });
      }
    }
    // Ergaenze Tage mit ausschliesslich Flags (ohne BP/Body), damit Flags-Overlay immer angezeigt wird
    for (const d of days) {
      const hasFlags = !!(d?.flags?.training || d?.flags?.sick || d?.flags?.water_lt2 || d?.flags?.salt_gt5 || d?.flags?.protein_ge90 || d?.flags?.meds);
      if (!hasFlags) continue;
      const already = flat.some(e => e?.date === d.date);
      if (!already) {
        const ts = Date.parse(d.date + "T12:00:00Z");
        flat.push({
          date: d.date,
          dateTime: new Date(ts).toISOString(),
          ts,
          context: "Tag",
          sys: null, dia: null, pulse: null,
          weight: null,
          waist_cm: null,
          notes: d.notes || "",
          training: d.flags.training,
          low_intake: d.flags.water_lt2,
          sick: d.flags.sick,
          valsartan_missed: !!d.flags.valsartan_missed,
          forxiga_missed:   !!d.flags.forxiga_missed,
          nsar_taken:       !!d.flags.nsar_taken,
          salt_high: d.flags.salt_gt5,
          protein_high90: d.flags.protein_ge90,
          fat_kg: null,
          muscle_kg: null
        });
      }
    }
    return flat.sort((a,b) => (a.ts ?? Date.parse(a.dateTime)) - (b.ts ?? Date.parse(b.dateTime)));
  }

  // Fallback: lokal (wenn nicht eingeloggt)
  const entries = typeof getAllEntries === "function" ? await getAllEntries() : [];
  return entries
    .filter(e => {
      if (from && e.date < from) return false;
      if (to   && e.date > to)   return false;
      return true;
  })
    .sort((a,b) => (a.ts ?? Date.parse(a.dateTime)) - (b.ts ?? Date.parse(b.dateTime)));
},

  // Hoehe laden (Konfig oder Fallback 183 cm)
  // SUBMODULE: chartPanel.getHeightCm @internal - liest Nutzerkoerpergroesse aus Supabase/Lokal
  async getHeightCm() {
    // 1) Supabase-Profil
    const supa = await safeEnsureSupabaseClient();
    if (supa) {
      try {
        const { data, error } = await supa.from("user_profile").select("height_cm").single();
        if (!error && data?.height_cm) return Number(data.height_cm);
      } catch(_) {}
    }
    // 2) lokale Konfig
    const v = await safeGetConf("height_cm");
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    return 182;
  },

  // Tooltip
  hideTip() {
    if (this.tip) {
      this.tip.dataset.visible = "0";
      this.tip.style.opacity = "0";
      clearTimeout(this.tipHideTimer);
      this.tipHideTimer = setTimeout(() => {
        if (!this.tip || this.tip.dataset.visible === "1") return;
        this.tip.style.display = "none";
        this.tip.textContent = "";
      }, 160);
    }
    this.setHoverSeries(null);
  },
  // SUBMODULE: chartPanel.setHoverSeries @internal - hebt aktuelle Serie in Chart/Legende hervor
  setHoverSeries(seriesKey) {
    if (!this.svg && !this.legend) return;
    const nextKey = seriesKey || null;
    if (this.hoverSeries === nextKey) return;
    this.hoverSeries = nextKey;

    const svgNodes = this.svg ? Array.from(this.svg.querySelectorAll('[data-series]')) : [];
    const legendNodes = this.legend ? Array.from(this.legend.querySelectorAll('[data-series]')) : [];
    [...svgNodes, ...legendNodes].forEach(node => {
      node.classList.remove('is-hover', 'is-dim');
    });

    if (!nextKey) return;
    svgNodes.forEach(node => {
      const key = node.getAttribute('data-series');
      if (!key) return;
      node.classList.add(key === nextKey ? 'is-hover' : 'is-dim');
    });
    legendNodes.forEach(node => {
      const key = node.getAttribute('data-series');
      if (!key) return;
      node.classList.add(key === nextKey ? 'is-hover' : 'is-dim');
    });
  },
  // SUBMODULE: chartPanel.positionTip @internal - positioniert Tooltip relativ zum Cursor
  positionTip(e) {
    if (!this.tip || !this.el) return;
    const hostRect = (this.el.querySelector(".content") || this.el).getBoundingClientRect();
    const x = e.clientX - hostRect.left;
    const y = e.clientY - hostRect.top;
    this.tip.style.left = `${x + 10}px`;
    this.tip.style.top  = `${y + 10}px`;
    if (this.tip.dataset.visible !== "1") {
      this.tip.style.display = "block";
      this.tip.style.opacity = "0";
      requestAnimationFrame(() => {
        if (!this.tip) return;
        this.tip.dataset.visible = "1";
        this.tip.style.opacity = "1";
      });
    } else {
      this.tip.dataset.visible = "1";
      this.tip.style.display = "block";
      this.tip.style.opacity = "1";
    }
  },
  // SUBMODULE: chartPanel.fillTipFromTarget @internal - generiert Tooltip-Inhalt inkl. Flags
  fillTipFromTarget(tgt) {
    if (!this.tip) return;
    this.setHoverSeries(tgt?.getAttribute("data-series") || null);
    const note = tgt.getAttribute("data-note") || "";
    const date = tgt.getAttribute("data-date") || "";
    const ctx  = tgt.getAttribute("data-ctx")  || "";
    const flags = (typeof this.flagsByDate?.get === 'function') ? this.flagsByDate.get(date) : null;
    const items = [];
    if (flags) {
      if (flags.training)         items.push("Training");
      if (flags.sick)             items.push("Krank");
      if (flags.low_intake)       items.push("< 2 L Wasser");
      if (flags.salt_high)        items.push("> 5 g Salz");
      if (flags.protein_high90)   items.push("Protein  90 g");
      if (flags.valsartan_missed) items.push("Valsartan vergessen");
      if (flags.forxiga_missed)   items.push("Forxiga vergessen");
      if (flags.nsar_taken)       items.push("NSAR genommen");
      if (!flags.valsartan_missed && !flags.forxiga_missed && !flags.nsar_taken && flags.meds) items.push("Medikamente");
    }

    const parts = [];
    const hdr = (date || ctx) ? `<div class="chart-tip-header">${esc([date, ctx].filter(Boolean).join(" . "))}</div>` : "";
    if (hdr) parts.push(hdr);
    if (note) {
      const noteClass = items.length ? ' chart-tip-note--with-flags' : '';
      parts.push(`<div class="chart-tip-note${noteClass}">${esc(note)}</div>`);
    }
    if (items.length) {
      const lis = items.map(esc).map(t => `<li>${t}</li>`).join("");
      const flagsClass = note ? 'chart-tip-flags chart-tip-flags--tight' : 'chart-tip-flags';
      parts.push(`<div class="${flagsClass}"><strong>Flags:</strong><ul class="chart-tip-flags-list">${lis}</ul></div>`);
    }
    if (!parts.length) { this.hideTip(); return; }
    this.tip.innerHTML = parts.join("");
    this.tip.dataset.visible = "1";
    this.tip.style.display = "block";
    this.tip.style.opacity = "1";
    if (this.live) this.live.textContent = `${date || ''} ${ctx || ''} ${note ? 'Notiz vorhanden. ' : ''}${items.length ? 'Flags: ' + items.join(', ') : ''}`.trim();
  },

  /* ---------- KPI-Felder + WHO-Ampellogik ---------- */
  // SUBMODULE: chartPanel.ensureKpiFields @internal - stellt KPI-Marker im UI bereit
  ensureKpiFields() {
    const box = $("#chartAverages");
    if (!box) return;
    const need = [
      { k: "sys",  label: "Durchschnitt Sys: -" },
      { k: "dia",  label: "Durchschnitt Dia: -" },
      { k: "map",  label: "Durchschnitt MAP: -" },
      { k: "bmi",  label: "BMI (letzter): -" },
      { k: "whtr", label: "WHtR (letzter): -" },
    ];
    need.forEach((n) => {
      if (!box.querySelector(`[data-k="${n.k}"]`)) {
        const span = document.createElement("span");
        span.setAttribute("data-k", n.k);
        span.textContent = n.label;
        box.appendChild(span);
      }
    });
  },

  // WHO-Farben
  // SUBMODULE: chartPanel.kpiColorBMI @internal - mappt BMI auf WHO-Farben
  kpiColorBMI(v) {
    if (v == null) return "#9aa3af";        // unknown
    if (v < 18.5) return "#60a5fa";         // untergew.
    if (v < 25)   return "#10b981";         // normal
    if (v < 30)   return "#f59e0b";         // uebergew.
    return "#ef4444";                        // adipoes
  },
  // SUBMODULE: chartPanel.kpiColorWHtR @internal - mappt WHtR auf WHO-Farben
  kpiColorWHtR(v) {
    if (v == null) return "#9aa3af";
    if (v < 0.5)   return "#10b981";        // ok
    if (v <= 0.6)  return "#f59e0b";        // erhoeht
    return "#ef4444";                        // hoch
  },

  // Ein Punkt pro KPI, korrekt eingefaerbt; saubere Separatoren
  // SUBMODULE: chartPanel.layoutKpis @internal - zeichnet KPI-Dots/Sep dynamisch
  layoutKpis() {
    const box = $("#chartAverages");
    if (!box) return;

    // 1) Alle alten Deko-Elemente entfernen (auch statische .sep aus dem HTML!)
    [...box.querySelectorAll(".kpi-dot, .kpi-sep, .sep")].forEach(n => n.remove());

    // 2) Sichtbare KPI-Spans ermitteln (display != "none")
    const items = [...box.querySelectorAll('[data-k]')].filter(el => el.style.display !== "none");

    // 3) Pro Item farbigen Punkt einsetzen + exakt einen Separator zwischen Items
    const makeDot = (color) => {
      const d = document.createElement("span");
      d.className = "kpi-dot";
      Object.assign(d.style, {
        display: "inline-block",
        width: "9px", height: "9px",
        borderRadius: "50%",
        margin: "0 8px 0 12px",
        background: color,
        verticalAlign: "middle",
        boxShadow: "0 0 4px rgba(0,0,0,.35)"
      });
      return d;
    };
    const makeSep = () => {
      const s = document.createElement("span");
      s.className = "kpi-sep";
      s.textContent = "*";
      Object.assign(s.style, {
        color: "#6b7280",
        margin: "0 10px",
        userSelect: "none"
      });
      return s;
    };

    items.forEach((el, idx) => {
      let color = "#9aa3af";
      const k = el.getAttribute("data-k");

      // Wert aus Text extrahieren (erste Zahl im Text)
      const m = el.textContent.match(/([\d.]+)/);
      const v = m ? parseFloat(m[1]) : null;

      if (k === "bmi") {
        color = this.kpiColorBMI(Number.isFinite(v) ? v : null);
      } else if (k === "whtr") {
        color = this.kpiColorWHtR(Number.isFinite(v) ? v : null);
      } else {
        // BP-KPIs neutral blau
        color = "#60a5fa";
      }

      el.before(makeDot(color));
      if (idx < items.length - 1) el.after(makeSep());
    });

    box.style.display = items.length ? "inline-flex" : "none";
    box.style.alignItems = "center";
  },

  // ----- Zeichnen -----
  // SUBMODULE: chartPanel.draw @extract-candidate - berechnet Scales, Flags und rendert SVG Layer
  async draw() {
    const t0 = performance.now?.() ?? Date.now();
if (!(await isLoggedIn())) {
  if (this.svg) this.svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#9aa3af" font-size="14">Bitte anmelden</text>';
  if (this.legend) this.legend.innerHTML = "";
  return;
}
const metric = $("#metricSel")?.value || "bp";

    const data   = await this.getFiltered();

    // X-Basis
    const xsAll = data.map(e => e.ts ?? Date.parse(e.dateTime));
    let series = [];
    let barSeries = [];
    let X = xsAll;
    let pendingBodyHitsSvg = "";

    // KPI-Box
    const avgBox = $("#chartAverages");

    // Schwellen (nur BP)
    const TH_SYS = 130;
    const TH_DIA = 90;

    // Tagesstempel (UTC, 00:00)
    const toDayTs = (isoDate /* "YYYY-MM-DD" */) => {
      if (!isoDate) return NaN;
      const [y, m, d] = isoDate.split("-").map(Number);
      return Date.UTC(y, (m || 1) - 1, d || 1);
    };

    // Tageskommentare (erste Zeile)
    const notesByDate = new Map();
    for (const e of data) {
      const hasDayLike = e?.context === "Tag" || isWeightOnly(e);
      const txt = (e?.notes || "").trim();
      if (hasDayLike && txt) {
        const firstLine = txt.split(/\r?\n/)[0].trim();
        if (firstLine) notesByDate.set(e.date, firstLine);
      }
    }

    // Fuer BP benoetigen wir Meta je Punkt
    let meta = null;

    if (metric === "bp") {
      // Nur echte Messungen
      const mData = data.filter(
        e => (e.context === "Morgen" || e.context === "Abend") && (e.sys != null || e.dia != null)
      );

      // Meta
      meta = mData.map(e => ({
        date: e.date,
        ctx:  e.context,
        sys:  e.sys != null ? Number(e.sys) : null,
        dia:  e.dia != null ? Number(e.dia) : null,
        note: notesByDate.get(e.date) || "",
      }));

      // X auf Tage normalisieren
      const xsBP = mData.map(e => toDayTs(e.date));

      // Werte-Reihen (Index passend zu meta)
      const sysM = mData.map(e => (e.context === "Morgen" && e.sys != null) ? Number(e.sys) : null);
      const sysA = mData.map(e => (e.context === "Abend"  && e.sys != null) ? Number(e.sys) : null);
      const diaM = mData.map(e => (e.context === "Morgen" && e.dia != null) ? Number(e.dia) : null);
      const diaA = mData.map(e => (e.context === "Abend"  && e.dia != null) ? Number(e.dia) : null);

      // KPIs ( ueber alle Messungen)
      const avg = (arr) => {
        const v = arr.filter(x => x != null);
        return v.length ? v.reduce((p,c) => p + c, 0) / v.length : null;
      };
      const mapArr = mData.map(e =>
        e.sys != null && e.dia != null
          ? Number(e.dia) + (Number(e.sys) - Number(e.dia)) / 3
          : null
      );

      if (avgBox) {
        const avgSys = avg(mData.map(e => (e.sys != null ? Number(e.sys) : null)));
        const avgDia = avg(mData.map(e => (e.dia != null ? Number(e.dia) : null)));
        const avgMap = avg(mapArr);

        const f0 = (v) => (v == null ? "-" : Math.round(v).toString());

        // Zeige BP-KPIs, blende BMI/WHtR aus
        const sEl  = avgBox.querySelector('[data-k="sys"]');
        const dEl  = avgBox.querySelector('[data-k="dia"]');
        const mEl  = avgBox.querySelector('[data-k="map"]');
        const bmiEl  = avgBox.querySelector('[data-k="bmi"]');
        const whtrEl = avgBox.querySelector('[data-k="whtr"]');
        if (sEl)  { sEl.style.display  = ""; sEl.textContent  = "Durchschnitt Sys: " + f0(avgSys); }
        if (dEl)  { dEl.style.display  = ""; dEl.textContent  = "Durchschnitt Dia: " + f0(avgDia); }
        if (mEl)  { mEl.style.display  = ""; mEl.textContent  = "Durchschnitt MAP: " + f0(avgMap); }
        if (bmiEl)  bmiEl.style.display  = "none";
        if (whtrEl) whtrEl.style.display = "none";

        avgBox.style.display = (avgSys != null || avgDia != null || avgMap != null) ? "inline-flex" : "none";
        this.layoutKpis();
      }

      // Serien definieren
      series = [
        { key: "bp-sys-m", name: "Sys Morgens", values: sysM, color: "var(--chart-line-secondary)", type: "sys" },
        { key: "bp-sys-a", name: "Sys Abends",  values: sysA, color: "var(--chart-line-primary)", type: "sys" },
        { key: "bp-dia-m", name: "Dia Morgens", values: diaM, color: "var(--chart-line-tertiary, var(--chart-line-secondary))", type: "dia" },
        { key: "bp-dia-a", name: "Dia Abends",  values: diaA, color: "var(--chart-line-dia)", type: "dia" },
      ];

      X = xsBP; // wichtig
} else if (metric === "weight") {
  // Serien: Gewicht + Bauchumfang
  series = [
    {
      key: "body-weight",
      name: "Gewicht (kg)",
      values: data.map(e => e.weight != null ? Number(e.weight) : null),
      color: "var(--chart-line-weight)",
      type: "misc",
    },
    {
      key: "body-waist",
      name: "Bauchumfang (cm)",
      values: data.map(e => e.waist_cm != null ? Number(e.waist_cm) : null),
      color: "var(--chart-line-waist)",
      type: "misc",
    }
  ];

  // KPI-Leiste: BMI & WHtR aus dem LETZTEN verfuegbaren Wert
  if (avgBox) {
    // BP-KPIs ausblenden
    ["sys","dia","map"].forEach(k => {
      const el = avgBox.querySelector(`[data-k="${k}"]`);
      if (el) el.style.display = "none";
    });

    // letzten Weight/Bauchumfang finden (data ist aufsteigend sortiert)
    let lastWeight = null, lastWaist = null;
    for (let i = data.length - 1; i >= 0; i--) {
      if (lastWeight == null && data[i].weight   != null) lastWeight = Number(data[i].weight);
      if (lastWaist  == null && data[i].waist_cm != null) lastWaist  = Number(data[i].waist_cm);
      if (lastWeight != null && lastWaist != null) break;
    }

    const heightCm = await this.getHeightCm();
    const hM = heightCm > 0 ? heightCm / 100 : null;

    const bmi  = (lastWeight != null && hM)         ? lastWeight / (hM * hM) : null;
    const whtr = (lastWaist  != null && heightCm>0) ? lastWaist  / heightCm  : null;

    const bmiEl  = avgBox.querySelector('[data-k="bmi"]');
    const whtrEl = avgBox.querySelector('[data-k="whtr"]');

    if (bmiEl)  { bmiEl.textContent  = `BMI (letzter): ${bmi  == null ? "-" : bmi.toFixed(1)}`;  bmiEl.style.display  = ""; }
    if (whtrEl) { whtrEl.textContent = `WHtR (letzter): ${whtr == null ? "-" : whtr.toFixed(2)}`; whtrEl.style.display = ""; }

    avgBox.style.display = "inline-flex";
    this.layoutKpis();
  }

  const muscleKg = data.map(e => e.muscle_kg != null ? Number(e.muscle_kg) : null);
  const fatKg    = data.map(e => e.fat_kg    != null ? Number(e.fat_kg)    : null);
  barSeries = [
    { key: "body-muscle", name: "Muskelmasse (kg)", values: muscleKg, color: "var(--chart-bar-muscle)" },
    { key: "body-fat",    name: "Fettmasse (kg)",   values: fatKg,    color: "var(--chart-bar-fat)" },
  ];
}

  // --- Render-Prep ---
    if (this.svg) {
      this.svg.innerHTML = "";
      this.svg.classList.remove("chart-refresh");
      void this.svg.offsetWidth;
      this.svg.classList.add("chart-refresh");
    }
    if (this.legend) this.legend.innerHTML = "";
    if (!this.tipSticky) this.hideTip();

    // Wenn es Flags gibt, soll das Chart nicht fruehzeitig abbrechen
    const hasBarData = barSeries.some(s => s.values.some(v => v != null));
    const hasAnyFlagsData = (metric !== "weight") && Array.isArray(data) && data.some(e => !!(e?.training || e?.low_intake || e?.sick || e?.salt_high || e?.protein_high90 || e?.valsartan_missed || e?.forxiga_missed || e?.nsar_taken));
    const hasAny = series.some(s => s.values.some(v => v != null)) || hasBarData || hasAnyFlagsData;
    if (!hasAny) {
      if (this.svg) this.svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#9aa3af" font-size="14">Keine darstellbaren Werte</text>';
      return;
    }

    // Flag-Aggregation (Flags + Tooltips)
    let dayFlagsTmp = null;
    const flagsByDate = new Map();
    if (metric !== "weight") {
      dayFlagsTmp = new Map();
      for (const e of data) {
        if (!e?.date) continue;
        let rec = dayFlagsTmp.get(e.date);
        if (!rec) {
          rec = {
            training: false,
            badCount: 0,
            seen: { water:false, salt:false, protein:false, sick:false, meds:false },
          };
          dayFlagsTmp.set(e.date, rec);
        }
        if (e.training) rec.training = true;
        const meds = !!(e.valsartan_missed || e.forxiga_missed || e.nsar_taken);
        const flags = {
          water: !!e.low_intake,
          salt:  !!e.salt_high,
          protein: !!e.protein_high90,
          sick:  !!e.sick,
          meds,
        };
        for (const k of Object.keys(flags)) {
          if (flags[k] && !rec.seen[k]) { rec.seen[k] = true; rec.badCount++; }
        }

        let f = flagsByDate.get(e.date);
        if (!f) f = { training:false, sick:false, low_intake:false, salt_high:false, protein_high90:false, valsartan_missed:false, forxiga_missed:false, nsar_taken:false, meds:false };
        f.training = f.training || !!e.training;
        f.sick = f.sick || !!e.sick;
        f.low_intake = f.low_intake || !!e.low_intake;
        f.salt_high = f.salt_high || !!e.salt_high;
        f.protein_high90 = f.protein_high90 || !!e.protein_high90;
        f.valsartan_missed = f.valsartan_missed || !!e.valsartan_missed;
        f.forxiga_missed   = f.forxiga_missed   || !!e.forxiga_missed;
        f.nsar_taken       = f.nsar_taken       || !!e.nsar_taken;
        f.meds = f.meds || meds;
        flagsByDate.set(e.date, f);
      }
    }

    // Dynamische Groesse
    const bbox = this.svg?.getBoundingClientRect?.() || { width: 640, height: 280 };
    const W = Math.max(300, Math.floor(bbox.width  || 640));
    const H = Math.max(200, Math.floor(bbox.height || 280));
    if (this.svg) this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const PL = 48, PR = 16, PT = 12, PB = 28;
    const innerW = W - PL - PR, innerH = H - PT - PB;

    // === Flags -> X-Bereich erweitern (immer) + Lookup fuer Tooltip ===
    let flagTs = [];
    if (metric === "weight") {
      this.flagsByDate = new Map();
      this.hasFlagsForDate = () => false;
    } else {
      const activeFlags = dayFlagsTmp || new Map();
      flagTs = [...activeFlags.keys()].map(d => Date.parse(d + "T00:00:00Z"));
      this.flagsByDate = flagsByDate;
      this.hasFlagsForDate = (dayIso) => {
        if (!dayIso || !this.flagsByDate) return false;
        const f = this.flagsByDate.get(dayIso);
        if (!f) return false;
        return !!(f.training || f.sick || f.low_intake || f.salt_high || f.protein_high90 || f.valsartan_missed || f.forxiga_missed || f.nsar_taken || f.meds);
      };
    }

    // Skalen
    const xVals = X.filter(t => Number.isFinite(t));
    let xmin = Math.min(...xVals);
    let xmax = Math.max(...xVals);

    if (!Number.isFinite(xmin) || !Number.isFinite(xmax)) {
      // Fallback
      xmin = Date.now() - 7 * 864e5;
      xmax = Date.now();
    }

    // Union mit Flag-Tagen (immer)
    if (flagTs.length) {
      xmin = Math.min(xmin, Math.min(...flagTs));
      xmax = Math.max(xmax, Math.max(...flagTs));
    }

    // Padding (2%)
    const xPad = xmax > xmin ? (xmax - xmin) * 0.02 : 0;
    xmin -= xPad; xmax += xPad;

    const lineVals = series.flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
    const barVals  = metric === "weight"
      ? []
      : barSeries.flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
    let allY = [...lineVals, ...barVals];
    if (metric === "weight") {
      const weightValsOnly = series
        .filter(s => s.key === "body-weight" || s.key === "body-waist")
        .flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
      allY = weightValsOnly.length ? weightValsOnly : [75, 110];
    }
    if (!allY.length) allY = [0];
    let yminRaw = Math.min(...allY);
    let ymaxRaw = Math.max(...allY);
    const ensureSpan = (min, max, minSpan) => {
      if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
      if ((max - min) < minSpan) {
        const mid = (max + min) / 2;
        return [mid - minSpan / 2, mid + minSpan / 2];
      }
      return [min, max];
    };
    let yPad = 1;
    if (metric === "weight") {
      const baseMin = 75;
      const baseMax = 110;
      const belowBase = yminRaw < baseMin;
      const aboveBase = ymaxRaw > baseMax;
      if (!belowBase && !aboveBase) {
        yminRaw = baseMin;
        ymaxRaw = baseMax;
      } else {
        yminRaw = belowBase ? Math.min(yminRaw, baseMin) : baseMin;
        ymaxRaw = aboveBase ? Math.max(ymaxRaw, baseMax) : baseMax;
        [yminRaw, ymaxRaw] = ensureSpan(yminRaw, ymaxRaw, 6);
      }
      yPad = Math.max((ymaxRaw - yminRaw) * 0.08, 0.5);
    } else {
      [yminRaw, ymaxRaw] = ensureSpan(yminRaw, ymaxRaw, 2);
      yPad = Math.max((ymaxRaw - yminRaw) * 0.08, 1);
    }
    const y0 = yminRaw - yPad;
    const y1 = ymaxRaw + yPad;

    const x = (t) => PL + ((t - xmin) / Math.max(1, xmax - xmin)) * innerW;
    const y = (v) => PT + (1 - (v - y0) / Math.max(1, y1 - y0)) * innerH;

    const line = (x1,y1_,x2,y2,stroke,dash="") =>
      `<line x1="${x1}" y1="${y1_}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1" ${dash ? `stroke-dasharray="${dash}"` : ""} />`;
    const text = (tx,ty,str,anchor="end") =>
      `<text x="${tx}" y="${ty}" fill="#9aa3af" font-size="11" text-anchor="${anchor}">${esc(str)}</text>`;

    // Zielbereiche (BP)
    if (this.svg) {
    }
    if (this.svg && metric === "bp") {
      const band = (min, max, cls) => {
        const top = Math.min(y(min), y(max));
        const height = Math.abs(y(max) - y(min));
        return `<rect class="goal-band ${cls}" x="${PL}" y="${top.toFixed(1)}" width="${innerW.toFixed(1)}" height="${height.toFixed(1)}" />`;
      };
      const goalLayers =
        band(110, 130, "goal-sys") +
        band(70, 85, "goal-dia");
      this.svg.insertAdjacentHTML("beforeend", goalLayers);
    }

    // Grid + Labels
    let grid = "";
    const ticks = 9;
    for (let i=0; i<=ticks; i++) {
      const vv = y0 + (i * (y1 - y0)) / ticks;
      const yy = y(vv);
      grid += line(PL, yy, W-PR, yy, "#2a3140");
      grid += text(PL - 6, yy + 4, Math.round(vv).toString());
    }
    // vertikale Wochenlinien + Datum
    const week = 7 * 24 * 3600 * 1000;
    let start = xmin - (xmin % week) + week;
    for (let t = start; t < xmax; t += week) {
      const xx = x(t);
      grid += line(xx, PT, xx, H - PB, "#1b1f28", "3 3");
      const d = new Date(t);
      const lbl = `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.`;
      grid += text(xx, H - 8, lbl, "middle");
    }
    // Achsen
    grid += line(PL, PT, PL, H - PB, "#2b2f3a");
    grid += line(PL, H - PB, W - PR, H - PB, "#2b2f3a");

    // Schwellenlinien (BP)
    if (metric === "bp") {
      const ySys = y(TH_SYS);
      const yDia = y(TH_DIA);
      grid += line(PL, ySys, W - PR, ySys, "#ef4444", "6 4");
      grid += line(PL, yDia, W - PR, yDia, "#ef4444", "6 4");
grid += text(W - PR - 2, ySys + 4, "Sys 130", "end");
grid += text(W - PR - 2, yDia  + 4, "Dia 90",  "end");
    }

    if (this.svg) this.svg.insertAdjacentHTML("beforeend", grid);

    // === Flags Overlay (nur fuer BP) ===
    if (this.svg && metric !== "weight") {
      const dayFlags = dayFlagsTmp || new Map();

      const toDayTsLocal = (iso) => Date.parse(iso + "T00:00:00Z");
      const flaggedDays = [...dayFlags.keys()]
        .filter(d => {
          const r = dayFlags.get(d);
          return r && (r.training || r.badCount > 0);
        })
        .sort();

      if (flaggedDays.length) {
        const g = document.createElementNS("http://www.w3.org/2000/svg","g");
        g.setAttribute("class","flags");
        g.setAttribute("pointer-events","auto");
        g.setAttribute("aria-hidden","true");

        const uniqDays = [...new Set([...flaggedDays.map(d => toDayTsLocal(d)), ...X.filter(Boolean)])].sort((a,b)=>a-b);
        const dayXs = uniqDays.map(t => x(t));
        const minStep = dayXs.length > 1 ? Math.min(...dayXs.slice(1).map((v,i)=>v - dayXs[i])) : innerW;
        const bandW   = Math.max(10, Math.floor(minStep * 0.45));
        const yBottom = PT + innerH;
        const slotH   = innerH / 6; // 1 Training + bis zu 5 Bad

        for (const d of flaggedDays) {
          const t = toDayTsLocal(d);
          const cx = x(t), xLeft = Math.round(cx - bandW/2);
          const rec = dayFlags.get(d);
          let used = 0;

          // Training (gruen)
          if (rec.training) {
            const yTop = Math.round(yBottom - (used + 1) * slotH);
            const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
            r.setAttribute("x", xLeft); r.setAttribute("y", yTop);
            r.setAttribute("width", bandW); r.setAttribute("height", Math.ceil(slotH));
            r.setAttribute("fill", "#10b981"); r.setAttribute("fill-opacity","0.22");
            r.setAttribute("stroke", "#fff");  r.setAttribute("stroke-opacity","0.06");
            r.setAttribute("shape-rendering","crispEdges");
            g.appendChild(r);
            used++;
          }
          // Bad-Flags (rot gestapelt)
          for (let i=0; i<rec.badCount; i++) {
            const yTop = Math.round(yBottom - (used + 1) * slotH);
            const r = document.createElementNS("http://www.w3.org/2000/svg","rect");
            r.setAttribute("x", xLeft); r.setAttribute("y", yTop);
            r.setAttribute("width", bandW); r.setAttribute("height", Math.ceil(slotH));
            r.setAttribute("fill", "#ef4444"); r.setAttribute("fill-opacity","0.18");
            r.setAttribute("stroke", "#fff");  r.setAttribute("stroke-opacity","0.06");
            r.setAttribute("shape-rendering","crispEdges");
            g.appendChild(r);
            used++;
          }

          // Interaktiver Hit-Bereich pro Tag ueber alle Slots
          const totalSlots = used;
          if (totalSlots > 0) {
            const yTopAll = Math.round(yBottom - totalSlots * slotH);
            const hit = document.createElementNS("http://www.w3.org/2000/svg","rect");
            hit.setAttribute("x", xLeft); hit.setAttribute("y", yTopAll);
            hit.setAttribute("width", bandW); hit.setAttribute("height", Math.ceil(totalSlots * slotH));
            hit.setAttribute("fill", "transparent");
            hit.setAttribute("pointer-events", "all");
            hit.setAttribute("class", "flag-hit chart-hit");
            hit.setAttribute("data-date", d);
            hit.setAttribute("role", "button");
            hit.setAttribute("tabindex", "0");
            // ARIA-Label aus Flags ableiten
            try {
              const f = this.flagsByDate?.get?.(d);
              if (f) {
                const items = [];
                if (f.training) items.push("Training");
                if (f.sick) items.push("Krank");
                if (f.low_intake) items.push("< 2 L Wasser");
                if (f.salt_high) items.push("> 5 g Salz");
                if (f.protein_high90) items.push("Protein  90 g");
                if (f.valsartan_missed) items.push("Valsartan vergessen");
                if (f.forxiga_missed) items.push("Forxiga vergessen");
                if (f.nsar_taken) items.push("NSAR genommen");
                if (!f.valsartan_missed && !f.forxiga_missed && !f.nsar_taken && f.meds) items.push("Medikamente");
                if (items.length) hit.setAttribute("aria-label", `Flags: ${items.join(", ")}`);
              }
            } catch(_){}
            g.appendChild(hit);
          }
        }
        this.svg.appendChild(g); // hinter den Linien/Punkten
      }
    }

    // Koerper: Kompositionsbalken (Muskel/Fett) als hinterer Layer
    if (metric === "weight" && this.SHOW_BODY_COMP_BARS && this.svg) {
      const baseLineValue = 75;
      const baseline = y(baseLineValue);
      const muscleSeries = barSeries[0] || { values: [] };
      const fatSeries    = barSeries[1] || { values: [] };
      const entries = data.map((entry, idx) => {
        const ts = X[idx];
        if (!Number.isFinite(ts)) return null;
        const muscle = muscleSeries.values[idx];
        const fat = fatSeries.values[idx];
        if (muscle == null && fat == null) return null;
        return { ts, muscle, fat, src: data[idx], idx };
      }).filter(Boolean);

      if (entries.length) {
        const uniqTs = [...new Set(entries.map(e => e.ts))].sort((a,b)=>a-b);
        const dayXs = uniqTs.map(t => x(t));
        const baseStep = dayXs.length > 1
          ? Math.min(...dayXs.slice(1).map((v,i) => v - dayXs[i]))
          : innerW / Math.max(1, uniqTs.length);
        const groupWidth = Math.max(12, Math.min(36, Math.floor(baseStep * 0.5)));
        const gap = Math.max(2, Math.floor(groupWidth * 0.12));
        const barWidth = Math.max(4, Math.floor((groupWidth - gap) / 2));

        if (barWidth > 0 && Number.isFinite(baseline)) {
          const formatKg = (val) => {
            if (val == null) return null;
            const num = Number(val);
            if (!Number.isFinite(num)) return null;
            return (typeof fmtNum === "function" ? fmtNum(num, 1) : num.toFixed(1));
          };
          let barsSvg = '<g class="body-bars" aria-hidden="true">';
          let hitsSvg = '<g class="body-bar-hits">';
          for (const { ts, muscle, fat, src } of entries) {
            const center = x(ts);
            const start = center - groupWidth / 2;
            const raw = src || {};
            const dayIso = raw?.date || (raw?.dateTime ? raw.dateTime.slice(0, 10) : new Date(ts).toISOString().slice(0, 10));
            const weightVal = formatKg(raw?.weight);
            const muscleNum = muscle != null ? Number(muscle) : null;
            const fatNum = fat != null ? Number(fat) : null;
            const hasMuscle = muscleNum != null && Number.isFinite(muscleNum);
            const hasFat = fatNum != null && Number.isFinite(fatNum);
            let muscleX = start;
            let fatX = start + barWidth + gap;
            if (hasMuscle && !hasFat) {
              muscleX = center - barWidth / 2;
            }
            if (!hasMuscle && hasFat) {
              fatX = center - barWidth / 2;
            }

            if (hasMuscle) {
              const yVal = y(baseLineValue + muscleNum);
              if (Number.isFinite(yVal)) {
                const h = Math.abs(baseline - yVal);
                if (h > 0.5) {
                  const top = Math.min(baseline, yVal);
                  barsSvg += `<rect class="body-bar" data-series="body-muscle" x="${muscleX.toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" fill="var(--chart-bar-muscle)" fill-opacity="0.55" stroke="none" pointer-events="none" />`;
                  let hitHeight = Math.max(h, 14);
                  let hitTop = Math.min(top, baseline - hitHeight);
                  if (hitTop < PT) {
                    hitTop = PT;
                    hitHeight = Math.max(4, baseline - hitTop);
                  }
                  if (hitHeight > 0.5) {
                    const muscleVal = formatKg(muscleNum);
                    const parts = [];
                    if (muscleVal) parts.push(`Muskelmasse: ${muscleVal} kg`);
                    if (weightVal) parts.push(`Gewicht: ${weightVal} kg`);
                    const note = parts.join('\n');
                    const aria = `${dayIso || ''} Muskel ${muscleVal ? muscleVal + ' kg' : ''}`.trim();
                    hitsSvg += `<rect class="body-hit chart-hit" x="${muscleX.toFixed(1)}" y="${hitTop.toFixed(1)}" width="${barWidth}" height="${hitHeight.toFixed(1)}" fill="transparent" pointer-events="all"
                      data-series="body-muscle" data-date="${esc(dayIso || '')}" data-ctx="Muskel" data-note="${esc(note)}"
                      aria-label="${esc(aria)}" title="${esc(aria)}" role="button" tabindex="0"></rect>`;
                  }
                }
              }
            }

            if (hasFat) {
              const yVal = y(baseLineValue + fatNum);
              if (Number.isFinite(yVal)) {
                const h = Math.abs(baseline - yVal);
                if (h > 0.5) {
                  const top = Math.min(baseline, yVal);
                  barsSvg += `<rect class="body-bar" data-series="body-fat" x="${fatX.toFixed(1)}" y="${top.toFixed(1)}" width="${barWidth}" height="${h.toFixed(1)}" fill="var(--chart-bar-fat)" fill-opacity="0.55" stroke="none" pointer-events="none" />`;
                  let hitHeight = Math.max(h, 14);
                  let hitTop = Math.min(top, baseline - hitHeight);
                  if (hitTop < PT) {
                    hitTop = PT;
                    hitHeight = Math.max(4, baseline - hitTop);
                  }
                  if (hitHeight > 0.5) {
                    const fatVal = formatKg(fatNum);
                    const parts = [];
                    if (fatVal) parts.push(`Fettmasse: ${fatVal} kg`);
                    if (weightVal) parts.push(`Gewicht: ${weightVal} kg`);
                    const note = parts.join('\n');
                    const aria = `${dayIso || ''} Fett ${fatVal ? fatVal + ' kg' : ''}`.trim();
                    hitsSvg += `<rect class="body-hit chart-hit" x="${fatX.toFixed(1)}" y="${hitTop.toFixed(1)}" width="${barWidth}" height="${hitHeight.toFixed(1)}" fill="transparent" pointer-events="all"
                      data-series="body-fat" data-date="${esc(dayIso || '')}" data-ctx="Fett" data-note="${esc(note)}"
                      aria-label="${esc(aria)}" title="${esc(aria)}" role="button" tabindex="0"></rect>`;
                  }
                }
              }
            }
          }
          barsSvg += '</g>';
          hitsSvg += '</g>';
          this.svg.insertAdjacentHTML("beforeend", barsSvg);
          pendingBodyHitsSvg = hitsSvg;
        }
      }
    }

    // Linien + Punkte
const isFiniteTs = (t) => Number.isFinite(t);

const mkPath = (seriesItem) => {
  const { values = [], color = "#fff", key } = seriesItem || {};
  let d = "";
  values.forEach((v,i) => {
    if (v == null || !isFiniteTs(X[i])) return; // statt !X[i]
    d += (d === "" ? "M" : "L") + `${x(X[i]).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const seriesAttr = key ? ` data-series="${esc(key)}"` : "";
  return `<path${seriesAttr} d="${d}" fill="none" stroke="${color}" stroke-width="2.2" pointer-events="none" />`;
};

const mkDots = (seriesItem) => {
  const { values = [], color = "#fff", type, key } = seriesItem || {};
  const kind = (type === "sys" || type === "dia") ? type : "misc";
  let out = "";
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(X[i])) return;
    const cx = x(X[i]).toFixed(1);
    const cy = y(v).toFixed(1);

    // Tooltip-Infos (nur bei BP vorhanden)
    const m = (kind === "sys" || kind === "dia") ? (meta?.[i] || {}) : {};
    const date = (m.date || (data?.[i]?.date || ""));
    const ctx  = (m.ctx  || (kind === "misc" ? "Tag" : ""));
    const note = (m.note || "");
    const labelBase = (kind === "sys" || kind === "dia") ? `${kind.toUpperCase()} ${v}` : `${v}`;
    const aria = `${date} ${ctx} ${labelBase}`.trim();

    const seriesAttr = key ? ` data-series="${esc(key)}"` : "";
    out += `<circle class="pt" cx="${cx}" cy="${cy}" r="2.6" fill="${color}"
                data-kind="${esc(kind)}" data-val="${v}"
                data-date="${esc(date)}" data-ctx="${esc(ctx)}"
               data-note="${esc(note)}"${seriesAttr} tabindex="0" role="button" aria-label="${esc(aria)}" title="${esc(aria)}"
               stroke="rgba(0,0,0,0)" stroke-width="12" pointer-events="stroke" />`;
  });
  return out;
};

const mkAlertDots = (seriesItem) => {
  if (metric !== "bp") return "";
  const isSys = seriesItem.type === "sys";
  const thr   = isSys ? TH_SYS : TH_DIA;
  const kind  = isSys ? "sys" : "dia";
  let out = "";
  seriesItem.values.forEach((v, i) => {
    if (v == null || !isFiniteTs(X[i])) return;
    if (v > thr) {
      const cx = x(X[i]).toFixed(1), cy = y(v).toFixed(1);
      const m = meta?.[i] || {};
      const seriesAttr = seriesItem?.key ? ` data-series="${esc(seriesItem.key)}"` : "";
      out += `<circle class="pt" cx="${cx}" cy="${cy}" r="5.2" fill="#ef4444" stroke="#000" stroke-width="0.8"
               data-kind="${kind}" data-val="${v}"
               data-date="${esc(m.date || "")}" data-ctx="${esc(m.ctx || "")}"
               data-note="${esc(m.note || "")}"${seriesAttr} />`;
    }
  });
  return out;
};

    // Zeichnen
    series.forEach((s) => {
      if (!this.svg) return;
      this.svg.insertAdjacentHTML("beforeend", mkPath(s));
      this.svg.insertAdjacentHTML("beforeend", mkDots(s));
      if (metric === "bp") {
        this.svg.insertAdjacentHTML("beforeend", mkAlertDots(s));
      }
      // Legende
      if (this.legend) {
        const wrap = document.createElement("span");
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "6px";
        if (s.key) wrap.setAttribute("data-series", s.key);
        const dot = Object.assign(document.createElement("span"), { className: "dot" });
        dot.style.background = s.color;
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        const label = document.createElement("span");
        label.textContent = s.name;
        wrap.append(dot, label);
        this.legend.appendChild(wrap);
      }
    });

    if (pendingBodyHitsSvg && this.svg) {
      this.svg.insertAdjacentHTML("beforeend", pendingBodyHitsSvg);
    }

    if (metric === "weight" && this.legend) {
      barSeries.forEach((s) => {
        if (!s.values.some(v => v != null)) return;
        const wrap = document.createElement("span");
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "6px";
        if (s.key) wrap.setAttribute("data-series", s.key);
        const dot = Object.assign(document.createElement("span"), { className: "dot" });
        dot.style.background = s.color;
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        const label = document.createElement("span");
        label.textContent = s.name;
        wrap.append(dot, label);
        this.legend.appendChild(wrap);
      });
    }

    if (this.tipSticky) { this.tipSticky = false; this.hideTip(); }

    const sPerf = (perfStats.add?.("drawChart", (performance.now?.() ?? Date.now()) - t0), perfStats.snap?.("drawChart")) || {p50:0,p90:0,p95:0,p99:0,count:0};
    if (sPerf && typeof sPerf.count === 'number' && (sPerf.count % 25 === 0)) {
      diag.add?.(`[perf] drawChart p50=${sPerf.p50|0}ms p90=${sPerf.p90|0}ms p95=${sPerf.p95|0}ms p99=${sPerf.p99|0}ms (n=${sPerf.count})`);
    }
  },
};

/** END MODULE */
  const chartsApi = {
    chartPanel
  };
  appModules.charts = Object.assign({}, appModules.charts, chartsApi);
  global.AppModules = appModules;
  global.chartPanel = chartPanel;

  const initChartPanelSafe = () => {
    try {
      chartPanel.init();
    } catch (err) {
      global.console?.warn?.('[charts] chartPanel init failed', err);
    }
  };

  if (global.document?.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', initChartPanelSafe, { once: true });
  } else {
    initChartPanelSafe();
  }
})(typeof window !== 'undefined' ? window : globalThis);
