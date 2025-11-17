# Future Refactors

Sammlung größerer Umbauideen, die nach Phase 5 in Angriff genommen werden können.

---

## 1. Supabase Proxy abschaffen

- `app/supabase.js` ersetzt aktuell alle legacy `window.SupabaseAPI.*`-Aufrufe durch die neuen `app/supabase/*`-Module.
- ToDo: die verbleibenden Legacy-Skripte (`assets/js/main.js`, `assets/js/ui*.js`, `assets/js/data-local.js`) nach `app/` migrieren und auf modulare Imports (`app/supabase/index.js`) umstellen.
- Wenn keine Globals mehr benötigt werden: `app/supabase.js` löschen, `index.html` lädt nur noch das ESM-Barrel.

## 2. Legacy UI/Main Skripte modularisieren

- `assets/js/main.js`, `ui.js`, `ui-layout.js`, `ui-tabs.js`, `data-local.js` usw. sind die letzten großen Dateien außerhalb von `app/`.
- Plan: in kleinere Module aufteilen (`app/modules/ui/*`, `app/core/local-data.js`), MODULE-/SUBMODULE-Header setzen, Tests/Docs nachziehen.

## 3. Diagnostics Monitor erweitern

- Aktuell nur Heartbeats/Logger. Denkbare Erweiterungen:
  - UI-Overlay mit Live-Status (`diagnosticsLayer.monitor.isActive()`).
  - Remote-Upload für Logger/Perf-Snapshots (Supabase Function).
  - Konfigurierbare Perf-Buckets via Config (`DIAGNOSTICS_PERF_KEYS`).

## 4. Assistant Implementierung

- Readiness steht (`app/modules/assistant/` + Doc).
- Nächster Schritt: echtes KI-Modul planen (Supabase Functions, Prompt Handling, UI-Panel).

## 5. PWA/TWA Umsetzung

- Ordner/Placeholders vorhanden (`public/sw`, `public/twa/Android`, Manifest).
- Als nächster Brocken: Service Worker + Caching-Strategie implementieren, Manifest finalisieren, TWA-Projekt (Bubblewrap) vorbereiten, QA & Release-Docs ergänzen.
