# 🎮 Platformer Replay — Event Sourcing Demo

> Projet de démonstration pour le talk **"Un replay, ce n'est pas une vidéo"**
> Illustre les parallèles entre les replays de jeux vidéo et l'event sourcing backend.

## Concept

Le jeu enregistre non pas l'état complet à chaque frame, mais **uniquement les changements d'inputs**
et les événements métier (mort, victoire). Pour rejouer une partie, le moteur réinjecte ces events
dans la même boucle de jeu — exactement comme un event store backend rejoue ses événements pour
reconstruire l'état courant.

```
Replay = État initial (seed) + Log d'events (inputs)
                 ↓
         même résultat, toujours
```

## Structure du projet

```
src/
├── core/
│   ├── types.ts       ← Types partagés (GameState, GameEvent, ReplayData…)
│   ├── level.ts       ← Génération de niveau par seed (LCG déterministe)
│   └── physics.ts     ← Physique pure (applyTick — pas de side effects)
├── replay/
│   ├── recorder.ts    ← Enregistre les events pendant le jeu live
│   └── player.ts      ← Rejoue un ReplayData (FULL ou KILLCAM)
├── render/
│   └── canvas.ts      ← Rendu visuel uniquement (indépendant de la logique)
├── ui/
│   └── eventlog.ts    ← Panneau d'affichage des events en temps réel
└── main.ts            ← Orchestration générale
```

## Démarrage rapide

### Avec Deno (recommandé)

```bash
# Build TypeScript → JS
deno task build

# Serveur de dev
deno task dev
# → http://localhost:3000
```

### Sans build (navigateur moderne)

Ouvrir `index.html` directement si ton navigateur supporte les import maps.

## Modes de jeu

| Mode | Description | Parallèle backend |
|------|-------------|-------------------|
| **LIVE** | Partie normale, inputs enregistrés | Écriture d'events dans le store |
| **REPLAY** | Rejoue depuis le tick 0 | Relecture complète depuis l'origin |
| **KILLCAM** | Rejoue les 5 secondes avant la mort | Reconstruction à un instant T |

## Inputs

| Touche | Action |
|--------|--------|
| `←` / `A` | Gauche |
| `→` / `D` | Droite |
| `↑` / `W` / `Space` | Sauter |

## Points clés pour le talk

- **`physics.ts`** : `applyTick()` est une **pure function** — c'est ce qui rend le replay possible
- **`recorder.ts`** : on n'enregistre que les **changements** d'input, pas 60 snapshots/sec
- **`player.ts`** : `rebuildStateAtTick()` = la projection event sourcing
- Le dossier `render/` peut être supprimé sans casser la logique — découplage total
