// ============================================================
// EVENT STORE — le cœur du système
// Append-only : on ne modifie JAMAIS un event existant
// ============================================================

import { DomainEvent } from "./events.ts";

class EventStore {
  // Le log global — en prod : PostgreSQL, EventStoreDB, Kafka...
  private events: DomainEvent[] = [];

  // Ajoute des events (toujours à la fin — jamais de UPDATE)
  append(events: DomainEvent[]): void {
    for (const event of events) {
      this.events.push(event);

      // Détection des events "automatiques" (émis par la règle métier, pas le client)
      const isAuto = event.type === "RoomFull" || event.type === "RoomClosed";

      const v       = String(event.version).padStart(3, " ");
      const type    = event.type.padEnd(24, " ");
      const payload = JSON.stringify(event.payload);
      const suffix  = isAuto ? "  ← auto (règle métier)" : "";

      console.log(`[${v}] ${type} ${payload}${suffix}`);
    }
  }

  // Tous les events d'une salle, dans l'ordre
  getStream(roomId: string): DomainEvent[] {
    return this.events
      .filter(e => e.aggregateId === roomId)
      .sort((a, b) => a.version - b.version);
  }

  // ⏱️ Time travel : events d'une salle JUSQU'À une date donnée
  // 🎮 Analogie : rejouer les inputs jusqu'à la frame N
  getStreamAt(roomId: string, until: Date): DomainEvent[] {
    return this.getStream(roomId).filter(
      e => new Date(e.occurredAt) <= until
    );
  }

  // Toutes les salles connues
  getRoomIds(): string[] {
    return [...new Set(this.events.map(e => e.aggregateId))];
  }

  // Vue globale pour le debug / audit sur scène
  getAllEvents(): DomainEvent[] {
    return [...this.events];
  }
}

// Singleton — en prod, injecté par DI
export const eventStore = new EventStore();
