// ============================================================
//  RECORDER — enregistre les events pendant le jeu live
//  On n'enregistre PAS 60 snapshots/sec.
//  On enregistre SEULEMENT les changements d'input + events métier.
// ============================================================
import type { GameEvent, InputSnapshot, ReplayData } from '../core/types.ts';

export class Recorder {
  private events: GameEvent[] = [];
  private lastInput: InputSnapshot = { left: false, right: false, jump: false };
  private levelSeed: number = 0;
  private startTimestamp: string = '';
  private deathTick?: number;
  private finalTick: number = 0;

  start(levelSeed: number) {
    this.events = [];
    this.lastInput = { left: false, right: false, jump: false };
    this.levelSeed = levelSeed;
    this.startTimestamp = new Date().toISOString();
    this.deathTick = undefined;
    this.finalTick = 0;

    this.events.push({
      tick: 0,
      type: 'GAME_STARTED',
      payload: { levelSeed, timestamp: this.startTimestamp },
    });
  }

  // Appelé à chaque tick — n'enregistre que si l'input a changé
  recordInput(tick: number, input: InputSnapshot) {
    const changed =
      input.left  !== this.lastInput.left  ||
      input.right !== this.lastInput.right ||
      input.jump  !== this.lastInput.jump;

    if (changed) {
      this.events.push({ tick, type: 'INPUT_CHANGED', payload: { ...input } });
      this.lastInput = { ...input };
    }
    this.finalTick = tick;
  }

  recordDeath(tick: number, x: number, y: number) {
    this.deathTick = tick;
    this.events.push({ tick, type: 'PLAYER_DIED', payload: { x, y, cause: 'fell' } });
    this.finalTick = tick;
  }

  recordWin(tick: number) {
    this.events.push({ tick, type: 'PLAYER_WON', payload: { tick } });
    this.finalTick = tick;
  }

  getReplay(): ReplayData {
    return {
      initialState: { levelSeed: this.levelSeed, timestamp: this.startTimestamp },
      events: [...this.events],
      deathTick: this.deathTick,
      totalTicks: this.finalTick,
    };
  }

  getEventCount(): number { return this.events.length; }
}
