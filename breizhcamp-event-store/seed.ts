// ============================================================
// SEED INTERACTIF — mode présentateur
// Chaque étape attend une pression sur Entrée avant de continuer
// Lancer : deno run --allow-net --allow-read seed.ts
// ============================================================

const BASE = "http://localhost:8000";

// ── Helpers ──────────────────────────────────────────────────

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const ok = res.status === 200 || res.status === 201;
  console.log(`  ${ok ? "✅" : "❌"} POST ${path}`);
  console.log(`     ${JSON.stringify(data)}`);
  return data;
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  console.log(`  ✅ GET  ${path}`);
  console.log(JSON.stringify(data, null, 2)
    .split("\n")
    .map(l => `     ${l}`)
    .join("\n")
  );
  return data;
}

// Attend une pression sur Entrée
async function waitForEnter(label: string) {
  const buf = new Uint8Array(1);
  await Deno.stdout.write(new TextEncoder().encode(`\n${"─".repeat(60)}\n`));
  await Deno.stdout.write(new TextEncoder().encode(`👉 ${label}  [Entrée pour continuer]`));
  await Deno.stdin.read(buf);
}

// Affiche le titre d'une étape
function step(n: number, title: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${n}. ${title}`);
  console.log(`${"═".repeat(60)}\n`);
}

// ── Scénario ──────────────────────────────────────────────────

await waitForEnter("Démarrer la démo Event Sourcing — BreizhCamp 2026 🎮");

// ── 1. Ouverture des salles ───────────────────────────────────
step(1, "Ouverture des salles");
await post("/rooms", {
  roomId: "amphi-a",
  roomName: "Amphi A",
  capacity: 3,
  talkTitle: "Game Replay & Event Sourcing",
  speaker: "Pierre FERVEL",
});
await post("/rooms", {
  roomId: "salle-b1",
  roomName: "Salle B1",
  capacity: 20,
  talkTitle: "Deno pour les dev Node.js",
  speaker: "Marie Curie",
});

await waitForEnter("Check-ins dans l'Amphi A");

// ── 2. Check-ins ─────────────────────────────────────────────
step(2, "Check-ins (Alice + Bob)");
await post("/rooms/amphi-a/checkin", { attendeeId: "att-001", attendeeName: "Alice Martin" });
await post("/rooms/amphi-a/checkin", { attendeeId: "att-002", attendeeName: "Bob Dupont" });

// Mémorise la date pour le time travel (avant le 3ème check-in)
const timeTravelDate = new Date().toISOString();
console.log(`\n  ⏱️  Date mémorisée pour le time travel : ${timeTravelDate}`);

await waitForEnter("3ème check-in → déclenche RoomFull automatiquement");

// ── 3. RoomFull automatique ───────────────────────────────────
step(3, "3ème check-in → RoomFull émis automatiquement");
await post("/rooms/amphi-a/checkin", { attendeeId: "att-003", attendeeName: "Charlie Leroy" });

await waitForEnter("Tentative de check-in sur salle pleine");

// ── 4. Salle pleine ───────────────────────────────────────────
step(4, "Tentative de check-in refusée (salle pleine)");
await post("/rooms/amphi-a/checkin", { attendeeId: "att-004", attendeeName: "Diana Prince" });

await waitForEnter("Check-out de Bob");

// ── 5. Check-out ─────────────────────────────────────────────
step(5, "Check-out de Bob");
await post("/rooms/amphi-a/checkout", { attendeeId: "att-002", attendeeName: "Bob Dupont" });

await waitForEnter("État courant → reconstruit par replay complet");

// ── 6. État courant ───────────────────────────────────────────
step(6, "État courant de l'Amphi A (replay complet)");
await get("/rooms/amphi-a");

await waitForEnter(`Time travel → état AVANT le 3ème check-in`);

// ── 7. Time travel ────────────────────────────────────────────
step(7, `Time travel → état à ${timeTravelDate}`);
console.log("  (on rejoue les events jusqu'à cette date, comme une killcam)\n");
await get(`/rooms/amphi-a?at=${timeTravelDate}`);

await waitForEnter("Audit trail → le log brut des events");

// ── 8. Audit trail ────────────────────────────────────────────
step(8, "Log brut des events (l'audit trail complet)");
await get("/rooms/amphi-a/events");

await waitForEnter("Snapshot → save state");

// ── 9. Snapshot ───────────────────────────────────────────────
step(9, "Snapshot (save state) — évite de rejouer depuis le début");
await post("/rooms/amphi-a/snapshot", {});

await waitForEnter("Vue globale de toutes les salles");

// ── 10. Vue globale ────────────────────────────────────────────
step(10, "Vue globale — toutes les salles");
await get("/rooms");

await waitForEnter("Fermeture de la salle — fin du talk 🎉");

// ── 11. Fermeture ─────────────────────────────────────────────
step(11, "Fermeture de l'Amphi A");
await post("/rooms/amphi-a/close", { reason: "Talk terminé, merci !" });

console.log("\n" + "═".repeat(60));
console.log("  ✅ Démo terminée — merci BreizhCamp ! 🎮");
console.log("═".repeat(60) + "\n");
