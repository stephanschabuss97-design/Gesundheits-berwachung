'use strict';
/**
 * MODULE: supabase/auth/index.js
 * intent: Zentraler Barrel für alle Authentifizierungs-Module (Core, UI, Guard)
 * exports: Core-, UI- und Guard-APIs (re-export)
 * version: 1.8.2
 * compat: ESM + Monolith (Hybrid)
 * notes:
 *   - Aggregiert die Teilmodule aus ./core.js, ./ui.js und ./guard.js
 *   - Dient als einheitlicher Import-Entry-Point für Supabase-Auth-Funktionen
 * author: System Integration Layer (M.I.D.A.S. v1.8)
 */

// SUBMODULE: re-exports @public - vereint Auth-Komponenten
export * from './core.js';
export * from './ui.js';
export * from './guard.js';
