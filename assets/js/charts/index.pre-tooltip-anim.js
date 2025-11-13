'use strict';
/**
 * MODULE: app/charts/index.js
 * Description: Rendert SVG/Canvas-Charts für Blutdruck- und Körperdaten, inklusive KPI-Leiste und Tooltip-Logik.
 * Submodules:
 *  - globals & helpers (Supabase-Fallbacks, FocusTrap, Konfiguration)
 *  - chartPanel controller (Panel-Lifecycle, Events, Tooltip-Handling)
 *  - chartPanel.getFiltered (Aggregation von Cloud-/Local-Daten)
 *  - chartPanel.draw (Rendering-Pipeline: Skalen, SVG-Layer, WHO-Ampel)
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
  pulseLink: null,
  SHOW_BODY_COMP_BARS: true,

  // SUBMODULE: chartPanel.init @internal - richtet Panel, Tooltip und Event-Handler ein
  initialized: false,

  init() {
    if (this.initialized) return;
    this.el = $("#chart");
    this.svg = $("#chartSvg");
    this.legend = $("#chartLegend");

    // Panel initial nicht anzeigen
    if (this.el) {
      this.el.classList.remove('is-open');
    }

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
        const isBar = !!(tgt && tgt.classList?.contains("chart-bar"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit")) || isBar;
        if (!(isPt || isHit)) { this.hideTip(); this.hidePulseLink(); return; }
        if (!this.fillTipFromTarget(tgt)) { this.hideTip(); this.hidePulseLink(); return; }
        this.showPulseLinkForTarget(tgt);
        this.positionTip(e);
      });

      this.svg.addEventListener("pointerleave", () => {
        if (this.tipSticky) return;
        this.hideTip();
        this.hidePulseLink();
      });

      // Click/Tap: Tooltip toggeln (mobil-freundlich)
      this.svg.addEventListener("click", (e) => {
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isBar = !!(tgt && tgt.classList?.contains("chart-bar"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit")) || isBar;
        if (!(isPt || isHit)) {
          if (this.tipSticky) { this.tipSticky = false; this.hideTip(); this.hidePulseLink(); }
          return;
        }
        if (!this.fillTipFromTarget(tgt)) {
          if (this.tipSticky) { this.tipSticky = false; this.hideTip(); this.hidePulseLink(); }
          return;
        }
        this.tipSticky = !this.tipSticky;
        this.showPulseLinkForTarget(tgt);
        this.positionTip(e);
      });

      // Keyboard: Enter/Space toggelt Tooltip, ESC schliesst
      this.svg.addEventListener("keydown", (e) => {
        const tgt = e.target;
        const isPt  = !!(tgt && tgt.classList?.contains("pt"));
        const isBar = !!(tgt && tgt.classList?.contains("chart-bar"));
        const isHit = !!(tgt && tgt.classList?.contains("chart-hit")) || isBar;
        if (!(isPt || isHit)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!this.fillTipFromTarget(tgt)) return;
          this.tipSticky = !this.tipSticky;
          this.showPulseLinkForTarget(tgt);
        } else if (e.key === "Escape") {
          this.tipSticky = false;
          this.hideTip();
          this.hidePulseLink();
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
      this.el.classList.add('is-open');
      this.el.style.removeProperty('display');
      getFocusTrap()?.activate?.(this.el);
    }
  },

  // SUBMODULE: chartPanel.hide @internal - schliesst Panel, deaktiviert focusTrap und Tooltips
  hide() {
    this.open = false;
    if (this.el) {
      this.el.classList.remove('is-open');
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
          fat_kg: d.fat_kg,
          muscle_kg: d.muscle_kg
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
    this.hidePulseLink();
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
  // SUBMODULE: chartPanel.fillTipFromTarget @internal - generiert Tooltip-Inhalt
  fillTipFromTarget(tgt) {
    if (!this.tip || !tgt) return false;
    this.setHoverSeries(tgt?.getAttribute("data-series") || null);
    const note = (tgt.getAttribute("data-note") || "").trim();
    const valueLabel = (tgt.getAttribute("data-value-label") || "").trim();
    const date = tgt.getAttribute("data-date") || "";
    const ctx  = tgt.getAttribute("data-ctx")  || "";
    const kind = tgt.getAttribute("data-kind") || "";

    const parts = [];
    const hdrText = [date, ctx].filter(Boolean).join(" . ");
    if (hdrText) {
      parts.push(`<div class="chart-tip-header">${esc(hdrText)}</div>`);
    }
    if (note) {
      parts.push(`<div class="chart-tip-note">${esc(note)}</div>`);
    }
    if (valueLabel) {
      parts.push(`<div class="chart-tip-value">${esc(valueLabel)}</div>`);
    }
    if (this.currentMetric === "bp" && (kind === "sys" || kind === "dia")) {
      const sysVal = Number(tgt.getAttribute("data-sys"));
      const diaVal = Number(tgt.getAttribute("data-dia"));
      if (Number.isFinite(sysVal) && Number.isFinite(diaVal)) {
        const pulsePressure = Math.round(sysVal - diaVal);
        parts.push(`<div class="chart-tip-value">${esc(`Pulsdruck: ${pulsePressure} mmHg`)}</div>`);
      }
    } else {
      this.hidePulseLink();
    }
    if (!parts.length) return false;
    this.tip.innerHTML = parts.join("");
    this.tip.dataset.visible = "1";
    this.tip.style.display = "block";
    this.tip.style.opacity = "1";
    if (this.live) this.live.textContent = `${date || ''} ${ctx || ''} ${note || valueLabel || ''}`.trim();
    return true;
  },
  showPulseLinkForTarget(tgt) {
    if (!this.svg || !tgt) return;
    if (this.currentMetric !== "bp") { this.hidePulseLink(); return; }
    const kind = tgt.getAttribute("data-kind");
    if (kind !== "sys" && kind !== "dia") { this.hidePulseLink(); return; }
    const ctx = tgt.getAttribute("data-ctx");
    const date = tgt.getAttribute("data-date");
    if (!date || !ctx) { this.hidePulseLink(); return; }
    const counterpartKind = kind === "sys" ? "dia" : "sys";
    const escapeCss = (value) => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
      return `${value}`.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    const selector = `.pt[data-kind="${escapeCss(counterpartKind)}"][data-date="${escapeCss(date)}"][data-ctx="${escapeCss(ctx)}"]`;
    const other = this.svg.querySelector(selector);
    if (!other) { this.hidePulseLink(); return; }
    const cxAttr1 = tgt.getAttribute("cx");
    const cyAttr1 = tgt.getAttribute("cy");
    const cxAttr2 = other.getAttribute("cx");
    const cyAttr2 = other.getAttribute("cy");
    if ([cxAttr1, cyAttr1, cxAttr2, cyAttr2].some((attr) => attr == null || attr === "")) {
      this.hidePulseLink();
      return;
    }
    const cx1 = Number(cxAttr1);
    const cy1 = Number(cyAttr1);
    const cx2 = Number(cxAttr2);
    const cy2 = Number(cyAttr2);
    if (!Number.isFinite(cx1) || !Number.isFinite(cy1) || !Number.isFinite(cx2) || !Number.isFinite(cy2)) {
      this.hidePulseLink();
      return;
    }
    let line = this.pulseLink;
    if (!line) {
      line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("pulse-link");
      this.pulseLink = line;
      this.svg.appendChild(line);
    }
    line.setAttribute("x1", cx1.toFixed(1));
    line.setAttribute("y1", cy1.toFixed(1));
    line.setAttribute("x2", cx2.toFixed(1));
    line.setAttribute("y2", cy2.toFixed(1));
    line.style.display = "block";
  },
  hidePulseLink() {
    if (this.pulseLink) this.pulseLink.style.display = "none";
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
      { k: "pulsepressure", label: "Pulsdruck: -" },
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
this.currentMetric = metric;
const BASE_WEIGHT_MIN = 75;

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
        const avgPulsePressure = avg(mData.map(e => (
          e.sys != null && e.dia != null ? Number(e.sys) - Number(e.dia) : null
        )));

        const f0 = (v) => (v == null ? "-" : Math.round(v).toString());

        // Zeige BP-KPIs, blende BMI/WHtR aus
        const sEl  = avgBox.querySelector('[data-k="sys"]');
        const dEl  = avgBox.querySelector('[data-k="dia"]');
        const mEl  = avgBox.querySelector('[data-k="map"]');
        const ppEl = avgBox.querySelector('[data-k="pulsepressure"]');
        const bmiEl  = avgBox.querySelector('[data-k="bmi"]');
        const whtrEl = avgBox.querySelector('[data-k="whtr"]');
        if (sEl)  { sEl.style.display  = ""; sEl.textContent  = "Durchschnitt Sys: " + f0(avgSys); }
        if (dEl)  { dEl.style.display  = ""; dEl.textContent  = "Durchschnitt Dia: " + f0(avgDia); }
        if (mEl)  { mEl.style.display  = ""; mEl.textContent  = "Durchschnitt MAP: " + f0(avgMap); }
        if (ppEl) { ppEl.style.display = ""; ppEl.textContent = `Pulsdruck: ${f0(avgPulsePressure)}`; }
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

    const includeBars = metric === "weight" && this.SHOW_BODY_COMP_BARS;
    const barStackValue = (val) => {
      const parsed = Number(val);
      if (!Number.isFinite(parsed) || parsed <= 0) return BASE_WEIGHT_MIN;
      return BASE_WEIGHT_MIN + parsed;
    };
    const hasBarData = includeBars && barSeries.some(s => s.values.some(v => v != null));
    const hasAny = series.some(s => s.values.some(v => v != null)) || hasBarData;
    if (!hasAny) {
      if (this.svg) this.svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#9aa3af" font-size="14">Keine darstellbaren Werte</text>';
      return;
    }

    // Dynamische Groesse
    const bbox = this.svg?.getBoundingClientRect?.() || { width: 640, height: 280 };
    const W = Math.max(300, Math.floor(bbox.width  || 640));
    const H = Math.max(200, Math.floor(bbox.height || 280));
    if (this.svg) this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const PL = 48, PR = 16, PT = 12, PB = 28;
    const innerW = W - PL - PR, innerH = H - PT - PB;

    // Skalen
    const xVals = X.filter(t => Number.isFinite(t));
    let xmin = Math.min(...xVals);
    let xmax = Math.max(...xVals);

    if (!Number.isFinite(xmin) || !Number.isFinite(xmax)) {
      // Fallback
      xmin = Date.now() - 7 * 864e5;
      xmax = Date.now();
    }

    // Padding (2%)
    const xPad = xmax > xmin ? (xmax - xmin) * 0.02 : 0;
    xmin -= xPad; xmax += xPad;

    const lineVals = series.flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
    const barVals  = includeBars
      ? barSeries.flatMap(s =>
          s.values
            .map(barStackValue)
            .filter(v => Number.isFinite(v) && v !== BASE_WEIGHT_MIN)
        )
      : [];
    let allY = [...lineVals, ...barVals];
    if (metric === "weight") {
      const weightValsOnly = series
        .filter(s => s.key === "body-weight" || s.key === "body-waist")
        .flatMap(s => s.values.filter(v => v != null && Number.isFinite(v)));
      const combined = [...weightValsOnly, ...barVals];
      allY = combined.length ? combined : [BASE_WEIGHT_MIN, 110];
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
      const baseMin = BASE_WEIGHT_MIN;
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
  const { values = [], color = "#fff", type, key, name = "" } = seriesItem || {};
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
    const numericVal = Number(v);
    const formattedVal =
      Number.isFinite(numericVal)
        ? (kind === "misc" ? numericVal.toFixed(1) : Math.round(numericVal).toString())
        : `${v}`;
    const valueLabel = name ? `${name}: ${formattedVal}` : formattedVal;
    const aria = `${date} ${ctx} ${valueLabel}`.trim();

    const attrs = [
      `<circle class="pt"`,
      `cx="${cx}"`,
      `cy="${cy}"`,
      `r="2.6"`,
      `fill="${color}"`,
      `data-kind="${esc(kind)}"`,
      `data-val="${v}"`,
      `data-date="${esc(date)}"`,
      `data-ctx="${esc(ctx)}"`,
      `data-note="${esc(note)}"`,
      `data-series-label="${esc(name)}"`,
      `data-value-label="${esc(valueLabel)}"`,
      `tabindex="0"`,
      `role="button"`,
      `aria-label="${esc(aria)}"`,
      `title="${esc(aria)}"`,
      `stroke="rgba(0,0,0,0)"`,
      `stroke-width="12"`,
      `pointer-events="stroke"`
    ];
    if (kind === "sys" || kind === "dia") {
      attrs.push(`data-sys="${esc(m.sys != null ? m.sys : "")}"`);
      attrs.push(`data-dia="${esc(m.dia != null ? m.dia : "")}"`);
    }
    if (key) attrs.push(`data-series="${esc(key)}"`);
    attrs.push("/>");
    out += attrs.filter(Boolean).join(" ");
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

const mkBars = () => {
  if (metric !== "weight" || !barSeries.length || !this.SHOW_BODY_COMP_BARS) return "";
  const activeBars = barSeries.filter((s) => s.values.some((v) => v != null && Number.isFinite(v)));
  if (!activeBars.length) return "";
  const slots = Math.max(1, data.length);
  const baseWidth = Math.min(28, Math.max(6, innerW / Math.max(8, slots)));
  const barWidth = baseWidth * 0.75;
  const offsetStep = baseWidth;
  const baseline = BASE_WEIGHT_MIN;
  const baseY = y(baseline);
  let out = "";
  activeBars.forEach((seriesItem, idx) => {
    const offset = (idx - (activeBars.length - 1) / 2) * offsetStep;
    seriesItem.values.forEach((rawVal, i) => {
      if (rawVal == null || !Number.isFinite(X[i])) return;
      const plotted = barStackValue(rawVal);
      if (!Number.isFinite(plotted) || plotted === baseline) return;
      const displayVal = Number(rawVal);
      if (!Number.isFinite(displayVal)) return;
      const cx = x(X[i]);
      const rectX = cx + offset - barWidth / 2;
      const yVal = y(plotted);
      const rectY = Math.min(yVal, baseY);
      const rectH = Math.abs(baseY - yVal);
      if (!Number.isFinite(rectX) || !Number.isFinite(rectY) || rectH <= 0) return;
      const date = data?.[i]?.date || "";
      const valueLabel = `${seriesItem.name || ''}: ${displayVal.toFixed(1)} kg`.trim();
      const attrParts = [
        `class="chart-bar"`,
        `x="${rectX.toFixed(1)}"`,
        `y="${rectY.toFixed(1)}"`,
        `width="${barWidth.toFixed(1)}"`,
        `height="${rectH.toFixed(1)}"`,
        `fill="${seriesItem.color}"`,
        `opacity="0.35"`,
        `data-kind="body-bar"`,
        `data-date="${esc(date)}"`,
        `data-series-label="${esc(seriesItem.name || "")}"`,
        `data-value-label="${esc(valueLabel)}"`,
        `tabindex="0"`,
        `role="button"`,
        `aria-label="${esc(valueLabel)}"`
      ];
      if (seriesItem.key) attrParts.push(`data-series="${esc(seriesItem.key)}"`);
      out += `<rect ${attrParts.join(" ")}></rect>`;
    });
  });
  return out;
};

    // Zeichnen
    if (metric === "weight" && this.svg) {
      const bars = mkBars();
      if (bars) {
        this.svg.insertAdjacentHTML("beforeend", bars);
      }
    }
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

    if (metric === "weight" && includeBars && this.legend) {
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
