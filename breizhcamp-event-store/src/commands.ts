// ============================================================
// COMMAND HANDLERS — la logique métier
//
// Chaque handler :
//   1. Charge l'état actuel (via projection du stream)
//   2. Valide les règles métier
//   3. Émet 0..N events dans le store
//
// 🎮 Analogie : le game loop qui valide un input avant de l'enregistrer
// ============================================================

import { eventStore } from "./eventStore.ts";
import { projectRoom } from "./projections.ts";
import { DomainEvent, newEventId } from "./events.ts";

// ── OpenRoom ─────────────────────────────────────────────────
export function openRoom(
  roomId: string,
  roomName: string,
  capacity: number,
  talkTitle: string,
  speaker: string
): void {
  const existing = eventStore.getStream(roomId);
  if (existing.length > 0) {
    throw new Error(`Room ${roomId} already exists`);
  }
  if (capacity <= 0) throw new Error("Capacity must be positive");

  eventStore.append([{
    eventId: newEventId(),
    aggregateId: roomId,
    occurredAt: new Date().toISOString(),
    version: 1,
    type: "RoomOpened",
    payload: { roomName, capacity, talkTitle, speaker },
  }]);
}

// ── CheckIn ──────────────────────────────────────────────────
export function checkIn(
  roomId: string,
  attendeeId: string,
  attendeeName: string
): void {
  const events = eventStore.getStream(roomId);
  const state = projectRoom(roomId, events);

  if (!state || !state.isOpen) throw new Error("Room not found or closed");
  if (state.isFull) throw new Error("Room is full");
  if (state.attendees.has(attendeeId)) {
    throw new Error(`${attendeeName} is already checked in`);
  }

  const toAppend: DomainEvent[] = [{
    eventId: newEventId(),
    aggregateId: roomId,
    occurredAt: new Date().toISOString(),
    version: state.version + 1,
    type: "AttendeeCheckedIn",
    payload: { attendeeId, attendeeName },
  }];

  // Si on vient d'atteindre la capacité max, on émet RoomFull automatiquement
  // C'est la règle métier — pas le client qui décide
  if (state.attendees.size + 1 >= state.capacity) {
    toAppend.push({
      eventId: newEventId(),
      aggregateId: roomId,
      occurredAt: new Date().toISOString(),
      version: state.version + 2,
      type: "RoomFull",
      payload: { capacity: state.capacity },
    });
  }

  eventStore.append(toAppend);
}

// ── CheckOut ─────────────────────────────────────────────────
export function checkOut(
  roomId: string,
  attendeeId: string,
  attendeeName: string
): void {
  const events = eventStore.getStream(roomId);
  const state = projectRoom(roomId, events);

  if (!state || !state.isOpen) throw new Error("Room not found or closed");
  if (!state.attendees.has(attendeeId)) {
    throw new Error(`${attendeeName} is not checked in`);
  }

  eventStore.append([{
    eventId: newEventId(),
    aggregateId: roomId,
    occurredAt: new Date().toISOString(),
    version: state.version + 1,
    type: "AttendeeCheckedOut",
    payload: { attendeeId, attendeeName },
  }]);
}

// ── CloseRoom ────────────────────────────────────────────────
export function closeRoom(roomId: string, reason: string): void {
  const events = eventStore.getStream(roomId);
  const state = projectRoom(roomId, events);

  if (!state || !state.isOpen) throw new Error("Room not found or already closed");

  eventStore.append([{
    eventId: newEventId(),
    aggregateId: roomId,
    occurredAt: new Date().toISOString(),
    version: state.version + 1,
    type: "RoomClosed",
    payload: { reason, finalAttendeeCount: state.attendees.size },
  }]);
}
