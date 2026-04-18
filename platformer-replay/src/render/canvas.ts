// ============================================================
//  RENDERER — tout ce qui est visuel, ZERO logique de jeu
//  Prend un GameState et dessine. C'est tout.
// ============================================================
import type { GameState } from '../core/types.ts';
import { PLAYER_W, PLAYER_H } from '../core/physics.ts';
import { GROUND_Y } from '../core/level.ts';

const COLORS = {
  sky:        '#0d1117',
  skyReplay:  '#0d1a2e',
  skyKillcam: '#1a0d0d',
  ground:     '#21262d',
  platform:   '#30a46c',
  platformTop:'#3dd68c',
  player:     '#58a6ff',
  playerDead: '#f85149',
  playerWon:  '#ffd700',
  goal:       '#ffd700',
  stars:      '#8b949e',
  hud:        '#f0f6fc',
  hudMuted:   '#8b949e',
  replayBorder: 'rgba(88,166,255,0.4)',
  killcamBorder:'rgba(248,81,73,0.6)',
};

interface RenderOptions {
  mode: 'LIVE' | 'REPLAY' | 'KILLCAM';
  eventCount?: number;
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  opts: RenderOptions,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Caméra : centre sur le joueur, clamp aux bords du niveau
  const camX = Math.max(0, Math.min(
    state.player.x - W / 2,
    state.level.width - W,
  ));

  // ── Fond ────────────────────────────────────────────────────
  const skyColor = opts.mode === 'KILLCAM' ? COLORS.skyKillcam
    : opts.mode === 'REPLAY' ? COLORS.skyReplay
    : COLORS.sky;
  ctx.fillStyle = skyColor;
  ctx.fillRect(0, 0, W, H);

  // Étoiles (pseudo-fixes, basées sur la seed)
  ctx.fillStyle = COLORS.stars;
  const starRng = state.level.seed;
  for (let i = 0; i < 60; i++) {
    const sx = ((starRng * (i * 137 + 73)) % state.level.width);
    const sy = ((starRng * (i * 41  + 19)) % (GROUND_Y - 20)) % H;
    const screenX = (sx - camX + state.level.width) % state.level.width;
    if (screenX >= 0 && screenX <= W) {
      ctx.globalAlpha = 0.3 + (i % 5) * 0.1;
      ctx.fillRect(screenX, sy * 0.6, 1.5, 1.5);
    }
  }
  ctx.globalAlpha = 1;

  // ── Plateformes ─────────────────────────────────────────────
  for (const plat of state.level.platforms) {
    const sx = plat.x - camX;
    if (sx + plat.width < 0 || sx > W) continue; // culling

    // Corps
    ctx.fillStyle = COLORS.platform;
    ctx.beginPath();
    ctx.roundRect(sx, plat.y, plat.width, plat.height, 3);
    ctx.fill();

    // Bordure top (herbe)
    ctx.fillStyle = COLORS.platformTop;
    ctx.fillRect(sx, plat.y, plat.width, 4);
  }

  // ── Goal (drapeau) ──────────────────────────────────────────
  const goalScreenX = state.level.goalX - camX;
  if (goalScreenX > -20 && goalScreenX < W + 20) {
    // Poteau
    ctx.fillStyle = COLORS.goal;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(goalScreenX - 2, GROUND_Y - 60, 4, 60);
    // Drapeau
    ctx.fillStyle = COLORS.goal;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(goalScreenX + 2, GROUND_Y - 60);
    ctx.lineTo(goalScreenX + 22, GROUND_Y - 50);
    ctx.lineTo(goalScreenX + 2, GROUND_Y - 40);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Joueur ──────────────────────────────────────────────────
  const px = state.player.x - camX;
  const py = state.player.y;

  const playerColor = !state.player.alive ? COLORS.playerDead
    : state.player.won ? COLORS.playerWon
    : COLORS.player;

  // Corps
  ctx.fillStyle = playerColor;
  ctx.beginPath();
  ctx.roundRect(px, py, PLAYER_W, PLAYER_H, 5);
  ctx.fill();

  // Yeux (direction)
  const eyeOffsetX = state.player.vx > 0.2 ? 14 : state.player.vx < -0.2 ? 4 : 9;
  ctx.fillStyle = '#0d1117';
  ctx.beginPath();
  ctx.arc(px + eyeOffsetX, py + 11, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(px + eyeOffsetX + 1, py + 10, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // ── HUD ─────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.hud;
  ctx.font = 'bold 14px "JetBrains Mono", monospace';

  const modeLabel = opts.mode === 'KILLCAM' ? '⏮ KILLCAM'
    : opts.mode === 'REPLAY' ? '▶ REPLAY'
    : '● LIVE';
  ctx.fillText(modeLabel, 16, 28);

  ctx.fillStyle = COLORS.hudMuted;
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText(`tick: ${state.tick}`, 16, 46);

  if (opts.eventCount != null) {
    ctx.fillText(`events: ${opts.eventCount}`, 16, 62);
  }

  // Barre de progression niveau
  const progress = state.player.x / state.level.goalX;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(W - 120, 16, 100, 6);
  ctx.fillStyle = playerColor;
  ctx.fillRect(W - 120, 16, Math.min(100, progress * 100), 6);

  // ── Overlay mode ────────────────────────────────────────────
  if (opts.mode !== 'LIVE') {
    const borderColor = opts.mode === 'KILLCAM' ? COLORS.killcamBorder : COLORS.replayBorder;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.lineWidth = 1;
  }
}

export function renderMessage(ctx: CanvasRenderingContext2D, msg: string, sub?: string) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(13,17,23,0.75)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0f6fc';
  ctx.font = 'bold 28px "JetBrains Mono", monospace';
  ctx.fillText(msg, W / 2, H / 2 - 10);
  if (sub) {
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8b949e';
    ctx.fillText(sub, W / 2, H / 2 + 20);
  }
  ctx.textAlign = 'left';
}
