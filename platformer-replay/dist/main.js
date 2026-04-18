// src/core/level.ts
function seededRng(seed) {
  let s = seed;
  return () => {
    s = s * 1664525 + 1013904223 & 4294967295;
    return (s >>> 0) / 4294967295;
  };
}
var LEVEL_HEIGHT = 400;
var GROUND_Y = 360;
function generateLevel(seed) {
  const rng = seededRng(seed);
  const levelWidth = 2400;
  const platforms = [];
  platforms.push({ x: 0, y: GROUND_Y, width: 260, height: 20 });
  let curX = 300;
  while (curX < levelWidth - 300) {
    const gapWidth = 60 + rng() * 80;
    const platWidth = 100 + rng() * 120;
    const platY = GROUND_Y - 60 - rng() * 140;
    const isElevated = rng() > 0.4;
    platforms.push({
      x: curX + gapWidth,
      y: isElevated ? platY : GROUND_Y,
      width: platWidth,
      height: 20
    });
    curX += gapWidth + platWidth;
  }
  const goalX = levelWidth - 220;
  platforms.push({ x: goalX, y: GROUND_Y, width: 260, height: 20 });
  return {
    seed,
    platforms,
    width: levelWidth,
    height: LEVEL_HEIGHT,
    spawnX: 40,
    spawnY: GROUND_Y - 40,
    goalX: goalX + 200
  };
}

// src/core/physics.ts
var GRAVITY = 0.45;
var JUMP_FORCE = -12.5;
var MOVE_SPEED = 5;
var FRICTION = 0.82;
var PLAYER_W = 28;
var PLAYER_H = 36;
function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function resolveCollisions(p, platforms) {
  let { x, y, vx, vy, onGround } = p;
  onGround = false;
  for (const plat of platforms) {
    if (!rectOverlap(x, y, PLAYER_W, PLAYER_H, plat.x, plat.y, plat.width, plat.height))
      continue;
    const overlapLeft = x + PLAYER_W - plat.x;
    const overlapRight = plat.x + plat.width - x;
    const overlapTop = y + PLAYER_H - plat.y;
    const overlapBottom = plat.y + plat.height - y;
    const minH = Math.min(overlapLeft, overlapRight);
    const minV = Math.min(overlapTop, overlapBottom);
    if (minV < minH) {
      if (overlapTop < overlapBottom) {
        y = plat.y - PLAYER_H;
        vy = 0;
        onGround = true;
      } else {
        y = plat.y + plat.height;
        vy = 0;
      }
    } else {
      if (overlapLeft < overlapRight) {
        x = plat.x - PLAYER_W;
      } else {
        x = plat.x + plat.width;
      }
      vx = 0;
    }
  }
  return { ...p, x, y, vx, vy, onGround };
}
function applyTick(state, input) {
  if (state.status !== "PLAYING")
    return state;
  let { x, y, vx, vy, onGround, alive, won } = state.player;
  if (input.left)
    vx -= MOVE_SPEED;
  if (input.right)
    vx += MOVE_SPEED;
  if (input.jump && onGround)
    vy = JUMP_FORCE;
  vx *= FRICTION;
  vy += GRAVITY;
  x += vx;
  y += vy;
  x = Math.max(0, Math.min(x, state.level.width - PLAYER_W));
  let player = { x, y, vx, vy, onGround, alive, won };
  player = resolveCollisions(player, state.level.platforms);
  let status = state.status;
  if (player.y > state.level.height + 60) {
    player = { ...player, alive: false };
    status = "DEAD";
  }
  if (player.x >= state.level.goalX - 20) {
    player = { ...player, won: true };
    status = "WON";
  }
  return { ...state, tick: state.tick + 1, player, status };
}

// src/replay/recorder.ts
var Recorder = class {
  events = [];
  lastInput = { left: false, right: false, jump: false };
  levelSeed = 0;
  startTimestamp = "";
  deathTick;
  finalTick = 0;
  start(levelSeed) {
    this.events = [];
    this.lastInput = { left: false, right: false, jump: false };
    this.levelSeed = levelSeed;
    this.startTimestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.deathTick = void 0;
    this.finalTick = 0;
    this.events.push({
      tick: 0,
      type: "GAME_STARTED",
      payload: { levelSeed, timestamp: this.startTimestamp }
    });
  }
  // Appelé à chaque tick — n'enregistre que si l'input a changé
  recordInput(tick, input) {
    const changed = input.left !== this.lastInput.left || input.right !== this.lastInput.right || input.jump !== this.lastInput.jump;
    if (changed) {
      this.events.push({ tick, type: "INPUT_CHANGED", payload: { ...input } });
      this.lastInput = { ...input };
    }
    this.finalTick = tick;
  }
  recordDeath(tick, x, y) {
    this.deathTick = tick;
    this.events.push({ tick, type: "PLAYER_DIED", payload: { x, y, cause: "fell" } });
    this.finalTick = tick;
  }
  recordWin(tick) {
    this.events.push({ tick, type: "PLAYER_WON", payload: { tick } });
    this.finalTick = tick;
  }
  getReplay() {
    return {
      initialState: { levelSeed: this.levelSeed, timestamp: this.startTimestamp },
      events: [...this.events],
      deathTick: this.deathTick,
      totalTicks: this.finalTick
    };
  }
  getEventCount() {
    return this.events.length;
  }
};

// src/replay/player.ts
var TICK_RATE = 60;
var KILLCAM_SECONDS = 5;
function buildInputAtTick(tick, events) {
  let input = { left: false, right: false, jump: false };
  for (const ev of events) {
    if (ev.tick > tick)
      break;
    if (ev.type === "INPUT_CHANGED") {
      input = ev.payload;
    }
  }
  return input;
}
function buildInitialState(replay) {
  const level = generateLevel(replay.initialState.levelSeed);
  return {
    tick: 0,
    level,
    status: "PLAYING",
    player: {
      x: level.spawnX,
      y: level.spawnY,
      vx: 0,
      vy: 0,
      onGround: false,
      alive: true,
      won: false
    }
  };
}
function rebuildStateAtTick(replay, targetTick) {
  let state = buildInitialState(replay);
  for (let t = 0; t < targetTick; t++) {
    const input = buildInputAtTick(t, replay.events);
    state = applyTick(state, input);
    if (state.status === "DEAD")
      state = { ...state, status: "PLAYING", player: { ...state.player, alive: true } };
  }
  return { ...state, tick: targetTick };
}
var ReplayPlayer = class {
  replay = null;
  currentTick = 0;
  startTick = 0;
  endTick = 0;
  state = null;
  mode = "FULL";
  running = false;
  rafId;
  lastTime;
  accumulator = 0;
  TICK_MS = 1e3 / TICK_RATE;
  onStateUpdate;
  onFinished;
  load(replay, mode) {
    this.stop();
    this.replay = replay;
    this.mode = mode;
    if (mode === "KILLCAM" && replay.deathTick != null) {
      this.startTick = Math.max(0, replay.deathTick - KILLCAM_SECONDS * TICK_RATE);
      this.endTick = replay.deathTick + 30;
    } else {
      this.startTick = 0;
      this.endTick = replay.totalTicks;
    }
    this.state = rebuildStateAtTick(replay, this.startTick);
    this.currentTick = this.startTick;
  }
  play() {
    if (!this.replay || !this.state)
      return;
    this.running = true;
    this.accumulator = 0;
    this.lastTime = void 0;
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }
  stop() {
    this.running = false;
    if (this.rafId != null)
      cancelAnimationFrame(this.rafId);
  }
  getCurrentState() {
    return this.state;
  }
  loop(now) {
    if (!this.running || !this.replay || !this.state)
      return;
    if (this.lastTime == null)
      this.lastTime = now;
    this.accumulator += now - this.lastTime;
    this.lastTime = now;
    while (this.accumulator >= this.TICK_MS) {
      if (this.currentTick >= this.endTick) {
        this.running = false;
        this.onFinished?.();
        return;
      }
      const input = buildInputAtTick(this.currentTick, this.replay.events);
      this.state = applyTick(this.state, input);
      if (this.mode === "KILLCAM" && this.state.status === "DEAD" && this.currentTick < this.endTick - 1) {
      }
      this.currentTick++;
      this.accumulator -= this.TICK_MS;
      this.onStateUpdate?.(this.state);
    }
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }
};

