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
import { SupabaseAPI } from "./supabase/index.js";

// SUBMODULE: bootAuth @public - initialisiert Auth-Callbacks und synchronisiert UI mit Login-Status
const bootAuth = () => {
  SupabaseAPI.initAuth?.({
    onStatus: (status) => console.info("Auth status:", status),
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

// SUBMODULE: DOMContentLoaded handler @internal - startet Auth-Initialisierung beim Laden des Dokuments
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAuth, { once: true });
} else {
  bootAuth();
}
