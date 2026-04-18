// ============================================================
//  MAIN — orchestration du jeu, du recorder et du replay
// ============================================================
import type { GameState, InputSnapshot, GameEvent } from './core/types.ts';
import { generateLevel } from './core/level.ts';
import { applyTick } from './core/physics.ts';
import { Recorder } from './replay/recorder.ts';
import { ReplayPlayer } from './replay/player.ts';
import { render, renderMessage } from './render/canvas.ts';
import { renderEventLog } from './ui/eventlog.ts';

const TICK_RATE = 60;
const TICK_MS   = 1000 / TICK_RATE;

// ── DOM ──────────────────────────────────────────────────────
const canvas    = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx       = canvas.getContext('2d')!;
const logPanel  = document.getElementById('event-log')!;
const btnPlay   = document.getElementById('btn-play')!;
const btnReplay = document.getElementById('btn-replay')!;
const btnKillcam= document.getElementById('btn-killcam')!;
const btnNew    = document.getElementById('btn-new')!;
const seedInput = document.getElementById('seed-input') as HTMLInputElement;
const statusBar = document.getElementById('status-bar')!;

// ── State ─────────────────────────────────────────────────────
type AppMode = 'IDLE' | 'LIVE' | 'REPLAY' | 'KILLCAM';
let appMode: AppMode = 'IDLE';
let gameState: GameState | null = null;
let currentInput: InputSnapshot = { left: false, right: false, jump: false };
let recorder = new Recorder();
let replayPlayer = new ReplayPlayer();
let allEvents: GameEvent[] = [];

// Fixed timestep
let lastTime = 0;
let accumulator = 0;
let rafId = 0;

// ── Helpers ───────────────────────────────────────────────────
function getSeed(): number {
  const v = parseInt(seedInput.value);
  return isNaN(v) ? Math.floor(Math.random() * 99999) : v;
}

function setStatus(msg: string, color = '#8b949e') {
  statusBar.textContent = msg;
  statusBar.style.color = color;
}

function setButtons(live: boolean, replay: boolean, killcam: boolean) {
  btnReplay.toggleAttribute('disabled', !replay);
  btnKillcam.toggleAttribute('disabled', !killcam);
  btnPlay.textContent = live ? '⏹ Stop' : '▶ Jouer';
}

// ── Démarrer une partie live ──────────────────────────────────
function startGame() {
  if (appMode === 'LIVE') { stopGame(); return; }

  replayPlayer.stop();
  appMode = 'LIVE';
  const seed = getSeed();
  seedInput.value = String(seed);

  const level = generateLevel(seed);
  gameState = {
    tick: 0, level, status: 'PLAYING',
    player: { x: level.spawnX, y: level.spawnY, vx: 0, vy: 0, onGround: false, alive: true, won: false },
  };

  recorder.start(seed);
  allEvents = recorder.getReplay().events;

  setButtons(true, false, false);
  setStatus('● LIVE — flèches ou WASD pour jouer', '#3dd68c');
  btnKillcam.toggleAttribute('disabled', true);

  cancelAnimationFrame(rafId);
  lastTime = 0; accumulator = 0;
  rafId = requestAnimationFrame(gameLoop);
}

function stopGame() {
  cancelAnimationFrame(rafId);
  appMode = 'IDLE';
  setButtons(false, true, false);
}

