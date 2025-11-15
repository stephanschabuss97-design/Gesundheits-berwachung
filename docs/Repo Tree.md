Gesundheits-Logger/
│
├── index.html                              # Einstiegspunkt / App-Shell (lädt app.js + app.css, enthält nur minimale Struktur (root, Panels, Overlays)
├── manifest.json                           # PWA-Manifest: Name, Scope, Icons, Farben
├── service-worker.js                       # Cache, Offline-Fallback, Update-Handler
├── .gitattributes                          ﻿# Handle line endings automatically for cross-platform consistency
├── .gitignore                              ﻿# Handles ignore list
├── .nojekyll                               # Empty file for Github help
│
├── assets/
│   ├── css/                                # 🎨 Zentrales Designsystem (UI & Theming)
│   │   │
│   │   ├── core/                          # 🔹 Basisschicht des gesamten visuellen Systems
│   │   │   ├── variables.css              # Alle globalen Design-Token: Farben, Fonts, Radius, Schatten
│   │   │   ├── base.css                   # CSS-Reset, Body-/Text-Styling, Headings, Links
│   │   │   ├── layout.css                 # Struktur-Layout: Flex/Grid, Panels, Container, Sections
│   │   │   ├── forms.css                  # Einheitliche Inputs, Buttons, Sliders, Switches
│   │   │   ├── components.css             # Wiederverwendbare UI-Elemente (Cards, Tabs, Akkordeons, Modals)
│   │   │   ├── animations.css             # Keyframes, Transitions, Microanimations
│   │   │   ├── utilities.css              # Hilfsklassen (.hidden, .mt-2, .flex, .text-center, .nowrap etc.)
│   │   │   └── themes.css                 # Farb-Overrides (Darkmode, High-Contrast, Custom-Theme)
│   │   │
│   │   └── app.css                        # Zentraler Composer – importiert alles aus /core/ → wird einmalig in index.html eingebunden
│   │
│   ├── js/                                 # ⚙️ Applogik & Datenfluss
│   │   │
│   │   ├── core/                           # 🧠 Zentrale App-Funktionen & globale States
│   │   │   ├── utils.js                    # Kleine Helferfunktionen, DOM-Tools, Formatierung
│   │   │   ├── diag.js                     # Diagnose/Debug-Interface (Logging-Wrapper)
│   │   │   ├── config.js                   # Laden/Speichern von App-Einstellungen (z. B. Theme, Sprache)
│   │   │   └── state.js                    # Globale Variablen & App-Status (Session, Flags, User)
│   │   │
│   │   ├── supabase_auth/                  # 🔐 Backend-Kommunikation & Authentifizierung
│   │   │   ├── client.js                   # Erstellt & verwaltet Supabase-Client
│   │   │   ├── http.js                     # fetchWithAuth, Token-Retry, Header-Cache
│   │   │   ├── state.js                    # Supabase-spezifische Zustände (Session, Header etc.)
│   │   │   ├── realtime.js                 # Realtime Events (Subscriptions, Channel Handling)
│   │   │   ├── core.js                     # Sessionhandling, Authstate, Hooks, getUserId()
│   │   │   ├── ui.js                       # Login-Overlay, Config-Formular, Google OAuth
│   │   │   ├── guard.js                    # Zugriffsschutz, LockScreen, WebAuthn, PIN-Logik
│   │   │   └── index.js                    # Barrel-Export für den gesamten Auth-Komplex
│   │   │
│   │   ├── login/                          # 🔓 Login-Screen + Biometrie
│   │   │   ├── index.js                    # Hauptlogik für den Login-Prozess
│   │   │   ├── ui.js                       # UI-Bindings (Inputs, Fehlermeldungen, Loginbutton)
│   │   │   ├── biometrics.js               # Browser-/Gerätebiometrie (Face, Fingerprint)
│   │   │   └── session.js                  # Sessionhandling während/zwischen Logins
│   │   │
│   │   ├── modules/                        # 📋 Hauptmodul nach Login (Dashboard mit Akkordeons)
│   │   │   ├── index.js                    # Capture-Init, Modul-Loader, Event-Routing
│   │   │   ├── ui.js                       # Interaktionslogik für Akkordeons & Panels
│   │   │   │
│   │   │   ├── appointment/                    # 📅 Arzttermine & Kalender (ehemals Juno)
│   │   │   │   ├── index.js                # Terminlogik & Integration ins Capture
│   │   │   │   └─── api.js                  # CRUD-Calls (fetch, patch, delete Termine)
│   │   │   │
│   │   │   ├── appointment_table/                  # Darstellung der Termine
│   │   │   │   ├── index.js               # Darstellung & Scrolllogik der Terminliste
│   │   │   │   └── ui.js                  # UI-Verhalten (Buttons, Edit, Delete, Highlight)
│   │   │   │
│   │   │   ├── intake/                         # 💧 Ernährung / Hydration / Proteine / Salz (ehemals Hebe)
│   │   │   │   ├── index.js                  # Hauptlogik für Tageswerte
│   │   │   │   ├── summary.js                # Tagesbilanz / Visualisierung
│   │   │   │   └── validation.js             # Eingabeprüfung (Zahlen, Grenzen, Plausibilität)
│   │   │   │
│   │   │   ├── bloodpressure/                     # ❤️ Blutdruck
│   │   │   │   ├── index.js                   # Initialisierung & Event-Bindings
│   │   │   │   ├── alerts.js                  # Feedbacklogik (Warnung, Kritisch, Kommentar)
│   │   │   │   └── calc.js                    # Mittelwerte, MAP, Trends
│   │   │   │ 
│   │   │   ├── body/                       # ⚖️ Körperdaten (Gewicht, BMI, Fett, Muskel)
│   │   │   │   ├── index.js                   # Eingabe, Validierung, Speicherung
│   │   │   │   └── calc.js                    # Berechnungen
│   │   │   │
│   │   │   ├── doctor_table/                # Darstellung der Blutdruck und Körperdaten
│   │   │   │   ├── index.js               # Arztpanel (Tab-Switch, Sichtbarkeit), Tabellenaufbau, Pagination, Filter
│   │   │   │   └── table.js               # Dynamisches Rendering der Wertezeilen
│   │   │   │
│   │   │   ├── doctor_chart/                       # SVG Chart zur Darstellung der Daten
│   │   │   │   ├── index.js                # Entry Point für Chartdarstellung
│   │   │   │   ├── render.js               # Canvas-/SVG-Renderlogik
│   │   │   │   ├── scales.js               # Achsen, Units, Responsiveness
│   │   │   │   └── utils.js                # Reusable Chart-Helferfunktionen
│   │   │   │
│   │   │   ├── training/                       # Trainingseingabe und Übersicht (ehemals Apollon)
│   │   │   │   ├── index.js                   # Eingabe, Validierung, Speicherung
│   │   │   │   └── calc.js                    # Berechnungen
│   │   │   │
│   │   │   ├── training_table/             #Darstellung der Trainingsübersicht
│   │   │   │   ├── index.js               # Traininspanel, Tabellenaufbau, Pagination, Filter
│   │   │   │   └── table.js               # Dynamisches Rendering der Wertezeilen
│   │   │   │
│   │   │   └── assistant/                       # 🤖 KI-Modul (vormals Zeus)
│   │   │       ├── index.js                     # Entry Point / Request-Handler
│   │   │       ├── prompts.js                   # Prompt-Templates (Analyse, Feedback, Drift)
│   │   │       ├── api.js                       # OpenAI API Wrapper / Fetcher
│   │   │       └── parser.js                    # Antwortinterpretation & Mapping (Warnungen etc.)
│   │   │
│   │   ├── diagnostics/                       # 🧪 Entwickler-Werkzeuge (nicht aktiv im Release)
│   │   │   ├── logger.js                      # Zentrales Logging (AppEvents, Errors)
│   │   │   ├── perf.js                       # Performance-Tracking (Ladezeiten, Deltas)
│   │   │   └── monitor.js                    # UI-Overlay zum Debuggen in Echtzeit
│   │   │
│   │   └── app.js                            # 🌐 App-Orchestrator (Init, Eventbus, Lifecycle)
│   │                                          # verbindet Login → Capture → Doctorflow
│   │
│   ├── img/
│   │   ├── icons/                            # App-/UI-Icons
│   │   ├── logos/                            # Branding / Splashscreens
│   │   └── ui/                               # sonstige grafische Assets (z. B. Illustrationen)
│   │
│   └── fonts/
│       └── inter/                            # Primärschrift (Inter-Regular, -Medium, -Bold)
│
└── docs/                                      # 📖 Dokumentation & Qualitätsmanagement
│    ├── CHANGELOG.md                         # Versionierung der Änderungen
│    ├── QA_CHECKS.md                         # Testkriterien, Sanity Checks, Smoke Tests
│    ├── ARCHITECTURE.md                      # Technische Architekturübersicht
│    └── ROADMAP.md                           # Entwicklungsplanung / Milestones
│
│
└── sql/                                      # 🧩 Supabase-Struktur (ein Ordner, klar abgegrenzt)
     ├── SQL_skript1.sql                      # Reset / Drop & Recreate
     └── SQL_skript2.sql                      # Policies, Grants, RLS --> hier folgen noch weitere Skirpte.