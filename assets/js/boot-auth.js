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
const setConfigStatus = SupabaseAPI.setConfigStatus?.bind(SupabaseAPI) ?? (() => {});

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
  SupabaseAPI.initAuth?.({
    onStatus: (status) => {
      console.info("Auth status:", status);
      if (status && status !== 'unknown') {
        reportStatus('Session geprüft');
        advanceStageToInitCore();
      } else {
        reportStatus('Prüfe Session …');
      }
    },
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
      bootFlow.report?.('Prüfe Session …');
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
