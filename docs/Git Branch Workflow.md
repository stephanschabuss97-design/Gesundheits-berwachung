# Git Branch Workflow

## Neuen Branch erstellen
```bash
git checkout -b feature/capture-hub-redesign
```

## Auf main zurückwechseln
```bash
git checkout main
```

## Zurück auf den Feature-Branch wechseln
```bash
git checkout feature/capture-hub-redesign
```

## Branch auf GitHub pushen
```bash
git push -u origin feature/capture-hub-redesign
```

## Merge (auf GitHub)
1. Pull Request von `feature/capture-hub-redesign` nach `main` erstellen.
2. Nach Review/Tests mergen.

## Lokales Testen
- Öffne `index.html` im ausgecheckten Branch, um das neue Layout zu sehen.
- Änderungen sind auf GitHub Pages erst nach Merge auf `main` sichtbar.
