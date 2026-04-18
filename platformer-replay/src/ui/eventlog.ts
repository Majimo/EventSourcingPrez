// ============================================================
//  EVENT LOG UI — le panneau qui affiche les events en temps réel
//  C'est LE panneau pédagogique du talk : on voit le log grandir
// ============================================================
import type { GameEvent } from '../core/types.ts';

const TYPE_COLORS: Record<string, string> = {
  GAME_STARTED:  '#3dd68c',
  INPUT_CHANGED: '#58a6ff',
  PLAYER_DIED:   '#f85149',
  PLAYER_WON:    '#ffd700',
};

export function renderEventLog(container: HTMLElement, events: GameEvent[], highlight?: number) {
  // Ne garde que les 18 derniers pour l'affichage
  const visible = events.slice(-18);

  container.innerHTML = visible.map((ev, i) => {
    const isNew = highlight != null && i === visible.length - 1 && ev.tick === highlight;
    const color = TYPE_COLORS[ev.type] ?? '#8b949e';
    const payloadStr = JSON.stringify(ev.payload);
    return `<div class="ev-row${isNew ? ' ev-new' : ''}">
      <span class="ev-tick">${String(ev.tick).padStart(5, '0')}</span>
      <span class="ev-type" style="color:${color}">${ev.type}</span>
      <span class="ev-payload">${payloadStr}</span>
    </div>`;
  }).join('');

  // Auto-scroll vers le bas
  container.scrollTop = container.scrollHeight;
}
