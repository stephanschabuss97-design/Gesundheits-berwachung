/**
 * MODULE: UI TABS
 * intent: Tab-Umschaltung, Header-Schatten und Bindings fuer Hauptansichten
 * exports: setTab, bindTabs, bindHeaderShadow
 * notes: Logik unveraendert aus index.html extrahiert
 */

// SUBMODULE: setTab @internal - steuert Tabwechsel inkl. Auth/Unlock Hooks
async function setTab(name) {
  if (name !== 'doctor' && document.body.classList.contains('app-locked')) {
    __pendingAfterUnlock = null;
    lockUi(false);
  }
  if (name === 'doctor') {
    const logged = await isLoggedInFast();
    if (!logged) {
      showLoginOverlay(true);
      return;
    }
    if (!__doctorUnlocked) {
      __pendingAfterUnlock = 'doctor';
      const ok = await requireDoctorUnlock();
      if (!ok) return;
      __pendingAfterUnlock = null;
    }
  }

  $$('.view').forEach(v => v.classList.remove('active'));
  $('#'+name).classList.add('active');
  $$('.tabs .btn').forEach(b => {
    const active = b.dataset.tab === name;
    b.classList.toggle('primary', active);
    if (active) {
      b.setAttribute('aria-current', 'page');
    } else {
      b.removeAttribute('aria-current');
    }
  });
  if (name === 'doctor') {
    await requestUiRefresh({ reason: 'tab:doctor' });
  }
  if (name === 'capture') {
    try {
      await refreshCaptureIntake();
      resetCapturePanels();
      updateBpCommentWarnings?.();
    } catch (_) {}
  }
}

// SUBMODULE: bindTabs @internal - verbindet Tabbuttons mit setTab
function bindTabs() {
  $$('.tabs .btn').forEach(b =>
    b.addEventListener('click', async e => {
      const tab = e.currentTarget.dataset.tab;
      if (tab === 'doctor') {
        const logged = await isLoggedInFast();
        if (!logged) {
          showLoginOverlay(true);
          return;
        }
      }
      setTab(tab);
    })
  );
}

// SUBMODULE: bindHeaderShadow @internal - toggelt Schatten bei Scroll
function bindHeaderShadow() {
  const header = document.querySelector('header');
  const tabs = document.querySelector('nav.tabs');
  if (!header) return;
  const update = () => {
    const scrolled = window.scrollY > 4;
    header.classList.toggle('is-elevated', scrolled);
    if (tabs) tabs.classList.toggle('is-elevated', scrolled);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
}
