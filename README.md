# BreizhCamp 2026 — "Un replay, ce n'est pas une vidéo"

Présentation reveal.js — thème Matrix Neon / Tokyo Cyber

## Setup

```bash
npm install
npm start
# → http://localhost:3000
```

## Structure

```
index.html          ← Présentation complète
main.js             ← Init reveal.js + matrix rain
css/
  matrix-neon.css   ← Thème complet
  notes.css         ← Fenêtre speaker notes
package.json
```

## Raccourcis reveal.js

| Touche | Action |
|--------|--------|
| `F` | Plein écran |
| `S` | Speaker notes |
| `O` | Vue d'ensemble des slides |
| `B` | Écran noir (pause) |
| `Esc` | Quitter la vue d'ensemble |

## Plan du talk (45 min)

| Partie | Contenu | Durée |
|--------|---------|-------|
| 01 | Un replay, ce n'est pas une vidéo | ~10 min |
| DÉMO 1 | Platformer Replay (jeu) | ~5 min |
| 02 | De la partie au système | ~12 min |
| DÉMO 2 | Event Store Backend (seed.ts) | ~6 min |
| 03 | Cas d'usage réels | ~10 min |
| 04 | Limites et conseils | ~10 min |
| Questions | | ~5 min |

## Slides de démo

Les slides "DEMO TIME" sont des plein écrans déclencheurs.
Switcher sur la fenêtre dédiée (jeu ou terminal) après ces slides.

### Démo 1 — Platformer Replay
```bash
# Lancer dans une fenêtre séparée
cd platformer-replay
deno task build && deno task dev
# → http://localhost:3000
```

### Démo 2 — Event Store Backend
```bash
# Terminal 1
cd breizhcamp-event-store
deno run --allow-net api.ts

# Terminal 2 (démo interactive)
deno run --allow-net --allow-read seed.ts
```
