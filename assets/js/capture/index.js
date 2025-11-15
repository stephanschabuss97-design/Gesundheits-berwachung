'use strict';
(function(global){
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

  const MAX_WATER_ML = 6000;
  const MAX_SALT_G = 30;
  const MAX_PROTEIN_G = 300;
  const escapeAttr = (value = '') =>
    String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
  const TREND_PILOT_SEVERITY_META = {
    warning: { cls: 'warn', shortLabel: 'Warnung', longLabel: 'Trendpilot (Warnung)' },
    critical: { cls: 'bad', shortLabel: 'Kritisch', longLabel: 'Trendpilot (kritisch)' }
  };
  let latestTrendpilotEntry = null;
  let trendpilotHookBound = false;
  const getTrendpilotSeverityMeta = (severity) => {
    if (!severity) return null;
    return TREND_PILOT_SEVERITY_META[severity] || null;
  };

  const formatTrendpilotDay = (dayIso) => {
    if (!dayIso) return '';
    const date = new Date(`${dayIso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return dayIso;
    return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const setLatestTrendpilotEntry = (entry) => {
    if (entry && entry.metric && entry.metric !== 'bp') {
      latestTrendpilotEntry = null;
      return;
    }
    latestTrendpilotEntry = entry && entry.severity ? entry : null;
  };

  function initTrendpilotCaptureHook() {
    if (trendpilotHookBound) return;
    trendpilotHookBound = true;
    const doc = global.document;
    if (!doc) return;
    doc.addEventListener('trendpilot:latest', (event) => {
      const entry = event?.detail?.entry || null;
      setLatestTrendpilotEntry(entry);
      updateCaptureIntakeStatus();
    });
    const trendpilotMod = appModules.trendpilot || global.AppModules?.trendpilot || {};
    const current = trendpilotMod?.getLatestSystemComment?.();
    if (current) {
      setLatestTrendpilotEntry(current);
    }
    trendpilotMod?.refreshLatestSystemComment?.();
  }

  // SUBMODULE: setCaptureIntakeDisabled @public - toggles capture inputs and buttons
  function setCaptureIntakeDisabled(disabled){
    const state = !!disabled;
    ['cap-water-add','cap-salt-add','cap-protein-add'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = state;
    });
    ['cap-water-add-btn','cap-salt-add-btn','cap-protein-add-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = state;
    });
  }

  /** MODULE: CAPTURE (Intake)
   * intent: UI Helpers fuer Intake-Status, Guards und Reset-Flows (Fortsetzung)
   * contracts: nutzt requestUiRefresh, saveIntakeTotals*, DATA ACCESS Helfer
   * exports: setCaptureIntakeDisabled, prepareIntakeStatusHeader, updateCaptureIntakeStatus, clearCaptureIntakeInputs, handleCaptureIntake
   * notes: Fortsetzung des Capture-Logikblocks (Status/Guards)
   */
  // SUBMODULE: clearCaptureIntakeInputs @internal - leert temporaere Intake-Felder vor neuem Save-Lauf
  function clearCaptureIntakeInputs(){
    ['water', 'salt', 'protein'].forEach(kind => {
      const input = document.getElementById(`cap-${kind}-add`);
      if (input) input.value = '';
    });
  }

  // SUBMODULE: millisUntilNextMidnight @public - calculates next midnight reset window
  function millisUntilNextMidnight(){
    try {
      const now = new Date();
      const next = new Date(now);
      next.setHours(0, 0, 10, 0);
      next.setDate(next.getDate() + 1);
      const diff = next.getTime() - now.getTime();
      return Number.isNaN(diff) ? 3600_000 : Math.max(1000, diff);
    } catch {
      return 3600_000;
    }
  }

  // SUBMODULE: handleMidnightRefresh @public - triggers capture refresh on new day
  async function handleMidnightRefresh(){
    AppModules.captureGlobals.setMidnightTimer(null);
    try {
      await maybeRefreshForTodayChange({ force: true, source: 'midnight' });
    } finally {
      scheduleMidnightRefresh();
    }
  }

  // SUBMODULE: scheduleMidnightRefresh @public - arms midnight timer loop
  function scheduleMidnightRefresh(){
    try {
      const timer = AppModules.captureGlobals.getMidnightTimer();
      if (timer) clearTimeout(timer);
      const delay = millisUntilNextMidnight();
      AppModules.captureGlobals.setMidnightTimer(setTimeout(handleMidnightRefresh, delay));
    } catch (_) { /* noop */ }
  }

  // SUBMODULE: maybeResetIntakeForToday @public - ensures intake reset runs once per day
  async function maybeResetIntakeForToday(todayIso){
    try {
      const last = AppModules.captureGlobals.getIntakeResetDoneFor();
      if (last === todayIso) return;
      AppModules.captureGlobals.setIntakeResetDoneFor(todayIso);
    } catch (_) { /* noop */ }
  }

  // SUBMODULE: scheduleNoonSwitch @public - toggles BP context at noon
  function scheduleNoonSwitch(){
    try {
      const timer = AppModules.captureGlobals.getNoonTimer();
      if (timer) clearTimeout(timer);
      const now = new Date();
      const noon = new Date(now);
      noon.setHours(12, 0, 5, 0);
      if (noon.getTime() <= now.getTime()) {
        noon.setDate(noon.getDate() + 1);
      }
      const delay = Math.max(1000, noon.getTime() - now.getTime());
      AppModules.captureGlobals.setNoonTimer(setTimeout(async () => {
        try {
          AppModules.captureGlobals.setBpUserOverride(false);
          await maybeRefreshForTodayChange({ force: true, source: 'noon-switch' });
        } catch (_) { /* noop */ }
      }, delay));
    } catch (_) { /* noop */ }
  }

  // SUBMODULE: maybeRefreshForTodayChange @public - reconciles capture state for day switches
  async function maybeRefreshForTodayChange({ force = false, source = '' } = {}){
    const todayIso = todayStr();
    const dateEl = document.getElementById('date');
    const selected = dateEl?.value || '';
    const todayChanged = AppModules.captureGlobals.getLastKnownToday() !== todayIso;
    if (!force && !todayChanged) return;

    const userPinnedOtherDay = AppModules.captureGlobals.getDateUserSelected() && selected && selected !== todayIso;
    if (!userPinnedOtherDay && dateEl) {
      if (selected !== todayIso) {
        dateEl.value = todayIso;
      }
      AppModules.captureGlobals.setDateUserSelected(false);
    }

    if (!userPinnedOtherDay) {
      try { maybeResetIntakeForToday(todayIso); } catch(_) {}
    }

    try {
      await refreshCaptureIntake();
    } catch(_) {}

    AppModules.captureGlobals.setLastKnownToday(todayIso);
    if (!AppModules.captureGlobals.getMidnightTimer()) scheduleMidnightRefresh();
    scheduleNoonSwitch();
    if (!userPinnedOtherDay) {
      AppModules.captureGlobals.setBpUserOverride(false);
      maybeAutoApplyBpContext({ force: true, source: source || 'day-change' });
    }
    diag.add?.(`intake: day refresh (${source || 'auto'})`);
  }

  // SUBMODULE: prepareIntakeStatusHeader @public - ensures pills/status header exists
  function prepareIntakeStatusHeader(){
    try {
      const wrap = document.getElementById('capturePillsRow');
      if (!wrap) return;

      wrap.style.gap = '8px';
      wrap.style.flexWrap = 'wrap';
      wrap.style.alignItems = 'center';

      let top = document.getElementById('cap-intake-status-top');
      if (!top) {
        top = document.createElement('div');
        top.id = 'cap-intake-status-top';
        top.className = 'small';
        top.style.opacity = '.8';
        top.setAttribute('role','group');
        top.setAttribute('aria-live','polite');
        top.setAttribute('tabindex','0');
      }

      if (top) {
        top.setAttribute('role','group');
        top.setAttribute('aria-live','polite');
        top.setAttribute('tabindex','0');
        top.style.display = 'flex';
        top.style.gap = '8px';
        top.style.flexWrap = 'wrap';
        top.style.alignItems = 'center';
      }

      if (wrap && nab && top) {
        wrap.insertBefore(top, nab);
      } else if (wrap && top && !top.parentElement) {
        wrap.appendChild(top);
      }
    } catch(_) {}
  }

  // SUBMODULE: updateCaptureIntakeStatus @public - renders intake KPI pills
  const updateCaptureIntakeStatus = debounce(function(){
    const startedAt = (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : null;
    try {
      const statusEl = document.getElementById('cap-intake-status');
      let statusTop = document.getElementById('cap-intake-status-top');
      if (!statusEl && !statusTop) return;

      if (!statusTop) {
        prepareIntakeStatusHeader();
        statusTop = document.getElementById('cap-intake-status-top');
      }

      if (statusTop) {
        statusTop.setAttribute('role','group');
        statusTop.setAttribute('aria-live','polite');
        statusTop.setAttribute('tabindex','0');
      }

      if (!captureIntakeState.logged){
        if (statusEl) {
          statusEl.textContent = 'Bitte anmelden, um Intake zu erfassen.';
          statusEl.style.display = '';
        }
        if (statusTop) {
          statusTop.innerHTML = '';
          statusTop.style.display = 'none';
          statusTop.setAttribute('aria-label', 'Tagesaufnahme: Bitte anmelden, um Intake zu erfassen.');
        }
        return;
      }

      const t = captureIntakeState.totals || {};
      const waterVal = Math.round(t.water_ml || 0);
      const saltVal = Number(t.salt_g || 0);
      const proteinVal = Number(t.protein_g || 0);

      const waterRatio = MAX_WATER_ML ? waterVal / MAX_WATER_ML : 0;
      const waterCls = waterRatio >= 0.9 ? 'ok' : (waterRatio >= 0.5 ? 'warn' : 'bad');
      const saltCls = saltVal > MAX_SALT_G ? 'bad' : (saltVal >= 5 ? 'warn' : 'ok');
      const proteinCls = (proteinVal >= 78 && proteinVal <= MAX_PROTEIN_G) ? 'ok' : (proteinVal > MAX_PROTEIN_G ? 'bad' : 'warn');

      const describe = (cls) => ({
        ok: 'Zielbereich',
        warn: 'Warnung',
        bad: 'kritisch',
        neutral: 'neutral'
      }[cls] || 'unbekannt');

      const pills = [
        { cls: waterCls, label: 'Wasser', value: `${waterVal} ml` },
        { cls: saltCls, label: 'Salz', value: `${fmtDE(saltVal,1)} g` },
        { cls: proteinCls, label: 'Protein', value: `${fmtDE(proteinVal,1)} g` }
      ];

      if (latestTrendpilotEntry && latestTrendpilotEntry.severity) {
        const tpMeta = getTrendpilotSeverityMeta(latestTrendpilotEntry.severity);
        if (tpMeta) {
          const dayLabel = formatTrendpilotDay(latestTrendpilotEntry.day);
          const preview = (latestTrendpilotEntry.text || '').split(/\r?\n/)[0].trim();
          const ariaParts = [`Trendpilot: ${tpMeta.longLabel}`];
          if (dayLabel) ariaParts.push(`am ${dayLabel}`);
          if (preview) ariaParts.push(preview);
          pills.push({
            cls: tpMeta.cls,
            label: 'Trendpilot',
            value: `${tpMeta.shortLabel}${dayLabel ? ` (${dayLabel})` : ''}`,
            ariaOverride: ariaParts.join(', '),
            title: preview
          });
        }
      }

      const summary = pills.map(p => `${p.label} ${p.value} (${describe(p.cls)})`).join(', ');
      const html = pills.map(p => {
        const statusText = describe(p.cls);
        const aria = p.ariaOverride || `${p.label}: ${p.value}, Status: ${statusText}`;
        const titleAttr = p.title ? ` title="${escapeAttr(p.title)}"` : '';
        return `<span class="pill ${p.cls}" role="status" aria-label="${aria}"${titleAttr}><span class="dot" aria-hidden="true"></span>${p.label}: ${p.value}</span>`;
      }).join(' ');

      if (statusEl) {
        statusEl.innerHTML = '';
        statusEl.style.display = 'none';
      }
      if (statusTop) {
        statusTop.innerHTML = html;
        statusTop.style.display = 'flex';
        statusTop.setAttribute('aria-label', `Tagesaufnahme: ${summary}`);
      }
    } finally {
      recordPerfStat('header_intake', startedAt);
    }
  }, 150);

  // SUBMODULE: refreshCaptureIntake @extract-candidate - laedt Intake-Daten und synchronisiert Pills/UI
  async function refreshCaptureIntake(){
    const wrap = document.getElementById('cap-intake-wrap');
    if (!wrap) return;
    const dayIso = document.getElementById('date')?.value || todayStr();
    captureIntakeState.dayIso = dayIso;
    clearCaptureIntakeInputs();

  const logged = await isLoggedInFast();
  // Unknown-Phase: so tun, als ob weiter eingeloggt (keine Sperre!)
  const effectiveLogged = (__authState === 'unknown' && __lastLoggedIn) ? true : !!logged;
  captureIntakeState.logged = effectiveLogged;

  if (!effectiveLogged){
    captureIntakeState.totals = { water_ml: 0, salt_g: 0, protein_g: 0 };
    setCaptureIntakeDisabled(true);
    updateCaptureIntakeStatus();
    try{ __lsTotals = { water_ml: 0, salt_g: 0, protein_g: 0 }; updateLifestyleBars(); }catch(_){ }
    return;
  }

  setCaptureIntakeDisabled(false);
  try{
    const uid = await getUserId();
    // Unknown-Phase: UID kann transient null sein -> NICHT sperren
    if (!uid && __authState !== 'unknown'){
      captureIntakeState.logged = false;
      captureIntakeState.totals = { water_ml: 0, salt_g: 0, protein_g: 0 };
      setCaptureIntakeDisabled(true);
    } else {
        const totals = await loadIntakeToday({ user_id: uid, dayIso });
        captureIntakeState.totals = totals || { water_ml: 0, salt_g: 0, protein_g: 0 };
        captureIntakeState.logged = true;
        try{ __lsTotals = captureIntakeState.totals; updateLifestyleBars(); }catch(_){ }
      }
    }catch(e){
      captureIntakeState.totals = { water_ml: 0, salt_g: 0, protein_g: 0 };
      try {
        diag.add?.('Capture intake load error: ' + (e?.message || e));
        updateLifestyleBars();
      } catch(_) { }
    }

    __lastKnownToday = todayStr();
    updateCaptureIntakeStatus();
  }

  // SUBMODULE: handleCaptureIntake @internal - validiert Intake-Eingaben, triggert RPC-Speicherpfad und Refresh-Fallbacks
  async function handleCaptureIntake(kind){
    const btn = document.getElementById(`cap-${kind}-add-btn`);
    const input = document.getElementById(`cap-${kind}-add`);
    if (!btn || !input) return;

    diag.add?.(`[capture] click ${kind}`);

    try {
      if (!AppModules.captureGlobals.getDateUserSelected()) {
        const todayIso = todayStr();
        const dateEl = document.getElementById('date');
        const selected = dateEl?.value || '';
        const stateDay = captureIntakeState.dayIso || '';
        if (stateDay !== todayIso || (selected && selected !== todayIso)) {
          await maybeRefreshForTodayChange({ force: true, source: 'capture:intake-click' });
        }
      }
    } catch(_){ }

    const dayIso = document.getElementById('date')?.value || todayStr();
    captureIntakeState.dayIso = dayIso;

    let value;
    if (kind === 'water'){
      value = Number(input.value);
      if (!(value > 0)){
        uiError('Bitte gueltige Wassermenge eingeben.');
        diag.add?.('[capture] blocked: invalid water value ' + input.value);
        return;
      }
    } else {
      value = toNumDE(input.value);
      if (!(value > 0)){
        uiError(kind === 'salt' ? 'Bitte gueltige Salzmenge eingeben.' : 'Bitte gueltige Proteinmenge eingeben.');
        diag.add?.(`[capture] blocked: invalid ${kind} value ${input.value}`);
        return;
      }
    }
    diag.add?.(`[capture] parsed ${kind}=${value}`);

    const totals = { ...captureIntakeState.totals };
    let message = '';
    if (kind === 'water'){
      const total = Math.max(0, Math.min(MAX_WATER_ML, (totals.water_ml || 0) + value));
      totals.water_ml = Math.round(total);
      message = 'Wasser aktualisiert.';
    } else if (kind === 'salt'){
      const total = Math.max(0, Math.min(MAX_SALT_G, (totals.salt_g || 0) + value));
      totals.salt_g = Number(total.toFixed(2));
      message = 'Salz aktualisiert.';
    } else {
      const total = Math.max(0, Math.min(MAX_PROTEIN_G, (totals.protein_g || 0) + value));
      totals.protein_g = Number(total.toFixed(2));
      message = 'Protein aktualisiert.';
    }
    diag.add?.(`[capture] totals ${JSON.stringify(totals)}`);

  withBusy(btn, true);
  try{
      diag.add?.(`[capture] save start ${kind}: ${JSON.stringify(totals)}`);
      await saveIntakeTotalsRpc({ dayIso, totals });
      diag.add?.('[capture] save network ok');
      captureIntakeState.totals = totals;
      captureIntakeState.logged = true;
      input.value = '';
      updateCaptureIntakeStatus();
      const needsLifestyle = dayIso === todayStr();
      requestUiRefresh({
        reason: 'capture:intake',
        doctor: false,
        chart: false,
        appointments: false,
        lifestyle: needsLifestyle
      }).catch(err => {
        diag.add?.('ui refresh err: ' + (err?.message || err));
      });
      uiInfo(message);
      diag.add?.(`[capture] save ok ${kind}`);
    }catch(e){
      const msg = e?.details || e?.message || e;
      if (e?.status === 401 || e?.status === 403) {
        showLoginOverlay(true);
        uiError('Bitte erneut anmelden, um weiter zu speichern.');
      } else {
        uiError('Update fehlgeschlagen: ' + msg);
      }
      diag.add?.(`[capture] save error ${kind}: ` + msg);
    }finally{
      withBusy(btn, false);
    }
  }

  // SUBMODULE: bindIntakeCapture @extract-candidate - verbindet Intake-Inputs mit Save/Guard Flows
  function bindIntakeCapture(){
    const wire = (id, kind) => {
      const oldBtn = document.getElementById(id);
      if (!oldBtn) return;

      // alten Button durch Clone ersetzen => entfernt alle alten Listener
      const fresh = oldBtn.cloneNode(true);
      oldBtn.replaceWith(fresh);

      // Safety: niemals "busy"/disabled, und Typ setzen
      fresh.disabled = false;
      fresh.classList.remove('busy');
      fresh.removeAttribute('aria-busy');
      fresh.removeAttribute('data-busy');
      if (!fresh.type) fresh.type = 'button';

      // Click-Handler binden (idempotent, weil frisch)
      fresh.addEventListener('click', () => {
        try { handleCaptureIntake(kind); } catch(_) {}
      });
    };

    wire('cap-water-add-btn',   'water');
    wire('cap-salt-add-btn',    'salt');
    wire('cap-protein-add-btn', 'protein');
  }

  function setProgState(el, state){
    if (!el) return;
    el.classList.remove('ok','warn','bad');
    if (state) el.classList.add(state);
  }

  function fmtDE(n, digits){
    if (!Number.isFinite(n)) return '0';
    return n.toFixed(digits).replace('.', ',');
  }

  function updateLifestyleBars(){
    const wBar = document.getElementById('ls-water-bar');
    const wProg = document.getElementById('ls-water-prog');
    const wLbl = document.getElementById('ls-water-label');
    const sBar = document.getElementById('ls-salt-bar');
    const sProg = document.getElementById('ls-salt-prog');
    const sLbl = document.getElementById('ls-salt-label');
    const pBar = document.getElementById('ls-protein-bar');
    const pProg = document.getElementById('ls-protein-prog');
    const pLbl = document.getElementById('ls-protein-label');

    const w = Math.max(0, Math.min(__lsTotals.water_ml || 0, MAX_WATER_ML));
    const s = Math.max(0, Math.min(__lsTotals.salt_g || 0, MAX_SALT_G));
    const p = Math.max(0, Math.min(__lsTotals.protein_g || 0, MAX_PROTEIN_G));

    const wPct = Math.min(1, w / LS_WATER_GOAL) * 100;
    const sPct = Math.min(1, s / LS_SALT_MAX) * 100;
    const pPct = Math.min(1, p / LS_PROTEIN_GOAL) * 100;

    if (wBar) wBar.style.width = `${wPct.toFixed(1)}%`;
    if (sBar) sBar.style.width = `${sPct.toFixed(1)}%`;
    if (pBar) pBar.style.width = `${pPct.toFixed(1)}%`;

    if (wLbl) {
      let status = '';
      if (w >= LS_WATER_GOAL * 1.1) status = ' * Ziel erreicht';
      else if (w >= LS_WATER_GOAL * 0.9) status = ' * Zielbereich';
      else if (w >= LS_WATER_GOAL * 0.5) status = ' * moderate Aufnahme';
      else status = ' * niedrig';
      wLbl.textContent = `${w|0} / ${LS_WATER_GOAL} ml${status}`;
    }

    if (sLbl) {
      let status = ' * Zielbereich';
      if (s > LS_SALT_MAX) status = ' * ueber Ziel';
      else if (s >= 5) status = ' * Warnung';
      sLbl.textContent = `${fmtDE(s,1)} / ${fmtDE(LS_SALT_MAX,1)} g${status}`;
    }

    if (pLbl) {
      let status = ' * noch offen';
      if (p >= 78 && p <= 90) status = ' * Zielbereich';
      else if (p > 90) status = ' * ueber Ziel';
      pLbl.textContent = `${fmtDE(p,1)} / ${fmtDE(LS_PROTEIN_GOAL,1)} g${status}`;
    }

    // Wasser: <50% rot, 50-89% gelb, 90% gruen
    let wState = 'bad';
    if (w >= LS_WATER_GOAL * 0.9) wState = 'ok';
    else if (w >= LS_WATER_GOAL * 0.5) wState = 'warn';
    setProgState(wProg, wState);

    // Salz: 0-4.9 g gruen, 5-6 gelb, >6 rot
    let sState = 'ok';
    if (s > LS_SALT_MAX) sState = 'bad';
    else if (s >= 5) sState = 'warn';
    setProgState(sProg, sState);

    // Protein: <78 neutral, 78-90 gruen, >90 rot
    let pState = 'neutral';
    if (p >= 78 && p <= 90) pState = 'ok';
    else if (p > 90) pState = 'bad';
    setProgState(pProg, pState);
  }

  async function renderLifestyle(){
    const logged = await isLoggedIn();
    if (!logged){
      // Nichts anzeigen, Tab ist ohnehin gesperrt
      return;
    }
    try{
      const uid = await getUserId();
      const dayIso = todayStr();
      const cur = await loadIntakeToday({ user_id: uid, dayIso });
      __lsTotals = { water_ml: cur.water_ml||0, salt_g: cur.salt_g||0, protein_g: cur.protein_g||0 };
      updateLifestyleBars();
    }catch(_){ /* ignore */ }
  }

  function bindLifestyle(){
    const addWaterBtn = document.getElementById('ls-water-add-btn');
    const addSaltBtn = document.getElementById('ls-salt-add-btn');
    const addProtBtn = document.getElementById('ls-protein-add-btn');

    const addWater = async ()=>{
      const el = document.getElementById('ls-water-add');
      const v = Number(el?.value || 0);
      if (!(v>0)) { uiError('Bitte gueltige Wassermenge eingeben.'); return; }

      const dayIso = todayStr();
      let total = Math.max(0, Math.min(MAX_WATER_ML, (__lsTotals.water_ml||0) + v));
      try{
        await saveIntakeTotalsRpc({ dayIso, totals: { water_ml: total, salt_g: __lsTotals.salt_g||0, protein_g: __lsTotals.protein_g||0 } });
        __lsTotals.water_ml = total;
        updateLifestyleBars();
        el.value = '';
        uiInfo('Wasser aktualisiert.');
    }catch(e){
      uiError('Update fehlgeschlagen: ' + (e?.message||e));
      try {
        diag.add?.('Lifestyle update error (water): ' + (e?.message||e));
      } catch (logErr) {
        console.error('diag.add failed', logErr);
      }
    }
    };

    const addSalt = async ()=>{
      const el = document.getElementById('ls-salt-add');
      const v = toNumDE(el?.value);
      if (!(v>0)) { uiError('Bitte gueltige Salzmenge eingeben.'); return; }
      const dayIso = todayStr();
      let total = Math.max(0, Math.min(MAX_SALT_G, (__lsTotals.salt_g||0) + v));
      try{
        await saveIntakeTotalsRpc({ dayIso, totals: { water_ml: __lsTotals.water_ml||0, salt_g: total, protein_g: __lsTotals.protein_g||0 } });
        __lsTotals.salt_g = total;
        updateLifestyleBars();
        el.value = '';
        uiInfo('Salz aktualisiert.');
    }catch(e){
      uiError('Update fehlgeschlagen: ' + (e?.message||e));
      try {
        diag.add?.('Lifestyle update error (salt): ' + (e?.message||e));
      } catch (logErr) {
        console.error('diag.add failed', logErr);
      }
    }
    };

    const addProtein = async ()=>{
      const el = document.getElementById('ls-protein-add');
      const v = toNumDE(el?.value);
      if (!(v>0)) { uiError('Bitte gueltige Proteinmenge eingeben.'); return; }
      const dayIso = todayStr();
      let total = Math.max(0, Math.min(MAX_PROTEIN_G, (__lsTotals.protein_g||0) + v));
      try{
        await saveIntakeTotalsRpc({ dayIso, totals: { water_ml: __lsTotals.water_ml||0, salt_g: __lsTotals.salt_g||0, protein_g: total } });
        __lsTotals.protein_g = total;
        updateLifestyleBars();
        el.value = '';
        uiInfo('Protein aktualisiert.');
    }catch(e){
      uiError('Update fehlgeschlagen: ' + (e?.message||e));
      try {
        diag.add?.('Lifestyle update error (protein): ' + (e?.message||e));
      } catch (logErr) {
        console.error('diag.add failed', logErr);
      }
    }
    };

    if (addWaterBtn) addWaterBtn.addEventListener('click', addWater);
    if (addSaltBtn) addSaltBtn.addEventListener('click', addSalt);
    if (addProtBtn) addProtBtn.addEventListener('click', addProtein);
  }


  /** MODULE: CAPTURE (Intake)
   * intent: Panel Resets & Tastatur-Shortcuts
   * contracts: verbindet BP-/BODY-Panels und setzt UI-Kontext zurueck
   * exports: resetBodyPanel, resetCapturePanels, addCapturePanelKeys
   */
  const getResetBodyPanel = () => {
  const mod = global.AppModules?.body;
  if (mod && typeof mod.resetBodyPanel === 'function') return mod.resetBodyPanel;
  if (typeof global.resetBodyPanel === 'function') return global.resetBodyPanel;
  return null;
};
  function resetCapturePanels(opts = {}) {
    const { focus = true } = opts;
    resetBpPanel('M', { focus: false });
    resetBpPanel('A', { focus: false });
    const resetBodyPanelFn = getResetBodyPanel();
    if (resetBodyPanelFn) resetBodyPanelFn({ focus: false });
    const ctxSel = document.getElementById('bpContextSel');
    if (ctxSel) ctxSel.value = 'M';
    document.querySelectorAll('.bp-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.context === 'M');
    });
    window.AppModules?.bp?.updateBpCommentWarnings?.();
    if (focus) {
      const first = document.getElementById('captureAmount');
      if (first) first.focus();
    }
  }
  function addCapturePanelKeys(){
    const bind = (selectors, onEnter, onEsc) => {
      document.querySelectorAll(selectors).forEach(el => {
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); }
          if (e.key === 'Escape') { e.preventDefault(); onEsc?.(); }
        });
      });
    };
    bind('#captureAmount, #diaM, #pulseM, #bpCommentM', () => document.getElementById('saveBpPanelBtn')?.click(), () => resetBpPanel('M'));
    bind('#sysA, #diaA, #pulseA, #bpCommentA', () => document.getElementById('saveBpPanelBtn')?.click(), () => resetBpPanel('A'));
    const resetBodyPanelFn = getResetBodyPanel();
    bind('#weightDay, #input-waist-cm, #fatPctDay, #musclePctDay', () => document.getElementById('saveBodyPanelBtn')?.click(), () => resetBodyPanelFn?.());
  }

  initTrendpilotCaptureHook();

  const captureApi = {
    clearCaptureIntakeInputs: clearCaptureIntakeInputs,
    refreshCaptureIntake: refreshCaptureIntake,
    handleCaptureIntake: handleCaptureIntake,
    setCaptureIntakeDisabled: setCaptureIntakeDisabled,
    prepareIntakeStatusHeader: prepareIntakeStatusHeader,
    updateCaptureIntakeStatus: updateCaptureIntakeStatus,
    millisUntilNextMidnight: millisUntilNextMidnight,
    handleMidnightRefresh: handleMidnightRefresh,
    scheduleMidnightRefresh: scheduleMidnightRefresh,
    maybeResetIntakeForToday: maybeResetIntakeForToday,
    scheduleNoonSwitch: scheduleNoonSwitch,
    maybeRefreshForTodayChange: maybeRefreshForTodayChange,
    bindIntakeCapture: bindIntakeCapture,
    renderLifestyle: renderLifestyle,
    bindLifestyle: bindLifestyle,
    resetCapturePanels: resetCapturePanels,
    addCapturePanelKeys: addCapturePanelKeys,
    updateLifestyleBars: updateLifestyleBars,
    fmtDE: fmtDE
  };
  appModules.capture = Object.assign(appModules.capture || {}, captureApi);
  Object.entries(captureApi).forEach(([name, fn]) => {
    if (typeof global[name] === 'undefined') {
      global[name] = fn;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);

