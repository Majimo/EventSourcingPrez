// ============================================================
// SNAPSHOTS — optimisation de la relecture
//
// Problème : relire 10 000 check-ins à chaque requête devient coûteux
// Solution : sauvegarder périodiquement l'état projeté
//
// 🎮 Analogie : les "save states" d'un émulateur
//    Au lieu de rejouer depuis le début, on part du dernier save state.
//    Mais le log des events reste intact — on peut toujours remonter
//    plus loin que le snapshot si besoin.
// ============================================================

import { RoomState } from "./projections.ts";

interface Snapshot {
  state: RoomState;
  takenAt: string;
  eventVersion: number;  // dernier event inclus dans ce snapshot
}

class SnapshotStore {
  private snapshots = new Map<string, Snapshot>();

  save(roomId: string, state: RoomState): void {
    this.snapshots.set(roomId, {
      state,
      takenAt: new Date().toISOString(),
      eventVersion: state.version,
    });
    console.log(`[💾 ] ${"SNAPSHOT".padEnd(24, " ")} { roomId: "${roomId}", savedAtVersion: ${state.version} }  ← save state`);
  }

  get(roomId: string): Snapshot | undefined {
    return this.snapshots.get(roomId);
  }

  // Prendre un snapshot tous les N events (seuil configurable)
  shouldSnapshot(eventsReplayed: number, threshold = 50): boolean {
    return eventsReplayed >= threshold;
  }
}

export const snapshotStore = new SnapshotStore();

/*
  ⚠️  LIMITES DES SNAPSHOTS (partie 4 du talk) :

  1. Si le schéma d'un event change, les anciens snapshots peuvent devenir
     incompatibles → versioning des events nécessaire.

  2. Un snapshot ne remplace PAS le log d'events :
     - Audit trail : toujours dans les events
     - Time travel avant le snapshot : rejouer depuis le début

  3. Stratégies alternatives :
     - Snapshot toutes les N minutes
     - Snapshot après fermeture de salle
     - Snapshot déclenché par un seuil de latence

  4. En production : EventStoreDB gère les snapshots nativement.
*/