// ── Boucle de jeu (fixed timestep) ───────────────────────────
function gameLoop(now: number) {
  if (appMode !== 'LIVE' || !gameState) return;

  if (lastTime === 0) lastTime = now;
  accumulator += now - lastTime;
  lastTime = now;

  while (accumulator >= TICK_MS) {
    // Enregistre l'input AVANT d'appliquer le tick
    recorder.recordInput(gameState.tick, { ...currentInput });
    allEvents = recorder.getReplay().events;

    gameState = applyTick(gameState, currentInput);
    accumulator -= TICK_MS;

    if (gameState.status === 'DEAD') {
      recorder.recordDeath(gameState.tick, gameState.player.x, gameState.player.y);
      allEvents = recorder.getReplay().events;
      renderEventLog(logPanel, allEvents);
      render(ctx, gameState, { mode: 'LIVE', eventCount: recorder.getEventCount() });
      renderMessage(ctx, '💀 Game Over', 'appuie sur Replay ou Killcam');
      setButtons(false, true, true);
      setStatus('Mort ! Tu peux rejouer ou voir le killcam.', '#f85149');
      appMode = 'IDLE';
      return;
    }

    if (gameState.status === 'WON') {
      recorder.recordWin(gameState.tick);
      allEvents = recorder.getReplay().events;
      renderEventLog(logPanel, allEvents);
      render(ctx, gameState, { mode: 'LIVE', eventCount: recorder.getEventCount() });
      renderMessage(ctx, '🏆 Victoire !', 'appuie sur Replay pour revoir la partie');
      setButtons(false, true, false);
      setStatus('Victoire ! Replay disponible.', '#ffd700');
      appMode = 'IDLE';
      return;
    }
  }

  render(ctx, gameState, { mode: 'LIVE', eventCount: recorder.getEventCount() });
  renderEventLog(logPanel, allEvents, gameState.tick);
  rafId = requestAnimationFrame(gameLoop);
}

// ── Replay ───────────────────────────────────────────────────
function startReplay(mode: 'FULL' | 'KILLCAM') {
  const data = recorder.getReplay();
  if (!data.events.length) return;

  appMode = mode === 'KILLCAM' ? 'KILLCAM' : 'REPLAY';
  cancelAnimationFrame(rafId);

  replayPlayer.load(data, mode);

  const label = mode === 'KILLCAM' ? '⏮ KILLCAM' : '▶ REPLAY';
  setStatus(`${label} en cours…`, mode === 'KILLCAM' ? '#f85149' : '#58a6ff');
  setButtons(false, false, false);

  replayPlayer.onStateUpdate = (state) => {
    render(ctx, state, { mode: appMode as 'REPLAY' | 'KILLCAM', eventCount: data.events.length });
    renderEventLog(logPanel, data.events);
  };

  replayPlayer.onFinished = () => {
    appMode = 'IDLE';
    setButtons(false, true, data.deathTick != null);
    setStatus('Replay terminé.', '#8b949e');
  };

  replayPlayer.play();
}

// ── Nouvelle partie (nouveau seed) ───────────────────────────
function newGame() {
  replayPlayer.stop();
  cancelAnimationFrame(rafId);
  appMode = 'IDLE';
  seedInput.value = String(Math.floor(Math.random() * 99999));
  allEvents = [];
  logPanel.innerHTML = '<div style="color:#8b949e;padding:8px">En attente d\'une partie…</div>';
  gameState = null;
  const tmpSeed = parseInt(seedInput.value);
  const level = generateLevel(tmpSeed);
  const tmpState: GameState = {
    tick: 0, level, status: 'PLAYING',
    player: { x: level.spawnX, y: level.spawnY, vx: 0, vy: 0, onGround: false, alive: true, won: false },
  };
  render(ctx, tmpState, { mode: 'LIVE' });
  setButtons(false, false, false);
  setStatus('Prêt — clique sur ▶ Jouer', '#8b949e');
}

// ── Inputs clavier ────────────────────────────────────────────
const KEY_MAP: Record<string, keyof InputSnapshot> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
};

window.addEventListener('keydown', (e) => {
  const k = KEY_MAP[e.code];
  if (k) { e.preventDefault(); currentInput = { ...currentInput, [k]: true }; }
});
window.addEventListener('keyup', (e) => {
  const k = KEY_MAP[e.code];
  if (k) { e.preventDefault(); currentInput = { ...currentInput, [k]: false }; }
});

// ── Boutons ───────────────────────────────────────────────────
btnPlay.addEventListener('click', startGame);
btnReplay.addEventListener('click', () => startReplay('FULL'));
btnKillcam.addEventListener('click', () => startReplay('KILLCAM'));
btnNew.addEventListener('click', newGame);

// ── Init ─────────────────────────────────────────────────────
newGame();
