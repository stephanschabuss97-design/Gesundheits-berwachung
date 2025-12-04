'use strict';
/**
 * MODULE: authBoot.js
 * Description: Initialisiert Supabase-Authentifizierung beim Laden der Seite und synchronisiert UI-Status mit dem globalen Auth-State.
 * Submodules:
 *  - imports (SupabaseAPI)
 *  - bootAuth (Initialisierung der Auth-Ereignisse)
 *  - DOMContentLoaded handler (autostart)
 */

// SUBMODULE: imports @internal - bindet zentrale Supabase-Schnittstelle ein
import { SupabaseAPI } from "../../app/supabase/index.js";

const getBootFlow = () => window.AppModules?.bootFlow || null;

// SUBMODULE: bootAuth @public - initialisiert Auth-Callbacks und synchronisiert UI mit Login-Status
const bootAuth = () => {
  const bootFlow = getBootFlow();
  const reportStatus = (msg) => {
    try {
      bootFlow?.report?.(msg);
    } catch (_) {
      /* ignore */
    }
  };
  const setLockReason = (reason) => {
    if (!bootFlow) return;
    if (reason) {
      bootFlow.lockReason = reason;
    } else {
      delete bootFlow.lockReason;
    }
  };
  let stageLifted = false;
  const advanceStageToInitCore = () => {
    try {
      const current = bootFlow?.getStage?.();
      if (!current || !bootFlow?.getStageIndex) return;
      const targetIdx = bootFlow.getStageIndex('INIT_CORE');
      const currentIdx = bootFlow.getStageIndex(current);
      if (currentIdx < targetIdx) {
        bootFlow.setStage?.('INIT_CORE');
      }
    } catch (_) {
      /* ignore */
    }
  };
  const handleAuthStatus = (status) => {
    const normalized =
      status === 'auth' || status === 'unauth'
        ? status
        : 'unknown';
    if (normalized === 'unknown') {
      setLockReason('auth-check');
      reportStatus('Pr\u00fcfe Session ...');
      return;
    }
    if (normalized === 'auth') {
      reportStatus('Session ok \u2013 MIDAS entsperrt.');
    } else {
      reportStatus('Nicht angemeldet \u2013 Login erforderlich.');
    }
    setLockReason(null);
    if (!stageLifted) {
      stageLifted = true;
      advanceStageToInitCore();
    }
  };

  // Initial guard während Supabase entscheidet
  setLockReason('auth-check');
  reportStatus('Pr\u00fcfe Session ...');

  SupabaseAPI.initAuth?.({
    onStatus: handleAuthStatus,
    onLoginOverlay: (visible) => {
      if (visible) {
        SupabaseAPI.showLoginOverlay?.(true);
      } else {
        SupabaseAPI.hideLoginOverlay?.();
      }
    },
    onUserUi: (email) => {
      SupabaseAPI.setUserUi?.(email || "");
    },
    onDoctorAccess: (enabled) => {
      SupabaseAPI.setDoctorAccess?.(enabled);
    }
  });
};

const scheduleBootAuth = () => {
  const bootFlow = getBootFlow();
  if (bootFlow) {
    bootFlow.whenStage('AUTH_CHECK', () => {
      bootAuth();
    });
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAuth, { once: true });
  } else {
    bootAuth();
  }
};

scheduleBootAuth();
