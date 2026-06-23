// ============================================================
// SEED INTERACTIF — mode présentateur
// Chaque étape attend une pression sur Entrée avant de continuer
// Lancer : deno run --allow-net --allow-read seed.ts
// ============================================================

const BASE = "http://localhost:8000";

// ── Couleurs ANSI ─────────────────────────────────────────────
const R  = '\x1b[0m';   // reset
const B  = '\x1b[1m';   // bold
const DM = '\x1b[2m';   // dim

const GR = '\x1b[32m';  // green
const CY = '\x1b[36m';  // cyan
const YL = '\x1b[33m';  // yellow
const MG = '\x1b[35m';  // magenta
const RD = '\x1b[31m';  // red
const WH = '\x1b[97m';  // white

// ── Colorisation JSON ─────────────────────────────────────────
function colorJson(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  const pad1 = '  '.repeat(indent + 1);

  if (obj === null)            return `${MG}null${R}`;
  if (typeof obj === 'boolean')return `${MG}${obj}${R}`;
  if (typeof obj === 'number') return `${YL}${obj}${R}`;
  if (typeof obj === 'string') return `${GR}"${obj}"${R}`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${DM}[]${R}`;
    const items = obj.map(v => `${pad1}${colorJson(v, indent + 1)}`).join(',\n');
    return `${DM}[${R}\n${items}\n${pad}${DM}]${R}`;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `${DM}{}${R}`;
    const lines = entries.map(([k, v]) => {
      // Colorisation spéciale selon la clé
      let keyColor = CY;
      if (k === 'error')         keyColor = RD;
      if (k === 'ok')            keyColor = GR;
      if (k === 'type')          keyColor = YL;
      if (k === 'version')       keyColor = MG;
      if (k === 'occurredAt')    keyColor = DM;
      if (k === 'eventId')       keyColor = DM;
      return `${pad1}${keyColor}"${k}"${R}: ${colorJson(v, indent + 1)}`;
    });
    return `${DM}{${R}\n${lines.join(',\n')}\n${pad}${DM}}${R}`;
  }

  return String(obj);
}

// ── Helpers ───────────────────────────────────────────────────

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const ok = res.status === 200 || res.status === 201;

  console.log(`  ${ok ? `${GR}✅${R}` : `${RD}❌${R}`} ${B}POST${R} ${CY}${path}${R}`);
  const lines = colorJson(data, 1).split('\n');
  lines.forEach(l => console.log(`  ${l}`));
  return data;
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();

  console.log(`  ${GR}✅${R} ${B}GET ${R} ${CY}${path}${R}`);
  const lines = colorJson(data, 1).split('\n');
  lines.forEach(l => console.log(`  ${l}`));
  return data;
}

// Attend une pression sur Entrée
async function waitForEnter(label: string) {
  const buf = new Uint8Array(1);
  await Deno.stdout.write(new TextEncoder().encode(
    `\n${DM}${'─'.repeat(60)}${R}\n`
  ));
  await Deno.stdout.write(new TextEncoder().encode(
    `${YL}👉${R} ${B}${label}${R}  ${DM}[Entrée pour continuer]${R}`
  ));
  await Deno.stdin.read(buf);
}

// Affiche le titre d'une étape
function step(n: number, title: string) {
  console.log(`\n${CY}${'═'.repeat(60)}${R}`);
  console.log(`  ${B}${WH}${n}.${R} ${B}${title}${R}`);
  console.log(`${CY}${'═'.repeat(60)}${R}\n`);
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
  capacity: 10,
  talkTitle: "Deno pour les dev Node.js",
  speaker: "Naruto Shinobi",
});

await waitForEnter("Check-ins dans l'Amphi A");

// ── 2. Check-ins ─────────────────────────────────────────────
step(2, "Check-ins (Alice + Bob)");
await post("/rooms/amphi-a/checkin", { attendeeId: "att-001", attendeeName: "Alice Martin" });
await post("/rooms/amphi-a/checkin", { attendeeId: "att-002", attendeeName: "Bob Dupont" });

const timeTravelDate = new Date().toISOString();
console.log(`\n  ${YL}⏱️${R}  Date mémorisée pour le time travel : ${B}${timeTravelDate}${R}`);

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
// console.log(`  ${DM}(on rejoue les events jusqu'à cette date, comme une killcam)${R}\n`);
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

console.log(`\n${CY}${'═'.repeat(60)}${R}`);
console.log(`  ${GR}✅${R} ${B}Démo terminée — merci BreizhCamp ! 🎮${R}`);
console.log(`${CY}${'═'.repeat(60)}${R}\n`);