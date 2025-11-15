# Repository Tree – Proposed Modular Layout (v2)

```
Gesundheits-Logger/
│
├── index.html                       # Einstiegspunkt / App-Shell (lädt app/app.js + app/app.css)
├── manifest.json                    # PWA-Manifest
├── service-worker.js                # Cache-/Update-Logik
├── .gitattributes
├── .gitignore
├── .nojekyll
│
├── app/                             # 🌐 Komplettes App-Bundle
│   ├── app.js                       # Orchestrator – bootet Auth → Modules → Router
│   ├── app.css                      # sammelt CSS aus /styles
│   │
│   ├── core/                        # Basisschicht (früher assets/js/core + supabase core)
│   │   ├── config.js                # Flags, Feature-Switches
│   │   ├── utils.js                 # DOM/Format-Helfer
│   │   ├── diag.js                  # Diagnose/Touch-Log-Interface
│   │   ├── state.js                 # Globaler State (Session, Flags)
│   │   └── router.js                # requestUiRefresh, Tab-Logik, Eventbus
│   │
│   ├── supabase/                    # Backend-Kommunikation + Auth
│   │   ├── client.js                # Supabase Client Factory
│   │   ├── http.js                  # fetchWithAuth, Header Cache
│   │   ├── auth/                    # Login, watchAuthState, guard
│   │   │   ├── index.js
│   │   │   ├── ui.js                # Login-Overlay
│   │   │   └── guard.js             # Unlock Flow (Passkey/PIN)
│   │   ├── api/                     # REST/RPC Layer
│   │   │   ├── intake.js
│   │   │   ├── vitals.js
│   │   │   ├── notes.js
│   │   │   ├── system-comments.js
│   │   │   └── select.js / push.js
│   │   └── index.js                 # Barrel – exportiert SupabaseAPI + `supabase:ready`
│   │
│   ├── modules/                     # Feature-Module
│   │   ├── capture/                 # Tageserfassung (Hauptview)
│   │   │   ├── capture.globals.js
│   │   │   ├── intake.js
│   │   │   ├── bloodpressure/
│   │   │   │   ├── index.js
│   │   │   │   ├── alerts.js
│   │   │   │   └── calc.js
│   │   │   ├── body/
│   │   │   │   ├── index.js
│   │   │   │   └── calc.js
│   │   │   └── ui.js                # Accordion + Buttons
│   │   │
│   │   ├── doctor/                  # Arztansicht + Trendpilot UI
│   │   │   ├── index.js             # Render, Scroll-Restore, Aktionen
│   │   │   ├── table.js             # Tagescards/Grid
│   │   │   ├── trendpilot-block.js
│   │   │   └── chart-button.js
│   │   │
│   │   ├── charts/                  # SVG-Charts
│   │   │   ├── index.js             # Entry (chartPanel)
│   │   │   ├── render.js / scales.js / legend.js / animations.js
│   │   │   └── chart.css            # (importiert nach app.css)
│   │   │
│   │   ├── trendpilot/              # Trendanalyse-Modul
│   │   │   ├── data.js
│   │   │   ├── index.js
│   │   │   └── hooks.js             # optional: Capture/Doctor Integration
│   │   │
│   │   ├── appointments/            # zukünftiges Terminmodul (Juno)
│   │   ├── training/                # zukünftiges Trainingsmodul (Apollon)
│   │   └── assistant/               # KI-Modul (Zeus) – API + Prompt-Handling
│   │
│   ├── styles/                      # 🎨 Designsystem (Nachfolger von assets/css/core)
│   │   ├── variables.css
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── forms.css
│   │   ├── components.css
│   │   ├── animations.css
│   │   ├── utilities.css
│   │   └── themes.css
│   │
│   └── diagnostics/                 # 🧪 Dev-Tools
│       ├── logger.js
│       ├── perf.js
│       └── monitor.js
│
├── public/                          # Statische Assets
│   ├── img/
│   │   ├── icons/
│   │   ├── logos/
│   │   └── ui/
│   └── fonts/
│       └── inter/
│
├── docs/                            # 📖 Dokumentation
│   ├── Repo Tree.md (legacy)
│   ├── Repo Tree v2.md (dieses Dokument)
│   ├── modules/                     # Module Overviews (Trendpilot, Charts, Doctor, Intake, Capture, Supabase Core, Auth, Main Router, Unlock, State)
│   ├── CHANGELOG.md
│   ├── QA_CHECKS.md
│   ├── ARCHITECTURE.md
│   └── ROADMAP.md
│
└── sql/                             # 🧩 Supabase Skripte
    ├── 00_reset.sql
    ├── 01_schema.sql
    ├── 02_policies.sql
    └── … (appointments, training etc.)
```

**Hinweis:**  
Dieses Layout spiegelt die aktuelle Modulaufteilung wider und schafft klare Orte für zukünftige Features (Appointments, Training, Assistant). CSS & JS liegen konsequent unter `app/`, statische Assets unter `public/`. Die bestehenden Overview-Dokumente leben unter `docs/modules/`, sodass neue Contributor sofort den Einstieg finden.
