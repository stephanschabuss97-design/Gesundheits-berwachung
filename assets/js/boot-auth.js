'use strict';
import { SupabaseAPI } from "./supabase/index.js";

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAuth, { once: true });
} else {
  bootAuth();
}
