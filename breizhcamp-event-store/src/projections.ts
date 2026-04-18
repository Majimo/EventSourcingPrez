// ============================================================
// PROJECTIONS — reconstruction d'état par replay des events
//
// 🎮 Analogie jeu vidéo :
//   projectRoom()  ≡  gameLoop.replayInputs()
//   applyEvent()   ≡  gameLoop.applyInput()
//
// La fonction est pure : même events → même état, toujours.
// ============================================================

import { DomainEvent } from "./events.ts";

export interface RoomState {
  roomId: string;
  roomName: string;
  talkTitle: string;
  speaker: string;
  capacity: number;
  attendees: Map<string, string>;  // attendeeId → attendeeName
  isFull: boolean;
  isOpen: boolean;
  version: number;
  eventsReplayed: number;
}

// Point d'entrée : rejoue tous les events et reconstruit l'état
export function projectRoom(
  roomId: string,
  events: DomainEvent[]
): RoomState | null {
  if (events.length === 0) return null;

  let state: RoomState = {
    roomId,
    roomName: "",
    talkTitle: "",
    speaker: "",
    capacity: 0,
    attendees: new Map(),
    isFull: false,
    isOpen: false,
    version: 0,
    eventsReplayed: 0,
  };

  for (const event of events) {
    state = applyEvent(state, event);
    state.eventsReplayed++;
  }

  return state;
}

// Transforme (état + event) → nouvel état
// Fonction pure : pas d'effet de bord
function applyEvent(state: RoomState, event: DomainEvent): RoomState {
  switch (event.type) {
    case "RoomOpened":
      return {
        ...state,
        roomName: event.payload.roomName,
        talkTitle: event.payload.talkTitle,
        speaker: event.payload.speaker,
        capacity: event.payload.capacity,
        isOpen: true,
        version: event.version,
      };

    case "AttendeeCheckedIn": {
      const attendees = new Map(state.attendees);
      attendees.set(event.payload.attendeeId, event.payload.attendeeName);
      return {
        ...state,
        attendees,
        isFull: attendees.size >= state.capacity,
        version: event.version,
      };
    }

    case "AttendeeCheckedOut": {
      const attendees = new Map(state.attendees);
      attendees.delete(event.payload.attendeeId);
      return {
        ...state,
        attendees,
        isFull: false,
        version: event.version,
      };
    }

    case "RoomFull":
      // Cet event est informatif : l'état isFull est déjà géré par CheckIn
      return { ...state, isFull: true, version: event.version };

    case "RoomClosed":
      return {
        ...state,
        isOpen: false,
        version: event.version,
      };

    default:
      return state;
  }
}

// Sérialise l'état pour l'API (Map → Array pour JSON)
export function serializeState(state: RoomState) {
  return {
    ...state,
    attendees: [...state.attendees.values()],
    attendeeCount: state.attendees.size,
  };
}
