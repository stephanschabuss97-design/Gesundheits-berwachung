'use strict';
(function(global){
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;

  const MAX_WATER_ML = 6000;
  const MAX_SALT_G = 30;
  const MAX_PROTEIN_G = 300;
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

  // PATCH: bestehende day_flags eines Tages aktualisieren (RLS: nur eigene Records)
  // @refactor: moved to assets/js/supabase.js (patchDayFlags)

  // @refactor: moved to assets/js/supabase.js (appendNoteRemote)

  /** MODULE: CAPTURE (Intake)
   * intent: Panel hotkeys, save/reset flows und flag handling (Fortsetzung)
   * contracts: interagiert mit DATA ACCESS.saveBlock, UI.requestUiRefresh, AUTH Guards
   * exports: setProteinHigh, setTraining, setLowIntake, setSaltHigh
   * notes: Fortsetzung fuer Panel-Operationen (Hotkeys/Speichern)
   */

  /* ===== Save flows ===== */
  // Replace sugar toggle with protein (runtime migration for legacy layouts)
  // Migration entfernt: Markup nutzt direkt #proteinHighToggle
  // SUBMODULE: captureFlagToggles @internal - manages capture flag buttons and state cache
  let trainingActive=false,
      lowIntakeActive=false,
      sickActive=false,
      valsartanMissed=false,
      forxigaMissed=false,
      nsarTaken=false,
      saltHigh=false,
      proteinHigh=false;

  function getCaptureFlagsState(){
    return {
      trainingActive,
      lowIntakeActive,
      sickActive,
      valsartanMissed,
      forxigaMissed,
      nsarTaken,
      saltHigh,
      proteinHigh
    };
  }

  function setProteinHigh(on){
    proteinHigh = !!on;
    setToggle($("#proteinHighToggle"), proteinHigh, "&#x1F969; Protein >= 90 g (aktiv)", "&#x1F969; Protein >= 90 g");
  }
  function setToggle(el, on, activeText, baseText){
  el = el || null;
  if (!el) return;
  el.classList.toggle("active", !!on);
  el.setAttribute("aria-pressed", on ? "true" : "false");
  el.innerHTML = on ? activeText : baseText;
  }
  function setTraining(on){ trainingActive=!!on; setToggle($("#trainingToggle"), trainingActive, "&#x1F3CB;&#xFE0F; Training heute (aktiv)", "&#x1F3CB;&#xFE0F; Training heute"); }
  function setLowIntake(on){ lowIntakeActive=!!on; setToggle($("#lowIntakeToggle"), lowIntakeActive, "&#x1F4A7; < 2 L (aktiv)", "&#x1F4A7; < 2 L getrunken"); }
  function setSaltHigh(on){ saltHigh = !!on; setToggle($("#saltHighToggle"), saltHigh, "&#x1F9C2; > 5 g Salz (aktiv)", "&#x1F9C2; > 5 g Salz"); }
  // Kommentar-Pflicht fuer BP: Grenzwerte markieren
  /** END MODULE */

  /** MODULE: CAPTURE (Intake)
   * intent: Panel Resets, Flag-Hooks und Tastatur-Shortcuts (Fortsetzung)
   * contracts: verbindet BP-/BODY-Panels, nutzt CAPTURE State Toggles
   * exports: resetBodyPanel, resetFlagsPanel, resetCapturePanels, addCapturePanelKeys, setSick, setValsartanMiss, setForxigaMiss, setNsar
   * notes: Fortsetzung fuer Capture-Hilfsfunktionen (Resets/Toggles)
   */
  // SUBMODULE: resetFlagsPanel @internal - setzt Flag-Toggles und Kommentar auf Ausgangszustand
  const getResetBodyPanel = () => {
  const mod = global.AppModules?.body;
  if (mod && typeof mod.resetBodyPanel === 'function') return mod.resetBodyPanel;
  if (typeof global.resetBodyPanel === 'function') return global.resetBodyPanel;
  return null;
};

function resetFlagsPanel(opts = {}) {
    const { focus = true } = opts;
    try {
      setTraining(false);
      setLowIntake(false);
      setSick(false);
      setValsartanMiss(false);
      setForxigaMiss(false);
      setNsar(false);
      setSaltHigh(false);
      if (typeof setProteinHigh === 'function') setProteinHigh(false);
    } catch(_){ }
    const commentEl = document.getElementById('flagsComment');
    if (commentEl) commentEl.value = '';
    if (focus && commentEl) commentEl.focus();
  }
  // SUBMODULE: resetCapturePanels @internal - kombiniert Panel-Resets (BP/Body/Flags) und setzt Kontext zurueck
  function resetCapturePanels(opts = {}) {
    const { focus = true } = opts;
    resetBpPanel('M', { focus: false });
    resetBpPanel('A', { focus: false });
    const resetBodyPanelFn = getResetBodyPanel();
  if (resetBodyPanelFn) resetBodyPanelFn({ focus: false });
    resetFlagsPanel({ focus: false });
    const ctxSel = document.getElementById('bpContextSel');
    if (ctxSel) ctxSel.value = 'M';
    document.querySelectorAll('.bp-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.context === 'M');
    });
    try { updateBpCommentWarnings?.(); } catch(_){ }
    if (focus) {
      const first = document.getElementById('captureAmount');
      if (first) first.focus();
    }
  }
  // SUBMODULE: addCapturePanelKeys @internal - registriert Tastaturkuerzel fuer Save-/Reset-Flows
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
    bind('#flagsComment', () => document.getElementById('saveFlagsPanelBtn')?.click(), () => resetFlagsPanel());
  }
  // SUBMODULE: setSick @internal - setzt Krank-Flag und sperrt Forxiga-Toggle bei Bedarf
  function setSick(on){
  sickActive=!!on; setToggle($("#sickToggle"), sickActive, "&#x1F912; Krank (Forxiga pausiert) (aktiv)", "&#x1F912; Krank (Forxiga pausiert)");
  if(sickActive){ setForxigaMiss(true); $("#forxigaMissToggle").disabled=true; $("#forxigaMissToggle").style.opacity=0.6; }
  else { $("#forxigaMissToggle").disabled=false; $("#forxigaMissToggle").style.opacity=1; }
  }
  // SUBMODULE: setValsartanMiss @internal - pflegt Valsartan-vergessen Status und UI-Text
  function setValsartanMiss(on){ valsartanMissed=!!on; setToggle($("#valsartanMissToggle"), valsartanMissed, "&#x1F48A; Valsartan vergessen (aktiv)", "&#x1F48A; Valsartan vergessen"); }
  // SUBMODULE: setForxigaMiss @internal - pflegt Forxiga-vergessen Status inkl. Label
  function setForxigaMiss(on){ forxigaMissed=!!on; setToggle($("#forxigaMissToggle"), forxigaMissed, "&#x23F0; Forxiga vergessen (aktiv)", "&#x23F0; Forxiga vergessen"); }
  // SUBMODULE: setNsar @internal - pflegt NSAR-Flag und Screenreader-Label
  function setNsar(on){ nsarTaken=!!on; setToggle($("#nsarToggle"), nsarTaken, "&#x1F489; NSAR genommen (aktiv)", "&#x1F489; NSAR genommen"); }

  /** END MODULE */

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
    resetFlagsPanel: resetFlagsPanel,
    resetCapturePanels: resetCapturePanels,
    addCapturePanelKeys: addCapturePanelKeys,
    setProteinHigh: setProteinHigh,
    setTraining: setTraining,
    setLowIntake: setLowIntake,
    setSaltHigh: setSaltHigh,
    setSick: setSick,
    setValsartanMiss: setValsartanMiss,
    setForxigaMiss: setForxigaMiss,
    setNsar: setNsar,
    updateLifestyleBars: updateLifestyleBars,
    fmtDE: fmtDE,
    getCaptureFlagsState: getCaptureFlagsState
  };
  appModules.capture = Object.assign(appModules.capture || {}, captureApi);
  Object.entries(captureApi).forEach(([name, fn]) => {
    if (typeof global[name] === 'undefined') {
      global[name] = fn;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
