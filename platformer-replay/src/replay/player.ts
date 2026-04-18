// ============================================================
//  REPLAY PLAYER — rejoue un ReplayData
//  Trois modes : FULL (depuis le début), KILLCAM (5s avant mort)
//  Le moteur est identique au jeu live — même applyTick()
// ============================================================
import type { GameState, InputSnapshot, ReplayData } from '../core/types.ts';
import { generateLevel } from '../core/level.ts';
import { applyTick } from '../core/physics.ts';

export type ReplayMode = 'FULL' | 'KILLCAM';

const TICK_RATE = 60;
const KILLCAM_SECONDS = 5;

function buildInputAtTick(tick: number, events: ReplayData['events']): InputSnapshot {
  // Retrouve le dernier INPUT_CHANGED avant ce tick
  let input: InputSnapshot = { left: false, right: false, jump: false };
  for (const ev of events) {
    if (ev.tick > tick) break;
    if (ev.type === 'INPUT_CHANGED') {
      input = ev.payload as unknown as InputSnapshot;
    }
  }
  return input;
}

function buildInitialState(replay: ReplayData): GameState {
  const level = generateLevel(replay.initialState.levelSeed);
  return {
    tick: 0,
    level,
    status: 'PLAYING',
    player: {
      x: level.spawnX, y: level.spawnY,
      vx: 0, vy: 0,
      onGround: false, alive: true, won: false,
    },
  };
}

/** Reconstruit l'état exact au tick demandé en rejouant depuis 0 */
function rebuildStateAtTick(replay: ReplayData, targetTick: number): GameState {
  let state = buildInitialState(replay);
  for (let t = 0; t < targetTick; t++) {
    const input = buildInputAtTick(t, replay.events);
    state = applyTick(state, input);
    // Si mort prématurée avant targetTick, on remet en vie (killcam partial)
    if (state.status === 'DEAD') state = { ...state, status: 'PLAYING', player: { ...state.player, alive: true } };
  }
  return { ...state, tick: targetTick };
}

export class ReplayPlayer {
  private replay: ReplayData | null = null;
  private currentTick: number = 0;
  private startTick: number = 0;
  private endTick: number = 0;
  private state: GameState | null = null;
  private mode: ReplayMode = 'FULL';
  private running: boolean = false;
  private rafId?: number;
  private lastTime?: number;
  private accumulator: number = 0;
  private readonly TICK_MS = 1000 / TICK_RATE;

  onStateUpdate?: (state: GameState) => void;
  onFinished?: () => void;

  load(replay: ReplayData, mode: ReplayMode) {
    this.stop();
    this.replay = replay;
    this.mode = mode;

    if (mode === 'KILLCAM' && replay.deathTick != null) {
      this.startTick = Math.max(0, replay.deathTick - KILLCAM_SECONDS * TICK_RATE);
      this.endTick   = replay.deathTick + 30; // +0.5s après la mort
    } else {
      this.startTick = 0;
      this.endTick   = replay.totalTicks;
    }

    this.state = rebuildStateAtTick(replay, this.startTick);
    this.currentTick = this.startTick;
  }

  play() {
    if (!this.replay || !this.state) return;
    this.running = true;
    this.accumulator = 0;
    this.lastTime = undefined;
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  stop() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
  }

  getCurrentState(): GameState | null { return this.state; }

  private loop(now: number) {
    if (!this.running || !this.replay || !this.state) return;

    if (this.lastTime == null) this.lastTime = now;
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

      // En killcam, on ne laisse pas le statut DEAD stopper le replay avant la fin
      if (this.mode === 'KILLCAM' && this.state.status === 'DEAD' && this.currentTick < this.endTick - 1) {
        // laisser continuer pour voir la chute
      }

      this.currentTick++;
      this.accumulator -= this.TICK_MS;
      this.onStateUpdate?.(this.state);
    }

    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }
}
