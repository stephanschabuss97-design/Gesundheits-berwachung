# Profile Module Overview

**Status:** Phase 4.3 (Health-Profil & Persona Layer)

Das Profil-Modul ersetzt das frühere Hilfe-Panel (Orbit Nord-West) und hält persönliche Gesundheitsparameter bereit, die Charts und Assistant verwenden. Grundlage ist die Supabase-Tabelle `user_profile` (vgl. `sql/10_User_Profile_Ext.sql`).

---

## 1. Purpose

- Einmalige Pflege der Stammdaten (Name, Geburtsdatum, Größe, CKD-Stufe, Medikation).
- Konfigurierbare Limits für Salz (g/Tag) und Protein (g/Tag) – Butler kann bei Foto/Text-Analysen davor warnen.
- Hinweis auf Lifestyle/Notizen (z. B. Training, Ärztliche Vorgaben).
- Trigger für andere Module (`profile:changed`), damit Charts BMI/WHtR korrekt berechnen und der Assistant aktuellen Kontext erhält.

---

## 2. UI Surface

- Orbit Nord-West (`data-hub-module="profile"`) öffnet `#hubProfilePanel`.
- Aufbau analog Terminpanel: scrollbarer Body, Formular oben, Abschnitt „Aktuelle Daten“ unten.
- Formularfelder / DOM-IDs:
  - `profileFullName`, `profileBirthDate`, `profileHeightCm`.
  - `profileCkdStage` (Dropdown: G2 bis G5, inkl. G3a/b A1/A2).
  - `profileMedications` (Textarea, freies Format).
  - `profileSaltLimit`, `profileProteinMax`.
  - `profileSmokeStatus` (Dropdown Nichtraucher/Raucher).
  - `profileLifestyleNote`.
  - Buttons `profileSaveBtn` (Upsert) und `profileRefreshBtn`.
- „Aktuelle Daten“ (`#profileOverview`) rendert nach jedem Save/Refresh eine kompakte Liste.

---

## 3. Data Flow & Supabase

- Tabelle `user_profile`: Spalten `user_id` (PK/ FK auth.users), `full_name`, `birth_date`, `height_cm`, `ckd_stage`, `medications` (jsonb/String), `is_smoker`, `lifestyle_note`, `salt_limit_g`, `protein_target_max`, `updated_at`.
- RLS: Zugriff ausschließlich auf `auth.uid() = user_id`.
- Modul verwendet `ensureSupabaseClient()` + `getUserId()` und ruft `supabase.from('user_profile').upsert({ user_id, … }, { onConflict: 'user_id' })`.
- Nach Erfolg fire `profile:changed` (CustomEvent), sodass andere Module reagieren können (`window.addEventListener('profile:changed', handler)`).

---

## 4. Frontend Module (`app/modules/profile/index.js`)

- `init()`:
  - `ensureRefs()` bindet Inputs/Buttons.
  - Registriert Form Submit (`saveProfile`) und Refresh (`syncProfile`).
  - Hört auf `supabase:ready`, damit `syncProfile({ reason: 'boot' })` gleich beim Start ausgeführt wird.
- `saveProfile()`:
  - Validiert Numeric Felder (Salz/Protein).
  - Baut Payload (JSON für Medikamente optional).
  - `await supabase.from('user_profile').upsert(...)`.
  - Zeigt Toast + aktualisiert Overview.
- `syncProfile()` lädt vorhandenen Datensatz (`.select('*').eq('user_id')`), befüllt Inputs und rendert Overview.
- `renderOverview()` zeigt strukturierte Liste (Name, Geburtsdatum, Limits etc.).
- `notifyChange()` sendet `profile:changed` + Snapshot (z. B. via `detail.profile`), damit Charts/Assistant sofort neue Werte sehen.

---

## 5. Consumers

- **Charts** (`app/modules/charts/index.js`):
  - Liest Größe ausschließlich aus Profil (Fallback 183 cm entfernt).
  - Reagiert auf `profile:changed`, triggert BMI/WHtR Recompute.
- **Assistant** (`app/modules/hub/index.js`):
  - `refreshAssistantContext()` wartet auf `profile.getSnapshot()` und injiziert Limits/CKD/Medikation in den Butler-Header.
  - Edge Functions (`midas-assistant`, `midas-vision`) erhalten Profilwerte im Payload, sodass Foto-/Text-Analysen salz-/proteinbewusst antworten.
- **Roadmap/QA**: Phase 4.3 Einträge in `docs/QA_CHECKS.md` stellen CRUD + Event-Verhalten sicher.

---

## 6. QA Notes

- Save Fehlversuch (RLS/Offline) → Toast „Speichern fehlgeschlagen“ + `[profile] save failed` im Diag.
- Profil löschen ist nicht vorgesehen (Upsert überschreibt). Zum Zurücksetzen `UPDATE user_profile SET …` via Supabase SQL.
- Assistant/Charts müssen auch ohne Profil funktionieren -> Modul liefert `null` Snapshot, Butler zeigt „Profil fehlt – bitte ausfüllen“.

---

## 7. Next Steps

- Erweiterbare Felder (z. B. Zielblutdruck, Medikamenten-Tags) sobald Phase 5 Actions konkrete Regeln erfordern.
- Edge Function Prompting weiter verdichten (Persona short string + komprimierte Limits).