// src/render/canvas.ts
var COLORS = {
  sky: "#0d1117",
  skyReplay: "#0d1a2e",
  skyKillcam: "#1a0d0d",
  ground: "#21262d",
  platform: "#30a46c",
  platformTop: "#3dd68c",
  player: "#58a6ff",
  playerDead: "#f85149",
  playerWon: "#ffd700",
  goal: "#ffd700",
  stars: "#8b949e",
  hud: "#f0f6fc",
  hudMuted: "#8b949e",
  replayBorder: "rgba(88,166,255,0.4)",
  killcamBorder: "rgba(248,81,73,0.6)"
};
function render(ctx2, state, opts) {
  const W = ctx2.canvas.width;
  const H = ctx2.canvas.height;
  const camX = Math.max(0, Math.min(
    state.player.x - W / 2,
    state.level.width - W
  ));
  const skyColor = opts.mode === "KILLCAM" ? COLORS.skyKillcam : opts.mode === "REPLAY" ? COLORS.skyReplay : COLORS.sky;
  ctx2.fillStyle = skyColor;
  ctx2.fillRect(0, 0, W, H);
  ctx2.fillStyle = COLORS.stars;
  const starRng = state.level.seed;
  for (let i = 0; i < 60; i++) {
    const sx = starRng * (i * 137 + 73) % state.level.width;
    const sy = starRng * (i * 41 + 19) % (GROUND_Y - 20) % H;
    const screenX = (sx - camX + state.level.width) % state.level.width;
    if (screenX >= 0 && screenX <= W) {
      ctx2.globalAlpha = 0.3 + i % 5 * 0.1;
      ctx2.fillRect(screenX, sy * 0.6, 1.5, 1.5);
    }
  }
  ctx2.globalAlpha = 1;
  for (const plat of state.level.platforms) {
    const sx = plat.x - camX;
    if (sx + plat.width < 0 || sx > W)
      continue;
    ctx2.fillStyle = COLORS.platform;
    ctx2.beginPath();
    ctx2.roundRect(sx, plat.y, plat.width, plat.height, 3);
    ctx2.fill();
    ctx2.fillStyle = COLORS.platformTop;
    ctx2.fillRect(sx, plat.y, plat.width, 4);
  }
  const goalScreenX = state.level.goalX - camX;
  if (goalScreenX > -20 && goalScreenX < W + 20) {
    ctx2.fillStyle = COLORS.goal;
    ctx2.globalAlpha = 0.8;
    ctx2.fillRect(goalScreenX - 2, GROUND_Y - 60, 4, 60);
    ctx2.fillStyle = COLORS.goal;
    ctx2.globalAlpha = 0.9;
    ctx2.beginPath();
    ctx2.moveTo(goalScreenX + 2, GROUND_Y - 60);
    ctx2.lineTo(goalScreenX + 22, GROUND_Y - 50);
    ctx2.lineTo(goalScreenX + 2, GROUND_Y - 40);
    ctx2.fill();
    ctx2.globalAlpha = 1;
  }
  const px = state.player.x - camX;
  const py = state.player.y;
  const playerColor = !state.player.alive ? COLORS.playerDead : state.player.won ? COLORS.playerWon : COLORS.player;
  ctx2.fillStyle = playerColor;
  ctx2.beginPath();
  ctx2.roundRect(px, py, PLAYER_W, PLAYER_H, 5);
  ctx2.fill();
  const eyeOffsetX = state.player.vx > 0.2 ? 14 : state.player.vx < -0.2 ? 4 : 9;
  ctx2.fillStyle = "#0d1117";
  ctx2.beginPath();
  ctx2.arc(px + eyeOffsetX, py + 11, 4, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.fillStyle = "white";
  ctx2.beginPath();
  ctx2.arc(px + eyeOffsetX + 1, py + 10, 1.5, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.fillStyle = COLORS.hud;
  ctx2.font = 'bold 14px "JetBrains Mono", monospace';
  const modeLabel = opts.mode === "KILLCAM" ? "\u23EE KILLCAM" : opts.mode === "REPLAY" ? "\u25B6 REPLAY" : "\u25CF LIVE";
  ctx2.fillText(modeLabel, 16, 28);
  ctx2.fillStyle = COLORS.hudMuted;
  ctx2.font = '12px "JetBrains Mono", monospace';
  ctx2.fillText(`tick: ${state.tick}`, 16, 46);
  if (opts.eventCount != null) {
    ctx2.fillText(`events: ${opts.eventCount}`, 16, 62);
  }
  const progress = state.player.x / state.level.goalX;
  ctx2.fillStyle = "rgba(255,255,255,0.08)";
  ctx2.fillRect(W - 120, 16, 100, 6);
  ctx2.fillStyle = playerColor;
  ctx2.fillRect(W - 120, 16, Math.min(100, progress * 100), 6);
  if (opts.mode !== "LIVE") {
    const borderColor = opts.mode === "KILLCAM" ? COLORS.killcamBorder : COLORS.replayBorder;
    ctx2.strokeStyle = borderColor;
    ctx2.lineWidth = 4;
    ctx2.strokeRect(2, 2, W - 4, H - 4);
    ctx2.lineWidth = 1;
  }
}
function renderMessage(ctx2, msg, sub) {
  const W = ctx2.canvas.width;
  const H = ctx2.canvas.height;
  ctx2.fillStyle = "rgba(13,17,23,0.75)";
  ctx2.fillRect(0, 0, W, H);
  ctx2.textAlign = "center";
  ctx2.fillStyle = "#f0f6fc";
  ctx2.font = 'bold 28px "JetBrains Mono", monospace';
  ctx2.fillText(msg, W / 2, H / 2 - 10);
  if (sub) {
    ctx2.font = '14px "JetBrains Mono", monospace';
    ctx2.fillStyle = "#8b949e";
    ctx2.fillText(sub, W / 2, H / 2 + 20);
  }
  ctx2.textAlign = "left";
}

// src/ui/eventlog.ts
var TYPE_COLORS = {
  GAME_STARTED: "#3dd68c",
  INPUT_CHANGED: "#58a6ff",
  PLAYER_DIED: "#f85149",
  PLAYER_WON: "#ffd700"
};
function renderEventLog(container, events, highlight) {
  const visible = events.slice(-18);
  container.innerHTML = visible.map((ev, i) => {
    const isNew = highlight != null && i === visible.length - 1 && ev.tick === highlight;
    const color = TYPE_COLORS[ev.type] ?? "#8b949e";
    const payloadStr = JSON.stringify(ev.payload);
    return `<div class="ev-row${isNew ? " ev-new" : ""}">
      <span class="ev-tick">${String(ev.tick).padStart(5, "0")}</span>
      <span class="ev-type" style="color:${color}">${ev.type}</span>
      <span class="ev-payload">${payloadStr}</span>
    </div>`;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

// src/main.ts
var TICK_RATE2 = 60;
var TICK_MS = 1e3 / TICK_RATE2;
var canvas = document.getElementById("game-canvas");
var ctx = canvas.getContext("2d");
var logPanel = document.getElementById("event-log");
var btnPlay = document.getElementById("btn-play");
var btnReplay = document.getElementById("btn-replay");
var btnKillcam = document.getElementById("btn-killcam");
var btnNew = document.getElementById("btn-new");
var seedInput = document.getElementById("seed-input");
var statusBar = document.getElementById("status-bar");
var appMode = "IDLE";
var gameState = null;
var currentInput = { left: false, right: false, jump: false };
var recorder = new Recorder();
var replayPlayer = new ReplayPlayer();
var allEvents = [];
var lastTime = 0;
var accumulator = 0;
var rafId = 0;
function getSeed() {
  const v = parseInt(seedInput.value);
  return isNaN(v) ? Math.floor(Math.random() * 99999) : v;
}
function setStatus(msg, color = "#8b949e") {
  statusBar.textContent = msg;
  statusBar.style.color = color;
}
function setButtons(live, replay, killcam) {
  btnReplay.toggleAttribute("disabled", !replay);
  btnKillcam.toggleAttribute("disabled", !killcam);
  btnPlay.textContent = live ? "\u23F9 Stop" : "\u25B6 Jouer";
}
function startGame() {
  if (appMode === "LIVE") {
    stopGame();
    return;
  }
  replayPlayer.stop();
  appMode = "LIVE";
  const seed = getSeed();
  seedInput.value = String(seed);
  const level = generateLevel(seed);
  gameState = {
    tick: 0,
    level,
    status: "PLAYING",
    player: { x: level.spawnX, y: level.spawnY, vx: 0, vy: 0, onGround: false, alive: true, won: false }
  };
  recorder.start(seed);
  allEvents = recorder.getReplay().events;
  setButtons(true, false, false);
  setStatus("\u25CF LIVE \u2014 fl\xE8ches ou WASD pour jouer", "#3dd68c");
  btnKillcam.toggleAttribute("disabled", true);
  cancelAnimationFrame(rafId);
  lastTime = 0;
  accumulator = 0;
  rafId = requestAnimationFrame(gameLoop);
}
function stopGame() {
  cancelAnimationFrame(rafId);
  appMode = "IDLE";
  setButtons(false, true, false);
}
function gameLoop(now) {
  if (appMode !== "LIVE" || !gameState)
    return;
  if (lastTime === 0)
    lastTime = now;
  accumulator += now - lastTime;
  lastTime = now;
  while (accumulator >= TICK_MS) {
    recorder.recordInput(gameState.tick, { ...currentInput });
    allEvents = recorder.getReplay().events;
    gameState = applyTick(gameState, currentInput);
    accumulator -= TICK_MS;
    if (gameState.status === "DEAD") {
      recorder.recordDeath(gameState.tick, gameState.player.x, gameState.player.y);
      allEvents = recorder.getReplay().events;
      renderEventLog(logPanel, allEvents);
      render(ctx, gameState, { mode: "LIVE", eventCount: recorder.getEventCount() });
      renderMessage(ctx, "\u{1F480} Game Over", "appuie sur Replay ou Killcam");
      setButtons(false, true, true);
      setStatus("Mort ! Tu peux rejouer ou voir le killcam.", "#f85149");
      appMode = "IDLE";
      return;
    }
    if (gameState.status === "WON") {
      recorder.recordWin(gameState.tick);
      allEvents = recorder.getReplay().events;
      renderEventLog(logPanel, allEvents);
      render(ctx, gameState, { mode: "LIVE", eventCount: recorder.getEventCount() });
      renderMessage(ctx, "\u{1F3C6} Victoire !", "appuie sur Replay pour revoir la partie");
      setButtons(false, true, false);
      setStatus("Victoire ! Replay disponible.", "#ffd700");
      appMode = "IDLE";
      return;
    }
  }
  render(ctx, gameState, { mode: "LIVE", eventCount: recorder.getEventCount() });
  renderEventLog(logPanel, allEvents, gameState.tick);
  rafId = requestAnimationFrame(gameLoop);
}
function startReplay(mode) {
  const data = recorder.getReplay();
  if (!data.events.length)
    return;
  appMode = mode === "KILLCAM" ? "KILLCAM" : "REPLAY";
  cancelAnimationFrame(rafId);
  replayPlayer.load(data, mode);
  const label = mode === "KILLCAM" ? "\u23EE KILLCAM" : "\u25B6 REPLAY";
  setStatus(`${label} en cours\u2026`, mode === "KILLCAM" ? "#f85149" : "#58a6ff");
  setButtons(false, false, false);
  replayPlayer.onStateUpdate = (state) => {
    render(ctx, state, { mode: appMode, eventCount: data.events.length });
    renderEventLog(logPanel, data.events);
  };
  replayPlayer.onFinished = () => {
    appMode = "IDLE";
    setButtons(false, true, data.deathTick != null);
    setStatus("Replay termin\xE9.", "#8b949e");
  };
  replayPlayer.play();
}
function newGame() {
  replayPlayer.stop();
  cancelAnimationFrame(rafId);
  appMode = "IDLE";
  seedInput.value = String(Math.floor(Math.random() * 99999));
  allEvents = [];
  logPanel.innerHTML = `<div style="color:#8b949e;padding:8px">En attente d'une partie\u2026</div>`;
  gameState = null;
  const tmpSeed = parseInt(seedInput.value);
  const level = generateLevel(tmpSeed);
  const tmpState = {
    tick: 0,
    level,
    status: "PLAYING",
    player: { x: level.spawnX, y: level.spawnY, vx: 0, vy: 0, onGround: false, alive: true, won: false }
  };
  render(ctx, tmpState, { mode: "LIVE" });
  setButtons(false, false, false);
  setStatus("Pr\xEAt \u2014 clique sur \u25B6 Jouer", "#8b949e");
}
var KEY_MAP = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump"
};
window.addEventListener("keydown", (e) => {
  const k = KEY_MAP[e.code];
  if (k) {
    e.preventDefault();
    currentInput = { ...currentInput, [k]: true };
  }
});
window.addEventListener("keyup", (e) => {
  const k = KEY_MAP[e.code];
  if (k) {
    e.preventDefault();
    currentInput = { ...currentInput, [k]: false };
  }
});
btnPlay.addEventListener("click", startGame);
btnReplay.addEventListener("click", () => startReplay("FULL"));
btnKillcam.addEventListener("click", () => startReplay("KILLCAM"));
btnNew.addEventListener("click", newGame);
newGame();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2NvcmUvbGV2ZWwudHMiLCAiLi4vc3JjL2NvcmUvcGh5c2ljcy50cyIsICIuLi9zcmMvcmVwbGF5L3JlY29yZGVyLnRzIiwgIi4uL3NyYy9yZXBsYXkvcGxheWVyLnRzIiwgIi4uL3NyYy9yZW5kZXIvY2FudmFzLnRzIiwgIi4uL3NyYy91aS9ldmVudGxvZy50cyIsICIuLi9zcmMvbWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHR5cGUgeyBMZXZlbCwgUGxhdGZvcm0gfSBmcm9tICcuL3R5cGVzLnRzJztcblxuLy8gTENHIGRcdTAwRTl0ZXJtaW5pc3RlIFx1MjAxNCBtXHUwMEVBbWUgc2VlZCA9IG1cdTAwRUFtZSBuaXZlYXUsIHRvdWpvdXJzXG5mdW5jdGlvbiBzZWVkZWRSbmcoc2VlZDogbnVtYmVyKSB7XG4gIGxldCBzID0gc2VlZDtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBzID0gKHMgKiAxNjY0NTI1ICsgMTAxMzkwNDIyMykgJiAweGZmZmZmZmZmO1xuICAgIHJldHVybiAocyA+Pj4gMCkgLyAweGZmZmZmZmZmO1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgTEVWRUxfSEVJR0hUID0gNDAwO1xuZXhwb3J0IGNvbnN0IEdST1VORF9ZID0gMzYwOyAvLyBZIGR1IHNvbCAoZW4gYmFzIGR1IGNhbnZhcyB2aXNpYmxlKVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVMZXZlbChzZWVkOiBudW1iZXIpOiBMZXZlbCB7XG4gIGNvbnN0IHJuZyA9IHNlZWRlZFJuZyhzZWVkKTtcbiAgY29uc3QgbGV2ZWxXaWR0aCA9IDI0MDA7XG5cbiAgY29uc3QgcGxhdGZvcm1zOiBQbGF0Zm9ybVtdID0gW107XG5cbiAgLy8gU29sIGRlIGRcdTAwRTlwYXJ0IChzYWZlIHpvbmUpXG4gIHBsYXRmb3Jtcy5wdXNoKHsgeDogMCwgeTogR1JPVU5EX1ksIHdpZHRoOiAyNjAsIGhlaWdodDogMjAgfSk7XG5cbiAgLy8gUGxhdGVmb3JtZXMgZ1x1MDBFOW5cdTAwRTlyXHUwMEU5ZXMgcGFyIGxhIHNlZWRcbiAgLy8gT24gYXZhbmNlIHBhciBcImNvbG9ubmVzXCIgZXNwYWNcdTAwRTllcyBkZSB+MTgwcHhcbiAgbGV0IGN1clggPSAzMDA7XG4gIHdoaWxlIChjdXJYIDwgbGV2ZWxXaWR0aCAtIDMwMCkge1xuICAgIGNvbnN0IGdhcFdpZHRoICA9IDYwICArIHJuZygpICogODA7ICAgLy8gdHJvdSBlbnRyZSA2MCBldCAxNDBweFxuICAgIGNvbnN0IHBsYXRXaWR0aCA9IDEwMCArIHJuZygpICogMTIwOyAgLy8gcGxhdGVmb3JtZSBlbnRyZSAxMDAgZXQgMjIwcHhcbiAgICBjb25zdCBwbGF0WSAgICAgPSBHUk9VTkRfWSAtIDYwIC0gcm5nKCkgKiAxNDA7IC8vIGhhdXRldXIgdmFyaWFibGVcblxuICAgIC8vIFBhcmZvaXMgdW5lIHBsYXRlZm9ybWUgYXUgc29sLCBwYXJmb2lzIGVuIGhhdXRldXJcbiAgICBjb25zdCBpc0VsZXZhdGVkID0gcm5nKCkgPiAwLjQ7XG4gICAgcGxhdGZvcm1zLnB1c2goe1xuICAgICAgeDogY3VyWCArIGdhcFdpZHRoLFxuICAgICAgeTogaXNFbGV2YXRlZCA/IHBsYXRZIDogR1JPVU5EX1ksXG4gICAgICB3aWR0aDogcGxhdFdpZHRoLFxuICAgICAgaGVpZ2h0OiAyMCxcbiAgICB9KTtcblxuICAgIGN1clggKz0gZ2FwV2lkdGggKyBwbGF0V2lkdGg7XG4gIH1cblxuICAvLyBQbGF0ZWZvcm1lIGQnYXJyaXZcdTAwRTllIChnb2FsKVxuICBjb25zdCBnb2FsWCA9IGxldmVsV2lkdGggLSAyMjA7XG4gIHBsYXRmb3Jtcy5wdXNoKHsgeDogZ29hbFgsIHk6IEdST1VORF9ZLCB3aWR0aDogMjYwLCBoZWlnaHQ6IDIwIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc2VlZCxcbiAgICBwbGF0Zm9ybXMsXG4gICAgd2lkdGg6IGxldmVsV2lkdGgsXG4gICAgaGVpZ2h0OiBMRVZFTF9IRUlHSFQsXG4gICAgc3Bhd25YOiA0MCxcbiAgICBzcGF3blk6IEdST1VORF9ZIC0gNDAsXG4gICAgZ29hbFg6IGdvYWxYICsgMjAwLFxuICB9O1xufVxuIiwgIi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gIFBIWVNJUVVFIFx1MjAxNCBwdXJlIGZ1bmN0aW9ucywgWkVSTyBzaWRlIGVmZmVjdHNcbi8vICBNXHUwMEVBbWUgR2FtZVN0YXRlICsgbVx1MDBFQW1lIElucHV0U25hcHNob3QgPT4gbVx1MDBFQW1lIEdhbWVTdGF0ZSBzdWl2YW50XG4vLyAgQydlc3QgY2V0dGUgcHJvcHJpXHUwMEU5dFx1MDBFOSBxdWkgcmVuZCBsZSByZXBsYXkgcG9zc2libGVcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuaW1wb3J0IHR5cGUgeyBHYW1lU3RhdGUsIElucHV0U25hcHNob3QsIFBsYXllclN0YXRlIH0gZnJvbSAnLi90eXBlcy50cyc7XG5pbXBvcnQgdHlwZSB7IFBsYXRmb3JtIH0gZnJvbSAnLi90eXBlcy50cyc7XG5cbmNvbnN0IEdSQVZJVFkgICAgICA9IDAuNDU7XG5jb25zdCBKVU1QX0ZPUkNFICAgPSAtMTIuNTtcbmNvbnN0IE1PVkVfU1BFRUQgICA9IDUuMDtcbmNvbnN0IEZSSUNUSU9OICAgICA9IDAuODI7XG5jb25zdCBQTEFZRVJfVyAgICAgPSAyODtcbmNvbnN0IFBMQVlFUl9IICAgICA9IDM2O1xuXG5mdW5jdGlvbiByZWN0T3ZlcmxhcChcbiAgYXg6IG51bWJlciwgYXk6IG51bWJlciwgYXc6IG51bWJlciwgYWg6IG51bWJlcixcbiAgYng6IG51bWJlciwgYnk6IG51bWJlciwgYnc6IG51bWJlciwgYmg6IG51bWJlcixcbik6IGJvb2xlYW4ge1xuICByZXR1cm4gYXggPCBieCArIGJ3ICYmIGF4ICsgYXcgPiBieCAmJiBheSA8IGJ5ICsgYmggJiYgYXkgKyBhaCA+IGJ5O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQ29sbGlzaW9ucyhwOiBQbGF5ZXJTdGF0ZSwgcGxhdGZvcm1zOiBQbGF0Zm9ybVtdKTogUGxheWVyU3RhdGUge1xuICBsZXQgeyB4LCB5LCB2eCwgdnksIG9uR3JvdW5kIH0gPSBwO1xuICBvbkdyb3VuZCA9IGZhbHNlO1xuXG4gIGZvciAoY29uc3QgcGxhdCBvZiBwbGF0Zm9ybXMpIHtcbiAgICBpZiAoIXJlY3RPdmVybGFwKHgsIHksIFBMQVlFUl9XLCBQTEFZRVJfSCwgcGxhdC54LCBwbGF0LnksIHBsYXQud2lkdGgsIHBsYXQuaGVpZ2h0KSkgY29udGludWU7XG5cbiAgICAvLyBPdmVybGFwIGRlcHRoc1xuICAgIGNvbnN0IG92ZXJsYXBMZWZ0ICAgPSAoeCArIFBMQVlFUl9XKSAtIHBsYXQueDtcbiAgICBjb25zdCBvdmVybGFwUmlnaHQgID0gKHBsYXQueCArIHBsYXQud2lkdGgpIC0geDtcbiAgICBjb25zdCBvdmVybGFwVG9wICAgID0gKHkgKyBQTEFZRVJfSCkgLSBwbGF0Lnk7XG4gICAgY29uc3Qgb3ZlcmxhcEJvdHRvbSA9IChwbGF0LnkgKyBwbGF0LmhlaWdodCkgLSB5O1xuXG4gICAgY29uc3QgbWluSCA9IE1hdGgubWluKG92ZXJsYXBMZWZ0LCBvdmVybGFwUmlnaHQpO1xuICAgIGNvbnN0IG1pblYgPSBNYXRoLm1pbihvdmVybGFwVG9wLCBvdmVybGFwQm90dG9tKTtcblxuICAgIGlmIChtaW5WIDwgbWluSCkge1xuICAgICAgaWYgKG92ZXJsYXBUb3AgPCBvdmVybGFwQm90dG9tKSB7XG4gICAgICAgIC8vIENvbGxpc2lvbiBwYXIgbGUgaGF1dCBcdTIwMTQgYXR0ZXJyaXNzYWdlXG4gICAgICAgIHkgPSBwbGF0LnkgLSBQTEFZRVJfSDtcbiAgICAgICAgdnkgPSAwO1xuICAgICAgICBvbkdyb3VuZCA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDb2xsaXNpb24gcGFyIGxlIGJhcyBcdTIwMTQgcGxhZm9uZFxuICAgICAgICB5ID0gcGxhdC55ICsgcGxhdC5oZWlnaHQ7XG4gICAgICAgIHZ5ID0gMDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKG92ZXJsYXBMZWZ0IDwgb3ZlcmxhcFJpZ2h0KSB7XG4gICAgICAgIHggPSBwbGF0LnggLSBQTEFZRVJfVztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHggPSBwbGF0LnggKyBwbGF0LndpZHRoO1xuICAgICAgfVxuICAgICAgdnggPSAwO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IC4uLnAsIHgsIHksIHZ4LCB2eSwgb25Hcm91bmQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5VGljayhzdGF0ZTogR2FtZVN0YXRlLCBpbnB1dDogSW5wdXRTbmFwc2hvdCk6IEdhbWVTdGF0ZSB7XG4gIGlmIChzdGF0ZS5zdGF0dXMgIT09ICdQTEFZSU5HJykgcmV0dXJuIHN0YXRlO1xuXG4gIGxldCB7IHgsIHksIHZ4LCB2eSwgb25Hcm91bmQsIGFsaXZlLCB3b24gfSA9IHN0YXRlLnBsYXllcjtcblxuICAvLyBJbnB1dHNcbiAgaWYgKGlucHV0LmxlZnQpICB2eCAtPSBNT1ZFX1NQRUVEO1xuICBpZiAoaW5wdXQucmlnaHQpIHZ4ICs9IE1PVkVfU1BFRUQ7XG4gIGlmIChpbnB1dC5qdW1wICYmIG9uR3JvdW5kKSB2eSA9IEpVTVBfRk9SQ0U7XG5cbiAgLy8gRnJpY3Rpb24gKyBncmF2aXRcdTAwRTlcbiAgdnggKj0gRlJJQ1RJT047XG4gIHZ5ICs9IEdSQVZJVFk7XG5cbiAgLy8gRFx1MDBFOXBsYWNlbWVudFxuICB4ICs9IHZ4O1xuICB5ICs9IHZ5O1xuXG4gIC8vIENsYW1wIGhvcml6b250YWwgZGFucyBsZSBuaXZlYXVcbiAgeCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHgsIHN0YXRlLmxldmVsLndpZHRoIC0gUExBWUVSX1cpKTtcblxuICBsZXQgcGxheWVyOiBQbGF5ZXJTdGF0ZSA9IHsgeCwgeSwgdngsIHZ5LCBvbkdyb3VuZCwgYWxpdmUsIHdvbiB9O1xuXG4gIC8vIENvbGxpc2lvbnMgcGxhdGVmb3JtZXNcbiAgcGxheWVyID0gcmVzb2x2ZUNvbGxpc2lvbnMocGxheWVyLCBzdGF0ZS5sZXZlbC5wbGF0Zm9ybXMpO1xuXG4gIC8vIE1vcnQgOiB0b21iXHUwMEU5IGhvcnMgZHUgY2FudmFzXG4gIGxldCBzdGF0dXM6ICdQTEFZSU5HJyB8ICdERUFEJyB8ICdXT04nID0gc3RhdGUuc3RhdHVzO1xuICBpZiAocGxheWVyLnkgPiBzdGF0ZS5sZXZlbC5oZWlnaHQgKyA2MCkge1xuICAgIHBsYXllciA9IHsgLi4ucGxheWVyLCBhbGl2ZTogZmFsc2UgfTtcbiAgICBzdGF0dXMgPSAnREVBRCc7XG4gIH1cblxuICAvLyBWaWN0b2lyZSA6IGF0dGVpbnQgbGUgZ29hbFxuICBpZiAocGxheWVyLnggPj0gc3RhdGUubGV2ZWwuZ29hbFggLSAyMCkge1xuICAgIHBsYXllciA9IHsgLi4ucGxheWVyLCB3b246IHRydWUgfTtcbiAgICBzdGF0dXMgPSAnV09OJztcbiAgfVxuXG4gIHJldHVybiB7IC4uLnN0YXRlLCB0aWNrOiBzdGF0ZS50aWNrICsgMSwgcGxheWVyLCBzdGF0dXMgfTtcbn1cblxuZXhwb3J0IHsgUExBWUVSX1csIFBMQVlFUl9IIH07XG4iLCAiLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyAgUkVDT1JERVIgXHUyMDE0IGVucmVnaXN0cmUgbGVzIGV2ZW50cyBwZW5kYW50IGxlIGpldSBsaXZlXG4vLyAgT24gbidlbnJlZ2lzdHJlIFBBUyA2MCBzbmFwc2hvdHMvc2VjLlxuLy8gIE9uIGVucmVnaXN0cmUgU0VVTEVNRU5UIGxlcyBjaGFuZ2VtZW50cyBkJ2lucHV0ICsgZXZlbnRzIG1cdTAwRTl0aWVyLlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5pbXBvcnQgdHlwZSB7IEdhbWVFdmVudCwgSW5wdXRTbmFwc2hvdCwgUmVwbGF5RGF0YSB9IGZyb20gJy4uL2NvcmUvdHlwZXMudHMnO1xuXG5leHBvcnQgY2xhc3MgUmVjb3JkZXIge1xuICBwcml2YXRlIGV2ZW50czogR2FtZUV2ZW50W10gPSBbXTtcbiAgcHJpdmF0ZSBsYXN0SW5wdXQ6IElucHV0U25hcHNob3QgPSB7IGxlZnQ6IGZhbHNlLCByaWdodDogZmFsc2UsIGp1bXA6IGZhbHNlIH07XG4gIHByaXZhdGUgbGV2ZWxTZWVkOiBudW1iZXIgPSAwO1xuICBwcml2YXRlIHN0YXJ0VGltZXN0YW1wOiBzdHJpbmcgPSAnJztcbiAgcHJpdmF0ZSBkZWF0aFRpY2s/OiBudW1iZXI7XG4gIHByaXZhdGUgZmluYWxUaWNrOiBudW1iZXIgPSAwO1xuXG4gIHN0YXJ0KGxldmVsU2VlZDogbnVtYmVyKSB7XG4gICAgdGhpcy5ldmVudHMgPSBbXTtcbiAgICB0aGlzLmxhc3RJbnB1dCA9IHsgbGVmdDogZmFsc2UsIHJpZ2h0OiBmYWxzZSwganVtcDogZmFsc2UgfTtcbiAgICB0aGlzLmxldmVsU2VlZCA9IGxldmVsU2VlZDtcbiAgICB0aGlzLnN0YXJ0VGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgIHRoaXMuZGVhdGhUaWNrID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuZmluYWxUaWNrID0gMDtcblxuICAgIHRoaXMuZXZlbnRzLnB1c2goe1xuICAgICAgdGljazogMCxcbiAgICAgIHR5cGU6ICdHQU1FX1NUQVJURUQnLFxuICAgICAgcGF5bG9hZDogeyBsZXZlbFNlZWQsIHRpbWVzdGFtcDogdGhpcy5zdGFydFRpbWVzdGFtcCB9LFxuICAgIH0pO1xuICB9XG5cbiAgLy8gQXBwZWxcdTAwRTkgXHUwMEUwIGNoYXF1ZSB0aWNrIFx1MjAxNCBuJ2VucmVnaXN0cmUgcXVlIHNpIGwnaW5wdXQgYSBjaGFuZ1x1MDBFOVxuICByZWNvcmRJbnB1dCh0aWNrOiBudW1iZXIsIGlucHV0OiBJbnB1dFNuYXBzaG90KSB7XG4gICAgY29uc3QgY2hhbmdlZCA9XG4gICAgICBpbnB1dC5sZWZ0ICAhPT0gdGhpcy5sYXN0SW5wdXQubGVmdCAgfHxcbiAgICAgIGlucHV0LnJpZ2h0ICE9PSB0aGlzLmxhc3RJbnB1dC5yaWdodCB8fFxuICAgICAgaW5wdXQuanVtcCAgIT09IHRoaXMubGFzdElucHV0Lmp1bXA7XG5cbiAgICBpZiAoY2hhbmdlZCkge1xuICAgICAgdGhpcy5ldmVudHMucHVzaCh7IHRpY2ssIHR5cGU6ICdJTlBVVF9DSEFOR0VEJywgcGF5bG9hZDogeyAuLi5pbnB1dCB9IH0pO1xuICAgICAgdGhpcy5sYXN0SW5wdXQgPSB7IC4uLmlucHV0IH07XG4gICAgfVxuICAgIHRoaXMuZmluYWxUaWNrID0gdGljaztcbiAgfVxuXG4gIHJlY29yZERlYXRoKHRpY2s6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICB0aGlzLmRlYXRoVGljayA9IHRpY2s7XG4gICAgdGhpcy5ldmVudHMucHVzaCh7IHRpY2ssIHR5cGU6ICdQTEFZRVJfRElFRCcsIHBheWxvYWQ6IHsgeCwgeSwgY2F1c2U6ICdmZWxsJyB9IH0pO1xuICAgIHRoaXMuZmluYWxUaWNrID0gdGljaztcbiAgfVxuXG4gIHJlY29yZFdpbih0aWNrOiBudW1iZXIpIHtcbiAgICB0aGlzLmV2ZW50cy5wdXNoKHsgdGljaywgdHlwZTogJ1BMQVlFUl9XT04nLCBwYXlsb2FkOiB7IHRpY2sgfSB9KTtcbiAgICB0aGlzLmZpbmFsVGljayA9IHRpY2s7XG4gIH1cblxuICBnZXRSZXBsYXkoKTogUmVwbGF5RGF0YSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGluaXRpYWxTdGF0ZTogeyBsZXZlbFNlZWQ6IHRoaXMubGV2ZWxTZWVkLCB0aW1lc3RhbXA6IHRoaXMuc3RhcnRUaW1lc3RhbXAgfSxcbiAgICAgIGV2ZW50czogWy4uLnRoaXMuZXZlbnRzXSxcbiAgICAgIGRlYXRoVGljazogdGhpcy5kZWF0aFRpY2ssXG4gICAgICB0b3RhbFRpY2tzOiB0aGlzLmZpbmFsVGljayxcbiAgICB9O1xuICB9XG5cbiAgZ2V0RXZlbnRDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ldmVudHMubGVuZ3RoOyB9XG59XG4iLCAiLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyAgUkVQTEFZIFBMQVlFUiBcdTIwMTQgcmVqb3VlIHVuIFJlcGxheURhdGFcbi8vICBUcm9pcyBtb2RlcyA6IEZVTEwgKGRlcHVpcyBsZSBkXHUwMEU5YnV0KSwgS0lMTENBTSAoNXMgYXZhbnQgbW9ydClcbi8vICBMZSBtb3RldXIgZXN0IGlkZW50aXF1ZSBhdSBqZXUgbGl2ZSBcdTIwMTQgbVx1MDBFQW1lIGFwcGx5VGljaygpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbmltcG9ydCB0eXBlIHsgR2FtZVN0YXRlLCBJbnB1dFNuYXBzaG90LCBSZXBsYXlEYXRhIH0gZnJvbSAnLi4vY29yZS90eXBlcy50cyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUxldmVsIH0gZnJvbSAnLi4vY29yZS9sZXZlbC50cyc7XG5pbXBvcnQgeyBhcHBseVRpY2sgfSBmcm9tICcuLi9jb3JlL3BoeXNpY3MudHMnO1xuXG5leHBvcnQgdHlwZSBSZXBsYXlNb2RlID0gJ0ZVTEwnIHwgJ0tJTExDQU0nO1xuXG5jb25zdCBUSUNLX1JBVEUgPSA2MDtcbmNvbnN0IEtJTExDQU1fU0VDT05EUyA9IDU7XG5cbmZ1bmN0aW9uIGJ1aWxkSW5wdXRBdFRpY2sodGljazogbnVtYmVyLCBldmVudHM6IFJlcGxheURhdGFbJ2V2ZW50cyddKTogSW5wdXRTbmFwc2hvdCB7XG4gIC8vIFJldHJvdXZlIGxlIGRlcm5pZXIgSU5QVVRfQ0hBTkdFRCBhdmFudCBjZSB0aWNrXG4gIGxldCBpbnB1dDogSW5wdXRTbmFwc2hvdCA9IHsgbGVmdDogZmFsc2UsIHJpZ2h0OiBmYWxzZSwganVtcDogZmFsc2UgfTtcbiAgZm9yIChjb25zdCBldiBvZiBldmVudHMpIHtcbiAgICBpZiAoZXYudGljayA+IHRpY2spIGJyZWFrO1xuICAgIGlmIChldi50eXBlID09PSAnSU5QVVRfQ0hBTkdFRCcpIHtcbiAgICAgIGlucHV0ID0gZXYucGF5bG9hZCBhcyB1bmtub3duIGFzIElucHV0U25hcHNob3Q7XG4gICAgfVxuICB9XG4gIHJldHVybiBpbnB1dDtcbn1cblxuZnVuY3Rpb24gYnVpbGRJbml0aWFsU3RhdGUocmVwbGF5OiBSZXBsYXlEYXRhKTogR2FtZVN0YXRlIHtcbiAgY29uc3QgbGV2ZWwgPSBnZW5lcmF0ZUxldmVsKHJlcGxheS5pbml0aWFsU3RhdGUubGV2ZWxTZWVkKTtcbiAgcmV0dXJuIHtcbiAgICB0aWNrOiAwLFxuICAgIGxldmVsLFxuICAgIHN0YXR1czogJ1BMQVlJTkcnLFxuICAgIHBsYXllcjoge1xuICAgICAgeDogbGV2ZWwuc3Bhd25YLCB5OiBsZXZlbC5zcGF3blksXG4gICAgICB2eDogMCwgdnk6IDAsXG4gICAgICBvbkdyb3VuZDogZmFsc2UsIGFsaXZlOiB0cnVlLCB3b246IGZhbHNlLFxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBSZWNvbnN0cnVpdCBsJ1x1MDBFOXRhdCBleGFjdCBhdSB0aWNrIGRlbWFuZFx1MDBFOSBlbiByZWpvdWFudCBkZXB1aXMgMCAqL1xuZnVuY3Rpb24gcmVidWlsZFN0YXRlQXRUaWNrKHJlcGxheTogUmVwbGF5RGF0YSwgdGFyZ2V0VGljazogbnVtYmVyKTogR2FtZVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gYnVpbGRJbml0aWFsU3RhdGUocmVwbGF5KTtcbiAgZm9yIChsZXQgdCA9IDA7IHQgPCB0YXJnZXRUaWNrOyB0KyspIHtcbiAgICBjb25zdCBpbnB1dCA9IGJ1aWxkSW5wdXRBdFRpY2sodCwgcmVwbGF5LmV2ZW50cyk7XG4gICAgc3RhdGUgPSBhcHBseVRpY2soc3RhdGUsIGlucHV0KTtcbiAgICAvLyBTaSBtb3J0IHByXHUwMEU5bWF0dXJcdTAwRTllIGF2YW50IHRhcmdldFRpY2ssIG9uIHJlbWV0IGVuIHZpZSAoa2lsbGNhbSBwYXJ0aWFsKVxuICAgIGlmIChzdGF0ZS5zdGF0dXMgPT09ICdERUFEJykgc3RhdGUgPSB7IC4uLnN0YXRlLCBzdGF0dXM6ICdQTEFZSU5HJywgcGxheWVyOiB7IC4uLnN0YXRlLnBsYXllciwgYWxpdmU6IHRydWUgfSB9O1xuICB9XG4gIHJldHVybiB7IC4uLnN0YXRlLCB0aWNrOiB0YXJnZXRUaWNrIH07XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsYXlQbGF5ZXIge1xuICBwcml2YXRlIHJlcGxheTogUmVwbGF5RGF0YSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGN1cnJlbnRUaWNrOiBudW1iZXIgPSAwO1xuICBwcml2YXRlIHN0YXJ0VGljazogbnVtYmVyID0gMDtcbiAgcHJpdmF0ZSBlbmRUaWNrOiBudW1iZXIgPSAwO1xuICBwcml2YXRlIHN0YXRlOiBHYW1lU3RhdGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBtb2RlOiBSZXBsYXlNb2RlID0gJ0ZVTEwnO1xuICBwcml2YXRlIHJ1bm5pbmc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgcHJpdmF0ZSByYWZJZD86IG51bWJlcjtcbiAgcHJpdmF0ZSBsYXN0VGltZT86IG51bWJlcjtcbiAgcHJpdmF0ZSBhY2N1bXVsYXRvcjogbnVtYmVyID0gMDtcbiAgcHJpdmF0ZSByZWFkb25seSBUSUNLX01TID0gMTAwMCAvIFRJQ0tfUkFURTtcblxuICBvblN0YXRlVXBkYXRlPzogKHN0YXRlOiBHYW1lU3RhdGUpID0+IHZvaWQ7XG4gIG9uRmluaXNoZWQ/OiAoKSA9PiB2b2lkO1xuXG4gIGxvYWQocmVwbGF5OiBSZXBsYXlEYXRhLCBtb2RlOiBSZXBsYXlNb2RlKSB7XG4gICAgdGhpcy5zdG9wKCk7XG4gICAgdGhpcy5yZXBsYXkgPSByZXBsYXk7XG4gICAgdGhpcy5tb2RlID0gbW9kZTtcblxuICAgIGlmIChtb2RlID09PSAnS0lMTENBTScgJiYgcmVwbGF5LmRlYXRoVGljayAhPSBudWxsKSB7XG4gICAgICB0aGlzLnN0YXJ0VGljayA9IE1hdGgubWF4KDAsIHJlcGxheS5kZWF0aFRpY2sgLSBLSUxMQ0FNX1NFQ09ORFMgKiBUSUNLX1JBVEUpO1xuICAgICAgdGhpcy5lbmRUaWNrICAgPSByZXBsYXkuZGVhdGhUaWNrICsgMzA7IC8vICswLjVzIGFwclx1MDBFOHMgbGEgbW9ydFxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnN0YXJ0VGljayA9IDA7XG4gICAgICB0aGlzLmVuZFRpY2sgICA9IHJlcGxheS50b3RhbFRpY2tzO1xuICAgIH1cblxuICAgIHRoaXMuc3RhdGUgPSByZWJ1aWxkU3RhdGVBdFRpY2socmVwbGF5LCB0aGlzLnN0YXJ0VGljayk7XG4gICAgdGhpcy5jdXJyZW50VGljayA9IHRoaXMuc3RhcnRUaWNrO1xuICB9XG5cbiAgcGxheSgpIHtcbiAgICBpZiAoIXRoaXMucmVwbGF5IHx8ICF0aGlzLnN0YXRlKSByZXR1cm47XG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcbiAgICB0aGlzLmFjY3VtdWxhdG9yID0gMDtcbiAgICB0aGlzLmxhc3RUaW1lID0gdW5kZWZpbmVkO1xuICAgIHRoaXMucmFmSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5sb29wLmJpbmQodGhpcykpO1xuICB9XG5cbiAgc3RvcCgpIHtcbiAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICBpZiAodGhpcy5yYWZJZCAhPSBudWxsKSBjYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnJhZklkKTtcbiAgfVxuXG4gIGdldEN1cnJlbnRTdGF0ZSgpOiBHYW1lU3RhdGUgfCBudWxsIHsgcmV0dXJuIHRoaXMuc3RhdGU7IH1cblxuICBwcml2YXRlIGxvb3Aobm93OiBudW1iZXIpIHtcbiAgICBpZiAoIXRoaXMucnVubmluZyB8fCAhdGhpcy5yZXBsYXkgfHwgIXRoaXMuc3RhdGUpIHJldHVybjtcblxuICAgIGlmICh0aGlzLmxhc3RUaW1lID09IG51bGwpIHRoaXMubGFzdFRpbWUgPSBub3c7XG4gICAgdGhpcy5hY2N1bXVsYXRvciArPSBub3cgLSB0aGlzLmxhc3RUaW1lO1xuICAgIHRoaXMubGFzdFRpbWUgPSBub3c7XG5cbiAgICB3aGlsZSAodGhpcy5hY2N1bXVsYXRvciA+PSB0aGlzLlRJQ0tfTVMpIHtcbiAgICAgIGlmICh0aGlzLmN1cnJlbnRUaWNrID49IHRoaXMuZW5kVGljaykge1xuICAgICAgICB0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5vbkZpbmlzaGVkPy4oKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpbnB1dCA9IGJ1aWxkSW5wdXRBdFRpY2sodGhpcy5jdXJyZW50VGljaywgdGhpcy5yZXBsYXkuZXZlbnRzKTtcbiAgICAgIHRoaXMuc3RhdGUgPSBhcHBseVRpY2sodGhpcy5zdGF0ZSwgaW5wdXQpO1xuXG4gICAgICAvLyBFbiBraWxsY2FtLCBvbiBuZSBsYWlzc2UgcGFzIGxlIHN0YXR1dCBERUFEIHN0b3BwZXIgbGUgcmVwbGF5IGF2YW50IGxhIGZpblxuICAgICAgaWYgKHRoaXMubW9kZSA9PT0gJ0tJTExDQU0nICYmIHRoaXMuc3RhdGUuc3RhdHVzID09PSAnREVBRCcgJiYgdGhpcy5jdXJyZW50VGljayA8IHRoaXMuZW5kVGljayAtIDEpIHtcbiAgICAgICAgLy8gbGFpc3NlciBjb250aW51ZXIgcG91ciB2b2lyIGxhIGNodXRlXG4gICAgICB9XG5cbiAgICAgIHRoaXMuY3VycmVudFRpY2srKztcbiAgICAgIHRoaXMuYWNjdW11bGF0b3IgLT0gdGhpcy5USUNLX01TO1xuICAgICAgdGhpcy5vblN0YXRlVXBkYXRlPy4odGhpcy5zdGF0ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5yYWZJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmxvb3AuYmluZCh0aGlzKSk7XG4gIH1cbn1cbiIsICIvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vICBSRU5ERVJFUiBcdTIwMTQgdG91dCBjZSBxdWkgZXN0IHZpc3VlbCwgWkVSTyBsb2dpcXVlIGRlIGpldVxuLy8gIFByZW5kIHVuIEdhbWVTdGF0ZSBldCBkZXNzaW5lLiBDJ2VzdCB0b3V0LlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5pbXBvcnQgdHlwZSB7IEdhbWVTdGF0ZSB9IGZyb20gJy4uL2NvcmUvdHlwZXMudHMnO1xuaW1wb3J0IHsgUExBWUVSX1csIFBMQVlFUl9IIH0gZnJvbSAnLi4vY29yZS9waHlzaWNzLnRzJztcbmltcG9ydCB7IEdST1VORF9ZIH0gZnJvbSAnLi4vY29yZS9sZXZlbC50cyc7XG5cbmNvbnN0IENPTE9SUyA9IHtcbiAgc2t5OiAgICAgICAgJyMwZDExMTcnLFxuICBza3lSZXBsYXk6ICAnIzBkMWEyZScsXG4gIHNreUtpbGxjYW06ICcjMWEwZDBkJyxcbiAgZ3JvdW5kOiAgICAgJyMyMTI2MmQnLFxuICBwbGF0Zm9ybTogICAnIzMwYTQ2YycsXG4gIHBsYXRmb3JtVG9wOicjM2RkNjhjJyxcbiAgcGxheWVyOiAgICAgJyM1OGE2ZmYnLFxuICBwbGF5ZXJEZWFkOiAnI2Y4NTE0OScsXG4gIHBsYXllcldvbjogICcjZmZkNzAwJyxcbiAgZ29hbDogICAgICAgJyNmZmQ3MDAnLFxuICBzdGFyczogICAgICAnIzhiOTQ5ZScsXG4gIGh1ZDogICAgICAgICcjZjBmNmZjJyxcbiAgaHVkTXV0ZWQ6ICAgJyM4Yjk0OWUnLFxuICByZXBsYXlCb3JkZXI6ICdyZ2JhKDg4LDE2NiwyNTUsMC40KScsXG4gIGtpbGxjYW1Cb3JkZXI6J3JnYmEoMjQ4LDgxLDczLDAuNiknLFxufTtcblxuaW50ZXJmYWNlIFJlbmRlck9wdGlvbnMge1xuICBtb2RlOiAnTElWRScgfCAnUkVQTEFZJyB8ICdLSUxMQ0FNJztcbiAgZXZlbnRDb3VudD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlcihcbiAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gIHN0YXRlOiBHYW1lU3RhdGUsXG4gIG9wdHM6IFJlbmRlck9wdGlvbnMsXG4pIHtcbiAgY29uc3QgVyA9IGN0eC5jYW52YXMud2lkdGg7XG4gIGNvbnN0IEggPSBjdHguY2FudmFzLmhlaWdodDtcblxuICAvLyBDYW1cdTAwRTlyYSA6IGNlbnRyZSBzdXIgbGUgam91ZXVyLCBjbGFtcCBhdXggYm9yZHMgZHUgbml2ZWF1XG4gIGNvbnN0IGNhbVggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihcbiAgICBzdGF0ZS5wbGF5ZXIueCAtIFcgLyAyLFxuICAgIHN0YXRlLmxldmVsLndpZHRoIC0gVyxcbiAgKSk7XG5cbiAgLy8gXHUyNTAwXHUyNTAwIEZvbmQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IHNreUNvbG9yID0gb3B0cy5tb2RlID09PSAnS0lMTENBTScgPyBDT0xPUlMuc2t5S2lsbGNhbVxuICAgIDogb3B0cy5tb2RlID09PSAnUkVQTEFZJyA/IENPTE9SUy5za3lSZXBsYXlcbiAgICA6IENPTE9SUy5za3k7XG4gIGN0eC5maWxsU3R5bGUgPSBza3lDb2xvcjtcbiAgY3R4LmZpbGxSZWN0KDAsIDAsIFcsIEgpO1xuXG4gIC8vIFx1MDBDOXRvaWxlcyAocHNldWRvLWZpeGVzLCBiYXNcdTAwRTllcyBzdXIgbGEgc2VlZClcbiAgY3R4LmZpbGxTdHlsZSA9IENPTE9SUy5zdGFycztcbiAgY29uc3Qgc3RhclJuZyA9IHN0YXRlLmxldmVsLnNlZWQ7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgNjA7IGkrKykge1xuICAgIGNvbnN0IHN4ID0gKChzdGFyUm5nICogKGkgKiAxMzcgKyA3MykpICUgc3RhdGUubGV2ZWwud2lkdGgpO1xuICAgIGNvbnN0IHN5ID0gKChzdGFyUm5nICogKGkgKiA0MSAgKyAxOSkpICUgKEdST1VORF9ZIC0gMjApKSAlIEg7XG4gICAgY29uc3Qgc2NyZWVuWCA9IChzeCAtIGNhbVggKyBzdGF0ZS5sZXZlbC53aWR0aCkgJSBzdGF0ZS5sZXZlbC53aWR0aDtcbiAgICBpZiAoc2NyZWVuWCA+PSAwICYmIHNjcmVlblggPD0gVykge1xuICAgICAgY3R4Lmdsb2JhbEFscGhhID0gMC4zICsgKGkgJSA1KSAqIDAuMTtcbiAgICAgIGN0eC5maWxsUmVjdChzY3JlZW5YLCBzeSAqIDAuNiwgMS41LCAxLjUpO1xuICAgIH1cbiAgfVxuICBjdHguZ2xvYmFsQWxwaGEgPSAxO1xuXG4gIC8vIFx1MjUwMFx1MjUwMCBQbGF0ZWZvcm1lcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgZm9yIChjb25zdCBwbGF0IG9mIHN0YXRlLmxldmVsLnBsYXRmb3Jtcykge1xuICAgIGNvbnN0IHN4ID0gcGxhdC54IC0gY2FtWDtcbiAgICBpZiAoc3ggKyBwbGF0LndpZHRoIDwgMCB8fCBzeCA+IFcpIGNvbnRpbnVlOyAvLyBjdWxsaW5nXG5cbiAgICAvLyBDb3Jwc1xuICAgIGN0eC5maWxsU3R5bGUgPSBDT0xPUlMucGxhdGZvcm07XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5yb3VuZFJlY3Qoc3gsIHBsYXQueSwgcGxhdC53aWR0aCwgcGxhdC5oZWlnaHQsIDMpO1xuICAgIGN0eC5maWxsKCk7XG5cbiAgICAvLyBCb3JkdXJlIHRvcCAoaGVyYmUpXG4gICAgY3R4LmZpbGxTdHlsZSA9IENPTE9SUy5wbGF0Zm9ybVRvcDtcbiAgICBjdHguZmlsbFJlY3Qoc3gsIHBsYXQueSwgcGxhdC53aWR0aCwgNCk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDAgR29hbCAoZHJhcGVhdSkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IGdvYWxTY3JlZW5YID0gc3RhdGUubGV2ZWwuZ29hbFggLSBjYW1YO1xuICBpZiAoZ29hbFNjcmVlblggPiAtMjAgJiYgZ29hbFNjcmVlblggPCBXICsgMjApIHtcbiAgICAvLyBQb3RlYXVcbiAgICBjdHguZmlsbFN0eWxlID0gQ09MT1JTLmdvYWw7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMC44O1xuICAgIGN0eC5maWxsUmVjdChnb2FsU2NyZWVuWCAtIDIsIEdST1VORF9ZIC0gNjAsIDQsIDYwKTtcbiAgICAvLyBEcmFwZWF1XG4gICAgY3R4LmZpbGxTdHlsZSA9IENPTE9SUy5nb2FsO1xuICAgIGN0eC5nbG9iYWxBbHBoYSA9IDAuOTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhnb2FsU2NyZWVuWCArIDIsIEdST1VORF9ZIC0gNjApO1xuICAgIGN0eC5saW5lVG8oZ29hbFNjcmVlblggKyAyMiwgR1JPVU5EX1kgLSA1MCk7XG4gICAgY3R4LmxpbmVUbyhnb2FsU2NyZWVuWCArIDIsIEdST1VORF9ZIC0gNDApO1xuICAgIGN0eC5maWxsKCk7XG4gICAgY3R4Lmdsb2JhbEFscGhhID0gMTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMCBKb3VldXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbnN0IHB4ID0gc3RhdGUucGxheWVyLnggLSBjYW1YO1xuICBjb25zdCBweSA9IHN0YXRlLnBsYXllci55O1xuXG4gIGNvbnN0IHBsYXllckNvbG9yID0gIXN0YXRlLnBsYXllci5hbGl2ZSA/IENPTE9SUy5wbGF5ZXJEZWFkXG4gICAgOiBzdGF0ZS5wbGF5ZXIud29uID8gQ09MT1JTLnBsYXllcldvblxuICAgIDogQ09MT1JTLnBsYXllcjtcblxuICAvLyBDb3Jwc1xuICBjdHguZmlsbFN0eWxlID0gcGxheWVyQ29sb3I7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4LnJvdW5kUmVjdChweCwgcHksIFBMQVlFUl9XLCBQTEFZRVJfSCwgNSk7XG4gIGN0eC5maWxsKCk7XG5cbiAgLy8gWWV1eCAoZGlyZWN0aW9uKVxuICBjb25zdCBleWVPZmZzZXRYID0gc3RhdGUucGxheWVyLnZ4ID4gMC4yID8gMTQgOiBzdGF0ZS5wbGF5ZXIudnggPCAtMC4yID8gNCA6IDk7XG4gIGN0eC5maWxsU3R5bGUgPSAnIzBkMTExNyc7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4LmFyYyhweCArIGV5ZU9mZnNldFgsIHB5ICsgMTEsIDQsIDAsIE1hdGguUEkgKiAyKTtcbiAgY3R4LmZpbGwoKTtcbiAgY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gIGN0eC5iZWdpblBhdGgoKTtcbiAgY3R4LmFyYyhweCArIGV5ZU9mZnNldFggKyAxLCBweSArIDEwLCAxLjUsIDAsIE1hdGguUEkgKiAyKTtcbiAgY3R4LmZpbGwoKTtcblxuICAvLyBcdTI1MDBcdTI1MDAgSFVEIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBjdHguZmlsbFN0eWxlID0gQ09MT1JTLmh1ZDtcbiAgY3R4LmZvbnQgPSAnYm9sZCAxNHB4IFwiSmV0QnJhaW5zIE1vbm9cIiwgbW9ub3NwYWNlJztcblxuICBjb25zdCBtb2RlTGFiZWwgPSBvcHRzLm1vZGUgPT09ICdLSUxMQ0FNJyA/ICdcdTIzRUUgS0lMTENBTSdcbiAgICA6IG9wdHMubW9kZSA9PT0gJ1JFUExBWScgPyAnXHUyNUI2IFJFUExBWSdcbiAgICA6ICdcdTI1Q0YgTElWRSc7XG4gIGN0eC5maWxsVGV4dChtb2RlTGFiZWwsIDE2LCAyOCk7XG5cbiAgY3R4LmZpbGxTdHlsZSA9IENPTE9SUy5odWRNdXRlZDtcbiAgY3R4LmZvbnQgPSAnMTJweCBcIkpldEJyYWlucyBNb25vXCIsIG1vbm9zcGFjZSc7XG4gIGN0eC5maWxsVGV4dChgdGljazogJHtzdGF0ZS50aWNrfWAsIDE2LCA0Nik7XG5cbiAgaWYgKG9wdHMuZXZlbnRDb3VudCAhPSBudWxsKSB7XG4gICAgY3R4LmZpbGxUZXh0KGBldmVudHM6ICR7b3B0cy5ldmVudENvdW50fWAsIDE2LCA2Mik7XG4gIH1cblxuICAvLyBCYXJyZSBkZSBwcm9ncmVzc2lvbiBuaXZlYXVcbiAgY29uc3QgcHJvZ3Jlc3MgPSBzdGF0ZS5wbGF5ZXIueCAvIHN0YXRlLmxldmVsLmdvYWxYO1xuICBjdHguZmlsbFN0eWxlID0gJ3JnYmEoMjU1LDI1NSwyNTUsMC4wOCknO1xuICBjdHguZmlsbFJlY3QoVyAtIDEyMCwgMTYsIDEwMCwgNik7XG4gIGN0eC5maWxsU3R5bGUgPSBwbGF5ZXJDb2xvcjtcbiAgY3R4LmZpbGxSZWN0KFcgLSAxMjAsIDE2LCBNYXRoLm1pbigxMDAsIHByb2dyZXNzICogMTAwKSwgNik7XG5cbiAgLy8gXHUyNTAwXHUyNTAwIE92ZXJsYXkgbW9kZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgaWYgKG9wdHMubW9kZSAhPT0gJ0xJVkUnKSB7XG4gICAgY29uc3QgYm9yZGVyQ29sb3IgPSBvcHRzLm1vZGUgPT09ICdLSUxMQ0FNJyA/IENPTE9SUy5raWxsY2FtQm9yZGVyIDogQ09MT1JTLnJlcGxheUJvcmRlcjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBib3JkZXJDb2xvcjtcbiAgICBjdHgubGluZVdpZHRoID0gNDtcbiAgICBjdHguc3Ryb2tlUmVjdCgyLCAyLCBXIC0gNCwgSCAtIDQpO1xuICAgIGN0eC5saW5lV2lkdGggPSAxO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJNZXNzYWdlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBtc2c6IHN0cmluZywgc3ViPzogc3RyaW5nKSB7XG4gIGNvbnN0IFcgPSBjdHguY2FudmFzLndpZHRoO1xuICBjb25zdCBIID0gY3R4LmNhbnZhcy5oZWlnaHQ7XG4gIGN0eC5maWxsU3R5bGUgPSAncmdiYSgxMywxNywyMywwLjc1KSc7XG4gIGN0eC5maWxsUmVjdCgwLCAwLCBXLCBIKTtcbiAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICBjdHguZmlsbFN0eWxlID0gJyNmMGY2ZmMnO1xuICBjdHguZm9udCA9ICdib2xkIDI4cHggXCJKZXRCcmFpbnMgTW9ub1wiLCBtb25vc3BhY2UnO1xuICBjdHguZmlsbFRleHQobXNnLCBXIC8gMiwgSCAvIDIgLSAxMCk7XG4gIGlmIChzdWIpIHtcbiAgICBjdHguZm9udCA9ICcxNHB4IFwiSmV0QnJhaW5zIE1vbm9cIiwgbW9ub3NwYWNlJztcbiAgICBjdHguZmlsbFN0eWxlID0gJyM4Yjk0OWUnO1xuICAgIGN0eC5maWxsVGV4dChzdWIsIFcgLyAyLCBIIC8gMiArIDIwKTtcbiAgfVxuICBjdHgudGV4dEFsaWduID0gJ2xlZnQnO1xufVxuIiwgIi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gIEVWRU5UIExPRyBVSSBcdTIwMTQgbGUgcGFubmVhdSBxdWkgYWZmaWNoZSBsZXMgZXZlbnRzIGVuIHRlbXBzIHJcdTAwRTllbFxuLy8gIEMnZXN0IExFIHBhbm5lYXUgcFx1MDBFOWRhZ29naXF1ZSBkdSB0YWxrIDogb24gdm9pdCBsZSBsb2cgZ3JhbmRpclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5pbXBvcnQgdHlwZSB7IEdhbWVFdmVudCB9IGZyb20gJy4uL2NvcmUvdHlwZXMudHMnO1xuXG5jb25zdCBUWVBFX0NPTE9SUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgR0FNRV9TVEFSVEVEOiAgJyMzZGQ2OGMnLFxuICBJTlBVVF9DSEFOR0VEOiAnIzU4YTZmZicsXG4gIFBMQVlFUl9ESUVEOiAgICcjZjg1MTQ5JyxcbiAgUExBWUVSX1dPTjogICAgJyNmZmQ3MDAnLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckV2ZW50TG9nKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV2ZW50czogR2FtZUV2ZW50W10sIGhpZ2hsaWdodD86IG51bWJlcikge1xuICAvLyBOZSBnYXJkZSBxdWUgbGVzIDE4IGRlcm5pZXJzIHBvdXIgbCdhZmZpY2hhZ2VcbiAgY29uc3QgdmlzaWJsZSA9IGV2ZW50cy5zbGljZSgtMTgpO1xuXG4gIGNvbnRhaW5lci5pbm5lckhUTUwgPSB2aXNpYmxlLm1hcCgoZXYsIGkpID0+IHtcbiAgICBjb25zdCBpc05ldyA9IGhpZ2hsaWdodCAhPSBudWxsICYmIGkgPT09IHZpc2libGUubGVuZ3RoIC0gMSAmJiBldi50aWNrID09PSBoaWdobGlnaHQ7XG4gICAgY29uc3QgY29sb3IgPSBUWVBFX0NPTE9SU1tldi50eXBlXSA/PyAnIzhiOTQ5ZSc7XG4gICAgY29uc3QgcGF5bG9hZFN0ciA9IEpTT04uc3RyaW5naWZ5KGV2LnBheWxvYWQpO1xuICAgIHJldHVybiBgPGRpdiBjbGFzcz1cImV2LXJvdyR7aXNOZXcgPyAnIGV2LW5ldycgOiAnJ31cIj5cbiAgICAgIDxzcGFuIGNsYXNzPVwiZXYtdGlja1wiPiR7U3RyaW5nKGV2LnRpY2spLnBhZFN0YXJ0KDUsICcwJyl9PC9zcGFuPlxuICAgICAgPHNwYW4gY2xhc3M9XCJldi10eXBlXCIgc3R5bGU9XCJjb2xvcjoke2NvbG9yfVwiPiR7ZXYudHlwZX08L3NwYW4+XG4gICAgICA8c3BhbiBjbGFzcz1cImV2LXBheWxvYWRcIj4ke3BheWxvYWRTdHJ9PC9zcGFuPlxuICAgIDwvZGl2PmA7XG4gIH0pLmpvaW4oJycpO1xuXG4gIC8vIEF1dG8tc2Nyb2xsIHZlcnMgbGUgYmFzXG4gIGNvbnRhaW5lci5zY3JvbGxUb3AgPSBjb250YWluZXIuc2Nyb2xsSGVpZ2h0O1xufVxuIiwgIi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gIE1BSU4gXHUyMDE0IG9yY2hlc3RyYXRpb24gZHUgamV1LCBkdSByZWNvcmRlciBldCBkdSByZXBsYXlcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuaW1wb3J0IHR5cGUgeyBHYW1lU3RhdGUsIElucHV0U25hcHNob3QsIEdhbWVFdmVudCB9IGZyb20gJy4vY29yZS90eXBlcy50cyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUxldmVsIH0gZnJvbSAnLi9jb3JlL2xldmVsLnRzJztcbmltcG9ydCB7IGFwcGx5VGljayB9IGZyb20gJy4vY29yZS9waHlzaWNzLnRzJztcbmltcG9ydCB7IFJlY29yZGVyIH0gZnJvbSAnLi9yZXBsYXkvcmVjb3JkZXIudHMnO1xuaW1wb3J0IHsgUmVwbGF5UGxheWVyIH0gZnJvbSAnLi9yZXBsYXkvcGxheWVyLnRzJztcbmltcG9ydCB7IHJlbmRlciwgcmVuZGVyTWVzc2FnZSB9IGZyb20gJy4vcmVuZGVyL2NhbnZhcy50cyc7XG5pbXBvcnQgeyByZW5kZXJFdmVudExvZyB9IGZyb20gJy4vdWkvZXZlbnRsb2cudHMnO1xuXG5jb25zdCBUSUNLX1JBVEUgPSA2MDtcbmNvbnN0IFRJQ0tfTVMgICA9IDEwMDAgLyBUSUNLX1JBVEU7XG5cbi8vIFx1MjUwMFx1MjUwMCBET00gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5jb25zdCBjYW52YXMgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZS1jYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcbmNvbnN0IGN0eCAgICAgICA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcbmNvbnN0IGxvZ1BhbmVsICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdldmVudC1sb2cnKSE7XG5jb25zdCBidG5QbGF5ICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLXBsYXknKSE7XG5jb25zdCBidG5SZXBsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLXJlcGxheScpITtcbmNvbnN0IGJ0bktpbGxjYW09IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidG4ta2lsbGNhbScpITtcbmNvbnN0IGJ0bk5ldyAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidG4tbmV3JykhO1xuY29uc3Qgc2VlZElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlZWQtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuY29uc3Qgc3RhdHVzQmFyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0YXR1cy1iYXInKSE7XG5cbi8vIFx1MjUwMFx1MjUwMCBTdGF0ZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbnR5cGUgQXBwTW9kZSA9ICdJRExFJyB8ICdMSVZFJyB8ICdSRVBMQVknIHwgJ0tJTExDQU0nO1xubGV0IGFwcE1vZGU6IEFwcE1vZGUgPSAnSURMRSc7XG5sZXQgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgfCBudWxsID0gbnVsbDtcbmxldCBjdXJyZW50SW5wdXQ6IElucHV0U25hcHNob3QgPSB7IGxlZnQ6IGZhbHNlLCByaWdodDogZmFsc2UsIGp1bXA6IGZhbHNlIH07XG5sZXQgcmVjb3JkZXIgPSBuZXcgUmVjb3JkZXIoKTtcbmxldCByZXBsYXlQbGF5ZXIgPSBuZXcgUmVwbGF5UGxheWVyKCk7XG5sZXQgYWxsRXZlbnRzOiBHYW1lRXZlbnRbXSA9IFtdO1xuXG4vLyBGaXhlZCB0aW1lc3RlcFxubGV0IGxhc3RUaW1lID0gMDtcbmxldCBhY2N1bXVsYXRvciA9IDA7XG5sZXQgcmFmSWQgPSAwO1xuXG4vLyBcdTI1MDBcdTI1MDAgSGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmZ1bmN0aW9uIGdldFNlZWQoKTogbnVtYmVyIHtcbiAgY29uc3QgdiA9IHBhcnNlSW50KHNlZWRJbnB1dC52YWx1ZSk7XG4gIHJldHVybiBpc05hTih2KSA/IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDk5OTk5KSA6IHY7XG59XG5cbmZ1bmN0aW9uIHNldFN0YXR1cyhtc2c6IHN0cmluZywgY29sb3IgPSAnIzhiOTQ5ZScpIHtcbiAgc3RhdHVzQmFyLnRleHRDb250ZW50ID0gbXNnO1xuICBzdGF0dXNCYXIuc3R5bGUuY29sb3IgPSBjb2xvcjtcbn1cblxuZnVuY3Rpb24gc2V0QnV0dG9ucyhsaXZlOiBib29sZWFuLCByZXBsYXk6IGJvb2xlYW4sIGtpbGxjYW06IGJvb2xlYW4pIHtcbiAgYnRuUmVwbGF5LnRvZ2dsZUF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAhcmVwbGF5KTtcbiAgYnRuS2lsbGNhbS50b2dnbGVBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgIWtpbGxjYW0pO1xuICBidG5QbGF5LnRleHRDb250ZW50ID0gbGl2ZSA/ICdcdTIzRjkgU3RvcCcgOiAnXHUyNUI2IEpvdWVyJztcbn1cblxuLy8gXHUyNTAwXHUyNTAwIERcdTAwRTltYXJyZXIgdW5lIHBhcnRpZSBsaXZlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZnVuY3Rpb24gc3RhcnRHYW1lKCkge1xuICBpZiAoYXBwTW9kZSA9PT0gJ0xJVkUnKSB7IHN0b3BHYW1lKCk7IHJldHVybjsgfVxuXG4gIHJlcGxheVBsYXllci5zdG9wKCk7XG4gIGFwcE1vZGUgPSAnTElWRSc7XG4gIGNvbnN0IHNlZWQgPSBnZXRTZWVkKCk7XG4gIHNlZWRJbnB1dC52YWx1ZSA9IFN0cmluZyhzZWVkKTtcblxuICBjb25zdCBsZXZlbCA9IGdlbmVyYXRlTGV2ZWwoc2VlZCk7XG4gIGdhbWVTdGF0ZSA9IHtcbiAgICB0aWNrOiAwLCBsZXZlbCwgc3RhdHVzOiAnUExBWUlORycsXG4gICAgcGxheWVyOiB7IHg6IGxldmVsLnNwYXduWCwgeTogbGV2ZWwuc3Bhd25ZLCB2eDogMCwgdnk6IDAsIG9uR3JvdW5kOiBmYWxzZSwgYWxpdmU6IHRydWUsIHdvbjogZmFsc2UgfSxcbiAgfTtcblxuICByZWNvcmRlci5zdGFydChzZWVkKTtcbiAgYWxsRXZlbnRzID0gcmVjb3JkZXIuZ2V0UmVwbGF5KCkuZXZlbnRzO1xuXG4gIHNldEJ1dHRvbnModHJ1ZSwgZmFsc2UsIGZhbHNlKTtcbiAgc2V0U3RhdHVzKCdcdTI1Q0YgTElWRSBcdTIwMTQgZmxcdTAwRThjaGVzIG91IFdBU0QgcG91ciBqb3VlcicsICcjM2RkNjhjJyk7XG4gIGJ0bktpbGxjYW0udG9nZ2xlQXR0cmlidXRlKCdkaXNhYmxlZCcsIHRydWUpO1xuXG4gIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJhZklkKTtcbiAgbGFzdFRpbWUgPSAwOyBhY2N1bXVsYXRvciA9IDA7XG4gIHJhZklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcbn1cblxuZnVuY3Rpb24gc3RvcEdhbWUoKSB7XG4gIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJhZklkKTtcbiAgYXBwTW9kZSA9ICdJRExFJztcbiAgc2V0QnV0dG9ucyhmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDAgQm91Y2xlIGRlIGpldSAoZml4ZWQgdGltZXN0ZXApIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZnVuY3Rpb24gZ2FtZUxvb3Aobm93OiBudW1iZXIpIHtcbiAgaWYgKGFwcE1vZGUgIT09ICdMSVZFJyB8fCAhZ2FtZVN0YXRlKSByZXR1cm47XG5cbiAgaWYgKGxhc3RUaW1lID09PSAwKSBsYXN0VGltZSA9IG5vdztcbiAgYWNjdW11bGF0b3IgKz0gbm93IC0gbGFzdFRpbWU7XG4gIGxhc3RUaW1lID0gbm93O1xuXG4gIHdoaWxlIChhY2N1bXVsYXRvciA+PSBUSUNLX01TKSB7XG4gICAgLy8gRW5yZWdpc3RyZSBsJ2lucHV0IEFWQU5UIGQnYXBwbGlxdWVyIGxlIHRpY2tcbiAgICByZWNvcmRlci5yZWNvcmRJbnB1dChnYW1lU3RhdGUudGljaywgeyAuLi5jdXJyZW50SW5wdXQgfSk7XG4gICAgYWxsRXZlbnRzID0gcmVjb3JkZXIuZ2V0UmVwbGF5KCkuZXZlbnRzO1xuXG4gICAgZ2FtZVN0YXRlID0gYXBwbHlUaWNrKGdhbWVTdGF0ZSwgY3VycmVudElucHV0KTtcbiAgICBhY2N1bXVsYXRvciAtPSBUSUNLX01TO1xuXG4gICAgaWYgKGdhbWVTdGF0ZS5zdGF0dXMgPT09ICdERUFEJykge1xuICAgICAgcmVjb3JkZXIucmVjb3JkRGVhdGgoZ2FtZVN0YXRlLnRpY2ssIGdhbWVTdGF0ZS5wbGF5ZXIueCwgZ2FtZVN0YXRlLnBsYXllci55KTtcbiAgICAgIGFsbEV2ZW50cyA9IHJlY29yZGVyLmdldFJlcGxheSgpLmV2ZW50cztcbiAgICAgIHJlbmRlckV2ZW50TG9nKGxvZ1BhbmVsLCBhbGxFdmVudHMpO1xuICAgICAgcmVuZGVyKGN0eCwgZ2FtZVN0YXRlLCB7IG1vZGU6ICdMSVZFJywgZXZlbnRDb3VudDogcmVjb3JkZXIuZ2V0RXZlbnRDb3VudCgpIH0pO1xuICAgICAgcmVuZGVyTWVzc2FnZShjdHgsICdcdUQ4M0RcdURDODAgR2FtZSBPdmVyJywgJ2FwcHVpZSBzdXIgUmVwbGF5IG91IEtpbGxjYW0nKTtcbiAgICAgIHNldEJ1dHRvbnMoZmFsc2UsIHRydWUsIHRydWUpO1xuICAgICAgc2V0U3RhdHVzKCdNb3J0ICEgVHUgcGV1eCByZWpvdWVyIG91IHZvaXIgbGUga2lsbGNhbS4nLCAnI2Y4NTE0OScpO1xuICAgICAgYXBwTW9kZSA9ICdJRExFJztcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoZ2FtZVN0YXRlLnN0YXR1cyA9PT0gJ1dPTicpIHtcbiAgICAgIHJlY29yZGVyLnJlY29yZFdpbihnYW1lU3RhdGUudGljayk7XG4gICAgICBhbGxFdmVudHMgPSByZWNvcmRlci5nZXRSZXBsYXkoKS5ldmVudHM7XG4gICAgICByZW5kZXJFdmVudExvZyhsb2dQYW5lbCwgYWxsRXZlbnRzKTtcbiAgICAgIHJlbmRlcihjdHgsIGdhbWVTdGF0ZSwgeyBtb2RlOiAnTElWRScsIGV2ZW50Q291bnQ6IHJlY29yZGVyLmdldEV2ZW50Q291bnQoKSB9KTtcbiAgICAgIHJlbmRlck1lc3NhZ2UoY3R4LCAnXHVEODNDXHVERkM2IFZpY3RvaXJlICEnLCAnYXBwdWllIHN1ciBSZXBsYXkgcG91ciByZXZvaXIgbGEgcGFydGllJyk7XG4gICAgICBzZXRCdXR0b25zKGZhbHNlLCB0cnVlLCBmYWxzZSk7XG4gICAgICBzZXRTdGF0dXMoJ1ZpY3RvaXJlICEgUmVwbGF5IGRpc3BvbmlibGUuJywgJyNmZmQ3MDAnKTtcbiAgICAgIGFwcE1vZGUgPSAnSURMRSc7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG5cbiAgcmVuZGVyKGN0eCwgZ2FtZVN0YXRlLCB7IG1vZGU6ICdMSVZFJywgZXZlbnRDb3VudDogcmVjb3JkZXIuZ2V0RXZlbnRDb3VudCgpIH0pO1xuICByZW5kZXJFdmVudExvZyhsb2dQYW5lbCwgYWxsRXZlbnRzLCBnYW1lU3RhdGUudGljayk7XG4gIHJhZklkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwIFJlcGxheSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmZ1bmN0aW9uIHN0YXJ0UmVwbGF5KG1vZGU6ICdGVUxMJyB8ICdLSUxMQ0FNJykge1xuICBjb25zdCBkYXRhID0gcmVjb3JkZXIuZ2V0UmVwbGF5KCk7XG4gIGlmICghZGF0YS5ldmVudHMubGVuZ3RoKSByZXR1cm47XG5cbiAgYXBwTW9kZSA9IG1vZGUgPT09ICdLSUxMQ0FNJyA/ICdLSUxMQ0FNJyA6ICdSRVBMQVknO1xuICBjYW5jZWxBbmltYXRpb25GcmFtZShyYWZJZCk7XG5cbiAgcmVwbGF5UGxheWVyLmxvYWQoZGF0YSwgbW9kZSk7XG5cbiAgY29uc3QgbGFiZWwgPSBtb2RlID09PSAnS0lMTENBTScgPyAnXHUyM0VFIEtJTExDQU0nIDogJ1x1MjVCNiBSRVBMQVknO1xuICBzZXRTdGF0dXMoYCR7bGFiZWx9IGVuIGNvdXJzXHUyMDI2YCwgbW9kZSA9PT0gJ0tJTExDQU0nID8gJyNmODUxNDknIDogJyM1OGE2ZmYnKTtcbiAgc2V0QnV0dG9ucyhmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblxuICByZXBsYXlQbGF5ZXIub25TdGF0ZVVwZGF0ZSA9IChzdGF0ZSkgPT4ge1xuICAgIHJlbmRlcihjdHgsIHN0YXRlLCB7IG1vZGU6IGFwcE1vZGUgYXMgJ1JFUExBWScgfCAnS0lMTENBTScsIGV2ZW50Q291bnQ6IGRhdGEuZXZlbnRzLmxlbmd0aCB9KTtcbiAgICByZW5kZXJFdmVudExvZyhsb2dQYW5lbCwgZGF0YS5ldmVudHMpO1xuICB9O1xuXG4gIHJlcGxheVBsYXllci5vbkZpbmlzaGVkID0gKCkgPT4ge1xuICAgIGFwcE1vZGUgPSAnSURMRSc7XG4gICAgc2V0QnV0dG9ucyhmYWxzZSwgdHJ1ZSwgZGF0YS5kZWF0aFRpY2sgIT0gbnVsbCk7XG4gICAgc2V0U3RhdHVzKCdSZXBsYXkgdGVybWluXHUwMEU5LicsICcjOGI5NDllJyk7XG4gIH07XG5cbiAgcmVwbGF5UGxheWVyLnBsYXkoKTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwIE5vdXZlbGxlIHBhcnRpZSAobm91dmVhdSBzZWVkKSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmZ1bmN0aW9uIG5ld0dhbWUoKSB7XG4gIHJlcGxheVBsYXllci5zdG9wKCk7XG4gIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJhZklkKTtcbiAgYXBwTW9kZSA9ICdJRExFJztcbiAgc2VlZElucHV0LnZhbHVlID0gU3RyaW5nKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDk5OTk5KSk7XG4gIGFsbEV2ZW50cyA9IFtdO1xuICBsb2dQYW5lbC5pbm5lckhUTUwgPSAnPGRpdiBzdHlsZT1cImNvbG9yOiM4Yjk0OWU7cGFkZGluZzo4cHhcIj5FbiBhdHRlbnRlIGRcXCd1bmUgcGFydGllXHUyMDI2PC9kaXY+JztcbiAgZ2FtZVN0YXRlID0gbnVsbDtcbiAgY29uc3QgdG1wU2VlZCA9IHBhcnNlSW50KHNlZWRJbnB1dC52YWx1ZSk7XG4gIGNvbnN0IGxldmVsID0gZ2VuZXJhdGVMZXZlbCh0bXBTZWVkKTtcbiAgY29uc3QgdG1wU3RhdGU6IEdhbWVTdGF0ZSA9IHtcbiAgICB0aWNrOiAwLCBsZXZlbCwgc3RhdHVzOiAnUExBWUlORycsXG4gICAgcGxheWVyOiB7IHg6IGxldmVsLnNwYXduWCwgeTogbGV2ZWwuc3Bhd25ZLCB2eDogMCwgdnk6IDAsIG9uR3JvdW5kOiBmYWxzZSwgYWxpdmU6IHRydWUsIHdvbjogZmFsc2UgfSxcbiAgfTtcbiAgcmVuZGVyKGN0eCwgdG1wU3RhdGUsIHsgbW9kZTogJ0xJVkUnIH0pO1xuICBzZXRCdXR0b25zKGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuICBzZXRTdGF0dXMoJ1ByXHUwMEVBdCBcdTIwMTQgY2xpcXVlIHN1ciBcdTI1QjYgSm91ZXInLCAnIzhiOTQ5ZScpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDAgSW5wdXRzIGNsYXZpZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5jb25zdCBLRVlfTUFQOiBSZWNvcmQ8c3RyaW5nLCBrZXlvZiBJbnB1dFNuYXBzaG90PiA9IHtcbiAgQXJyb3dMZWZ0OiAnbGVmdCcsIEtleUE6ICdsZWZ0JyxcbiAgQXJyb3dSaWdodDogJ3JpZ2h0JywgS2V5RDogJ3JpZ2h0JyxcbiAgQXJyb3dVcDogJ2p1bXAnLCBLZXlXOiAnanVtcCcsIFNwYWNlOiAnanVtcCcsXG59O1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gIGNvbnN0IGsgPSBLRVlfTUFQW2UuY29kZV07XG4gIGlmIChrKSB7IGUucHJldmVudERlZmF1bHQoKTsgY3VycmVudElucHV0ID0geyAuLi5jdXJyZW50SW5wdXQsIFtrXTogdHJ1ZSB9OyB9XG59KTtcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlKSA9PiB7XG4gIGNvbnN0IGsgPSBLRVlfTUFQW2UuY29kZV07XG4gIGlmIChrKSB7IGUucHJldmVudERlZmF1bHQoKTsgY3VycmVudElucHV0ID0geyAuLi5jdXJyZW50SW5wdXQsIFtrXTogZmFsc2UgfTsgfVxufSk7XG5cbi8vIFx1MjUwMFx1MjUwMCBCb3V0b25zIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuYnRuUGxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHN0YXJ0R2FtZSk7XG5idG5SZXBsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBzdGFydFJlcGxheSgnRlVMTCcpKTtcbmJ0bktpbGxjYW0uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBzdGFydFJlcGxheSgnS0lMTENBTScpKTtcbmJ0bk5ldy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIG5ld0dhbWUpO1xuXG4vLyBcdTI1MDBcdTI1MDAgSW5pdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbm5ld0dhbWUoKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFHQSxTQUFTLFVBQVUsTUFBYztBQUMvQixNQUFJLElBQUk7QUFDUixTQUFPLE1BQU07QUFDWCxRQUFLLElBQUksVUFBVSxhQUFjO0FBQ2pDLFlBQVEsTUFBTSxLQUFLO0FBQUEsRUFDckI7QUFDRjtBQUVPLElBQU0sZUFBZTtBQUNyQixJQUFNLFdBQVc7QUFFakIsU0FBUyxjQUFjLE1BQXFCO0FBQ2pELFFBQU0sTUFBTSxVQUFVLElBQUk7QUFDMUIsUUFBTSxhQUFhO0FBRW5CLFFBQU0sWUFBd0IsQ0FBQztBQUcvQixZQUFVLEtBQUssRUFBRSxHQUFHLEdBQUcsR0FBRyxVQUFVLE9BQU8sS0FBSyxRQUFRLEdBQUcsQ0FBQztBQUk1RCxNQUFJLE9BQU87QUFDWCxTQUFPLE9BQU8sYUFBYSxLQUFLO0FBQzlCLFVBQU0sV0FBWSxLQUFNLElBQUksSUFBSTtBQUNoQyxVQUFNLFlBQVksTUFBTSxJQUFJLElBQUk7QUFDaEMsVUFBTSxRQUFZLFdBQVcsS0FBSyxJQUFJLElBQUk7QUFHMUMsVUFBTSxhQUFhLElB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
