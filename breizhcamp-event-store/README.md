# breizhcamp-event-store

Démo Event Sourcing pour le talk **"Game Replay & Event Sourcing"** — BreizhCamp 2026.

> "Un jeu vidéo et un SI métier stockent tous les deux une chronologie d'événements,  
> pas un état figé. Rejouer les events d'une salle, c'est exactement rejouer les inputs d'une partie."

## Domaine métier : gestion des salles de conférence

| Command | Events émis |
|---------|------------|
| `openRoom` | `RoomOpened` |
| `checkIn` | `AttendeeCheckedIn` (+ `RoomFull` si capacité atteinte) |
| `checkOut` | `AttendeeCheckedOut` |
| `closeRoom` | `RoomClosed` |

## Architecture

```
src/
├── events.ts       Types TypeScript des domain events (immuables, passé)
├── eventStore.ts   Append-only log + getStreamAt() pour le time travel
├── commands.ts     Handlers : validation métier + émission d'events
├── projections.ts  Reconstruction d'état par replay (fonction pure)
└── snapshots.ts    Optimisation "save state" + commentaires sur les limites
api.ts              Serveur HTTP Deno (zero-config, TypeScript natif)
seed.ts             Scénario de démo en 10 étapes (à jouer sur scène)
```

## Lancer la démo

### Prérequis

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### Démarrer le serveur

```bash
deno run --allow-net api.ts
```

### Jouer le scénario (dans un autre terminal)

```bash
deno run --allow-net seed.ts
```

## Endpoints

| Méthode | Path | Description |
|---------|------|-------------|
| `POST` | `/rooms` | Ouvrir une salle |
| `GET` | `/rooms` | Liste toutes les salles |
| `GET` | `/rooms/:id` | État courant (replay complet) |
| `GET` | `/rooms/:id?at=<ISO>` | **⏱️ Time travel** : état à une date passée |
| `POST` | `/rooms/:id/checkin` | Check-in d'un participant |
| `POST` | `/rooms/:id/checkout` | Check-out d'un participant |
| `POST` | `/rooms/:id/close` | Fermer la salle |
| `GET` | `/rooms/:id/events` | **Log brut** (audit trail complet) |
| `POST` | `/rooms/:id/snapshot` | Sauvegarder un snapshot |
| `GET` | `/debug/events` | Tous les events du store |

## Parallèle avec le mini-jeu (le cœur du talk)

```
JEU VIDÉO                              BACKEND BREIZHCAMP
──────────────────────────             ──────────────────────────────
{ frame: 1,  INPUT: MOVE_LEFT }  ←→   { type: AttendeeCheckedIn }
{ frame: 12, INPUT: SHOOT }      ←→   { type: AttendeeCheckedOut }
{ frame: 47, SYSTEM: ENEMY_HIT } ←→   { type: RoomFull }  ← émis auto
────────────────────────               ──────────────────────────────
+ état initial (seed RNG)        ←→   + état initial (salle vide)
= reconstruction identique       ←→   = reconstruction identique
```

## Points clés pour le talk

1. **Append-only** : jamais de UPDATE ni DELETE sur un event
2. **`projectRoom()` = replay pur** : fonction déterministe, pas d'effet de bord
3. **`?at=<date>` = time travel** : "combien de monde dans l'Amphi A à 14h30 ?"
4. **`RoomFull` émis automatiquement** : la règle métier vit dans le handler, pas chez le client
5. **`snapshots.ts`** : montre l'optimisation + ses limites (partie 4 du talk)

## Limites abordées en partie 4

- **Coût de relecture** : O(n) events → snapshots pour mitiger
- **Pas de correction directe** : une erreur = un event compensatoire
- **Versioning des events** : si le schéma change, les anciens snapshots deviennent incompatibles
- **Complexité outillage** : migrations, tests d'intégration, debugging plus indirect
- **Quand NE PAS l'utiliser** : CRUD simple, faible volume, pas besoin d'audit
