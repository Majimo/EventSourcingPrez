// ============================================================
//  PHYSIQUE — pure functions, ZERO side effects
//  Même GameState + même InputSnapshot => même GameState suivant
//  C'est cette propriété qui rend le replay possible
// ============================================================
import type { GameState, InputSnapshot, PlayerState } from './types.ts';
import type { Platform } from './types.ts';

const GRAVITY      = 0.45;
const JUMP_FORCE   = -12.5;
const MOVE_SPEED   = 5.0;
const FRICTION     = 0.82;
const PLAYER_W     = 28;
const PLAYER_H     = 36;

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function resolveCollisions(p: PlayerState, platforms: Platform[]): PlayerState {
  let { x, y, vx, vy, onGround } = p;
  onGround = false;

  for (const plat of platforms) {
    if (!rectOverlap(x, y, PLAYER_W, PLAYER_H, plat.x, plat.y, plat.width, plat.height)) continue;

    // Overlap depths
    const overlapLeft   = (x + PLAYER_W) - plat.x;
    const overlapRight  = (plat.x + plat.width) - x;
    const overlapTop    = (y + PLAYER_H) - plat.y;
    const overlapBottom = (plat.y + plat.height) - y;

    const minH = Math.min(overlapLeft, overlapRight);
    const minV = Math.min(overlapTop, overlapBottom);

    if (minV < minH) {
      if (overlapTop < overlapBottom) {
        // Collision par le haut — atterrissage
        y = plat.y - PLAYER_H;
        vy = 0;
        onGround = true;
      } else {
        // Collision par le bas — plafond
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

export function applyTick(state: GameState, input: InputSnapshot): GameState {
  if (state.status !== 'PLAYING') return state;

  let { x, y, vx, vy, onGround, alive, won } = state.player;

  // Inputs
  if (input.left)  vx -= MOVE_SPEED;
  if (input.right) vx += MOVE_SPEED;
  if (input.jump && onGround) vy = JUMP_FORCE;

  // Friction + gravité
  vx *= FRICTION;
  vy += GRAVITY;

  // Déplacement
  x += vx;
  y += vy;

  // Clamp horizontal dans le niveau
  x = Math.max(0, Math.min(x, state.level.width - PLAYER_W));

  let player: PlayerState = { x, y, vx, vy, onGround, alive, won };

  // Collisions plateformes
  player = resolveCollisions(player, state.level.platforms);

  // Mort : tombé hors du canvas
  let status: 'PLAYING' | 'DEAD' | 'WON' = state.status;
  if (player.y > state.level.height + 60) {
    player = { ...player, alive: false };
    status = 'DEAD';
  }

  // Victoire : atteint le goal
  if (player.x >= state.level.goalX - 20) {
    player = { ...player, won: true };
    status = 'WON';
  }

  return { ...state, tick: state.tick + 1, player, status };
}

export { PLAYER_W, PLAYER_H };
