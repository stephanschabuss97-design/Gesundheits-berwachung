'use strict';
/**
 * MODULE: supabase/auth/index.js
 * Description: Zentraler Barrel für Authentifizierungs-Module (Core, UI, Guard) zur Bereitstellung eines einheitlichen Import-Points.
 * Submodules:
 *  - re-exports (Core, UI, Guard)
 */

// SUBMODULE: re-exports @public - vereint Auth-Komponenten in einem zentralen Barrel
export * from './core.js';
export * from './ui.js';
export * from './guard.js';
