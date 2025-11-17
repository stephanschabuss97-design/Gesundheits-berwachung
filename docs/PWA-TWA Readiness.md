# PWA / TWA Readiness – Phase 4

Dieses Dokument fasst die Vorbereitungen für Progressive Web App (PWA) und Trusted Web Activity (TWA) zusammen. Phase 4 erfordert nur Struktur + Readiness-Checks (keine Service-Worker- oder Android-Implementierung).

---

## 1. Zielsetzung

- PWA: Service Worker, Manifest, Offline-Caching vorbereiten, ohne Logik zu liefern.
- TWA: Ordnerstruktur für ein zukünftiges Android-Wrapper-Projekt (Gradle, Icons) schaffen.
- Docs/QA: klar dokumentieren, wo später Dateien liegen, welche Flags benötigt werden.

---

## 2. Struktur (aktuell)

| Pfad | Zweck |
|------|-------|
| `public/` | Basis für statische Assets, SW & Manifest-Platzhalter. |
| `public/sw/README.md` | Hinweis, dass hier Service-Worker-Code folgt. |
| `public/manifest-placeholder.json` | Dummy manifest (Name, Short Name, Display). |
| `public/twa/Android/README.md` | Platzhalter für Android-Projekt (Gradle/TWA). |

> TODO: Icons (`public/img/icons/*`), Splash Assets und finaler `manifest.json` folgen in der Implementierungsphase.

---

## 3. Readiness Checklist

- [x] `public/sw/` Ordner inkl. README.
- [x] `public/manifest-placeholder.json`.
- [x] `public/twa/Android/` Ordner inkl. README.
- [ ] SW/TWA Implementierung (separate Roadmap).
- [ ] QA Checks (Offline, Chrome TWA, Play Store) – erst nach Implementierung.

---

## 4. Nächste Schritte

1. Service Worker Spezifikation erstellen (Caching-Strategie, Update-Flow).
2. Manifest finalisieren (Icons, Scope, Categories, Lang).
3. TWA-Projekt mit Bubblewrap/Gradle aufbauen, Play Store Pipeline definieren.
4. QA-Abschnitte (`docs/QA_CHECKS.md`) erweitern, sobald SW/TWA live geht.

Bis dahin dient dieser Readiness-Check als Referenz, dass Struktur/Ordner bereits angelegt sind und zukünftige Arbeiten darauf aufsetzen können.
