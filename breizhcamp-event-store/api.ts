// ============================================================
// API HTTP — serveur Deno
// deno run --allow-net api.ts
// ============================================================

import { eventStore } from "./src/eventStore.ts";
import { projectRoom, serializeState } from "./src/projections.ts";
import { openRoom, checkIn, checkOut, closeRoom } from "./src/commands.ts";
import { snapshotStore } from "./src/snapshots.ts";

const PORT = 8000;

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const error = (msg: string, status = 400) =>
    json({ error: msg }, status);

  try {
    // ── POST /rooms ─────────────────────────────────────────
    if (method === "POST" && path === "/rooms") {
      const body = await req.json();
      openRoom(
        body.roomId,
        body.roomName,
        body.capacity,
        body.talkTitle,
        body.speaker
      );
      const { roomId, ...roomWithoutId } = body;
      return json({ ok: true, roomId, room: roomWithoutId }, 201);
    }

    // ── GET /rooms ──────────────────────────────────────────
    // Liste toutes les salles avec leur état courant
    if (method === "GET" && path === "/rooms") {
      const roomIds = eventStore.getRoomIds();
      const rooms = roomIds.map(roomId => {
        const state = projectRoom(roomId, eventStore.getStream(roomId));
        return state ? serializeState(state) : { roomId, error: "no state" };
      });
      return json({ total: rooms.length, rooms });
    }

    // ── GET /rooms/:id ──────────────────────────────────────
    // État courant OU time travel avec ?at=<ISO date>
    const roomMatch = path.match(/^\/rooms\/([\w-]+)$/);
    if (method === "GET" && roomMatch) {
      const roomId = roomMatch[1];
      const atParam = url.searchParams.get("at");

      const events = atParam
        ? eventStore.getStreamAt(roomId, new Date(atParam))
        : eventStore.getStream(roomId);

      const state = projectRoom(roomId, events);
      if (!state) return error("Room not found", 404);

      return json({
        ...serializeState(state),
        timeTravelAt: atParam ?? null,
        note: atParam
          ? `État reconstruit par replay jusqu'à ${atParam}`
          : "État courant reconstruit par replay complet",
      });
    }

    // ── POST /rooms/:id/checkin ─────────────────────────────
    const checkinMatch = path.match(/^\/rooms\/([\w-]+)\/checkin$/);
    if (method === "POST" && checkinMatch) {
      const body = await req.json();
      checkIn(checkinMatch[1], body.attendeeId, body.attendeeName);
      return json({ ok: true, attendee: body });
    }

    // ── POST /rooms/:id/checkout ────────────────────────────
    const checkoutMatch = path.match(/^\/rooms\/([\w-]+)\/checkout$/);
    if (method === "POST" && checkoutMatch) {
      const body = await req.json();
      checkOut(checkoutMatch[1], body.attendeeId, body.attendeeName);
      return json({ ok: true, attendee: body });
    }

    // ── POST /rooms/:id/close ───────────────────────────────
    const closeMatch = path.match(/^\/rooms\/([\w-]+)\/close$/);
    if (method === "POST" && closeMatch) {
      const body = await req.json();
      closeRoom(closeMatch[1], body.reason ?? "Talk terminé");
      return json({ ok: true, reason: body.reason });
    }

    // ── GET /rooms/:id/events ───────────────────────────────
    // L'audit trail complet — parfait à montrer sur scène
    const eventsMatch = path.match(/^\/rooms\/([\w-]+)\/events$/);
    if (method === "GET" && eventsMatch) {
      const events = eventStore.getStream(eventsMatch[1]);
      return json({
        roomId: eventsMatch[1],
        totalEvents: events.length,
        events,
      });
    }

    // ── POST /rooms/:id/snapshot ────────────────────────────
    const snapshotMatch = path.match(/^\/rooms\/([\w-]+)\/snapshot$/);
    if (method === "POST" && snapshotMatch) {
      const roomId = snapshotMatch[1];
      const state = projectRoom(roomId, eventStore.getStream(roomId));
      if (!state) return error("Room not found", 404);
      snapshotStore.save(roomId, state);
      return json({ ok: true, savedAtVersion: state.version });
    }

    // ── GET /debug/events ───────────────────────────────────
    // Tous les events du store global (audit / debug sur scène)
    if (method === "GET" && path === "/debug/events") {
      const all = eventStore.getAllEvents();
      return json({ totalEvents: all.length, events: all });
    }

    return error("Not found", 404);

  } catch (e) {
    return error(e instanceof Error ? e.message : String(e));
  }
}

console.log(`\n🎮 BreizhCamp — Event Store Demo — http://localhost:${PORT}`);
console.log("   deno run --allow-net api.ts\n");
console.log("Endpoints disponibles :");
console.log("  POST /rooms");
console.log("  GET  /rooms");
console.log("  GET  /rooms/:id");
console.log("  GET  /rooms/:id?at=<ISO date>    ← time travel !");
console.log("  POST /rooms/:id/checkin");
console.log("  POST /rooms/:id/checkout");
console.log("  POST /rooms/:id/close");
console.log("  GET  /rooms/:id/events           ← audit trail");
console.log("  POST /rooms/:id/snapshot");
console.log("  GET  /debug/events\n");

Deno.serve({ port: PORT }, handler);
