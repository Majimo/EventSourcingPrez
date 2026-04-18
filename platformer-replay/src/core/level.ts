import type { Level, Platform } from './types.ts';

// LCG déterministe — même seed = même niveau, toujours
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export const LEVEL_HEIGHT = 400;
export const GROUND_Y = 360; // Y du sol (en bas du canvas visible)

export function generateLevel(seed: number): Level {
  const rng = seededRng(seed);
  const levelWidth = 2400;

  const platforms: Platform[] = [];

  // Sol de départ (safe zone)
  platforms.push({ x: 0, y: GROUND_Y, width: 260, height: 20 });

  // Plateformes générées par la seed
  // On avance par "colonnes" espacées de ~180px
  let curX = 300;
  while (curX < levelWidth - 300) {
    const gapWidth  = 60  + rng() * 80;   // trou entre 60 et 140px
    const platWidth = 100 + rng() * 120;  // plateforme entre 100 et 220px
    const platY     = GROUND_Y - 60 - rng() * 140; // hauteur variable

    // Parfois une plateforme au sol, parfois en hauteur
    const isElevated = rng() > 0.4;
    platforms.push({
      x: curX + gapWidth,
      y: isElevated ? platY : GROUND_Y,
      width: platWidth,
      height: 20,
    });

    curX += gapWidth + platWidth;
  }

  // Plateforme d'arrivée (goal)
  const goalX = levelWidth - 220;
  platforms.push({ x: goalX, y: GROUND_Y, width: 260, height: 20 });

  return {
    seed,
    platforms,
    width: levelWidth,
    height: LEVEL_HEIGHT,
    spawnX: 40,
    spawnY: GROUND_Y - 40,
    goalX: goalX + 200,
  };
}
