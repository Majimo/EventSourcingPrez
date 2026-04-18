// ============================================================
// DOMAIN EVENTS — append-only, immutables, nommés au passé
// Domaine : gestion des salles de conférence BreizhCamp
// ============================================================

export type DomainEvent =
  | RoomOpened
  | AttendeeCheckedIn
  | AttendeeCheckedOut
  | RoomFull
  | RoomClosed;

interface BaseEvent {
  eventId: string;
  aggregateId: string;  // roomId (ex: "amphi-a")
  occurredAt: string;   // ISO 8601
  version: number;      // position dans le stream de cet aggregate
}

export interface RoomOpened extends BaseEvent {
  type: "RoomOpened";
  payload: {
    roomName: string;
    capacity: number;
    talkTitle: string;
    speaker: string;
  };
}

export interface AttendeeCheckedIn extends BaseEvent {
  type: "AttendeeCheckedIn";
  payload: {
    attendeeId: string;
    attendeeName: string;
  };
}

export interface AttendeeCheckedOut extends BaseEvent {
  type: "AttendeeCheckedOut";
  payload: {
    attendeeId: string;
    attendeeName: string;
  };
}

// Émis automatiquement par le command handler quand la salle est pleine
// Ce n'est pas le client qui décide — c'est la règle métier
export interface RoomFull extends BaseEvent {
  type: "RoomFull";
  payload: {
    capacity: number;
  };
}

export interface RoomClosed extends BaseEvent {
  type: "RoomClosed";
  payload: {
    reason: string;
    finalAttendeeCount: number;
  };
}

export function newEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
