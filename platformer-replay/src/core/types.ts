// ============================================================
//  TYPES CENTRAUX
// ============================================================

export interface Platform {
  x: number; y: number; width: number; height: number;
}

export interface Level {
  seed: number;
  platforms: Platform[];
  width: number;
  height: number;
  spawnX: number;
  spawnY: number;
  goalX: number;
}

export interface PlayerState {
  x: number; y: number;
  vx: number; vy: number;
  onGround: boolean;
  alive: boolean;
  won: boolean;
}

export interface GameState {
  tick: number;
  player: PlayerState;
  level: Level;
  status: 'PLAYING' | 'DEAD' | 'WON';
}

export interface InputSnapshot {
  left: boolean; right: boolean; jump: boolean;
}

export type GameEventType = 'GAME_STARTED' | 'INPUT_CHANGED' | 'PLAYER_DIED' | 'PLAYER_WON';

export interface GameEvent {
  tick: number;
  type: GameEventType;
  payload: Record<string, unknown>;
}

export interface ReplayData {
  initialState: { levelSeed: number; timestamp: string };
  events: GameEvent[];
  deathTick?: number;
  totalTicks: number;
}
