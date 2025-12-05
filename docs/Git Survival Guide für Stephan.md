# 🧭 **Git Survival Guide für Stephan**

This document captures all essential Git workflows you need:
- A) Resetting branches safely  
- B) Cleaning up after Squash & Merge  
- C) Creating a local-only repo (e.g., for Zauberfile)  
- D) Creating new branches — correctly for GitHub & VS Code  
```bash
---

# A) 🔄 Clean Branch Reset (Local → Remote)
Use this when you want to return your branch to an old commit.

## 1. Commit finden
git log --oneline
Copy the commit ID (e.g., `0595096`).

## 2. Auf Branch wechseln
git checkout <branch>

## 3. Lokal zurücksetzen
git reset --hard <commit-id>

## 4. Remote angleichen
git push --force-with-lease origin <branch>

## 5. Kontrolle
git log --oneline -5
git status

---

# B) 🧹 Cleaning Up After Squash & Merge (Zombie-Branch-Fix)
If the branch is deleted on GitHub but still visible in VS Code:

## 1. Auf main wechseln
git checkout main

## 2. Lokalen Branch löschen
git branch -d <branchname>
If Git refuses:
git branch -D <branchname>

## 3. Remote-Tracking aufräumen
git fetch --prune

## 4. Optional: VS Code Refresh
Restart VS Code or refresh the Source Control view.

---

# C) 📁 Creating a Local-Only Repo (Zauberfile Setup)
Use this when you want a clean dev environment **without GitHub**.

## 1. Ordner anlegen
Place your files here, e.g.:
C:\Users\Stephan\Dev\Zauberfile\

## 2. VS Code öffnen
File → Open Folder → Zauberfile.

## 3. Repo initialisieren
git init
git add .
git commit -m "Initial commit – Zauberfile Legacy Import"
✔ Projekt ist jetzt ein vollständiges lokales Git-Repo.  
Keine Verbindung zu GitHub nötig.

### Optional: später Remote hinzufügen
git remote add origin <url>
git push -u origin main

---

# D) 🌱 Creating a New Branch (VS Code + GitHub-Friendly)
This is the correct workflow for future MIDAS branches:

## 1. Make sure main is up to date
git checkout main
git pull

## 2. Neuen Branch erstellen
git checkout -b <branchname>
z. B.:
git checkout -b feature/supabase-refactor

## 3. Lokal Änderungen commiten
git add .
git commit -m "Your message"

## 4. Remote Branch erstellen (Push)
git push -u origin <branchname>
✔ GitHub versteht den Branch  
✔ VS Code erkennt ihn  
✔ Codex arbeitet korrekt damit

---

# 🛡 Bonus: Safety Net (empfohlen vor großen Änderungen)
### Backup-Tag
git tag backup-before-change
git push origin backup-before-change

### Backup-Branch
git branch backup-pre-change
git push origin backup-pre-change
Damit kannst du jederzeit in Sekunden alles rückgängig machen.

# E) 🌱 Update of Supabase CLI in CMD
npm update supabase --save-dev