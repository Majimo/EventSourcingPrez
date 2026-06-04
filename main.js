import Reveal from './node_modules/reveal.js/dist/reveal.esm.js';
import RevealHighlight from './node_modules/reveal.js/plugin/highlight/highlight.esm.js';
import RevealNotes from './node_modules/reveal.js/plugin/notes/notes.esm.js';

// ── Matrix burst — transition orchestrée ────────────────────
const matrixBurst = (function () {
  const canvas = document.getElementById('matrix-bg');
  if (!canvas) return { trigger: (cb) => cb && cb() };

  const ctx   = canvas.getContext('2d');
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const SIZE  = 16;

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position:      'fixed',
    inset:         '0',
    background:    '#020810',
    opacity:       '0',
    pointerEvents: 'none',
    zIndex:        '9997',
    transition:    'opacity 0s',
  });
  document.body.appendChild(overlay);

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function fadeOverlay(toOpacity, durationMs) {
    return new Promise(resolve => {
      overlay.style.transition = `opacity ${durationMs}ms ease`;
      overlay.style.opacity    = toOpacity;
      setTimeout(resolve, durationMs);
    });
  }

  function fadeCanvas(toOpacity, durationMs) {
    return new Promise(resolve => {
      canvas.style.transition = `opacity ${durationMs}ms ease`;
      canvas.style.opacity    = toOpacity;
      setTimeout(resolve, durationMs);
    });
  }

  function initDrops() {
    const cols = Math.floor(canvas.width / SIZE);
    return Array.from({ length: cols }, (_, i) => -(i % 8) * 1.5);
  }

  let animId = null;
  let drops  = [];

  function startRain() {
    drops = initDrops();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    function frame() {
      ctx.fillStyle = 'rgba(2,4,8,0.09)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00ff41';
      ctx.font = SIZE + "px 'Share Tech Mono', monospace";
      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * SIZE, drops[i] * SIZE);
        drops[i] += 1.4;
        if (drops[i] * SIZE > canvas.height && Math.random() > 0.90)
          drops[i] = Math.random() * -8;
      }
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
  }

  function stopRain() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  canvas.style.opacity       = '0';
  canvas.style.transition    = 'none';
  canvas.style.zIndex        = '9998';
  canvas.style.pointerEvents = 'none';

  const T_FADE_OUT  = 500;
  const T_RAIN_IN   = 200;
  const T_RAIN_HOLD = 1800;
  const T_RAIN_OUT  = 300;
  const T_FADE_IN   = 700;

  async function trigger(onMidpoint) {
    await fadeOverlay('1', T_FADE_OUT);
    onMidpoint && onMidpoint();
    startRain();
    await fadeCanvas('1', T_RAIN_IN);
    await new Promise(r => setTimeout(r, T_RAIN_HOLD));
    await fadeCanvas('0', T_RAIN_OUT);
    stopRain();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await fadeOverlay('0', T_FADE_IN);
    overlay.style.transition = 'opacity 0s';
  }

  return { trigger };
})();

// ── Reveal init ─────────────────────────────────────────────
const deck = new Reveal({
  plugins: [RevealHighlight, RevealNotes],
});

deck.initialize({
  width: 1920,
  height: 974,
  minScale: 0.3,
  maxScale: 1.0,
  slideNumber: 'c/t',
  progress: true,
  hash: true,
  transition: 'none',
  backgroundTransition: 'none',
  highlight: { highlightOnLoad: true },
});

// ── Speaker notes CSS injection ──────────────────────────────
deck.on('ready', () => {
  wrapCodeLines(); // ← ajouter cette ligne

  const originalOpen = window.open;
  window.open = function (...args) {
    const w = originalOpen.apply(window, args);
    const interval = setInterval(() => {
      if (w.document && w.document.head) {
        const link = w.document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'notes.css';
        w.document.head.appendChild(link);
        clearInterval(interval);
      }
    }, 100);
    return w;
  };
});

// ── Slide-specific logic ─────────────────────────────────────
deck.on('slidechanged', (event) => {
  const { indexh, indexv } = event;
  const tallSlides = [[3,2],[3,3],[4,1],[5,2],[6,1]];
  const slides = document.querySelector('.slides');
  if (tallSlides.some(([h,v]) => h === indexh && v === indexv)) {
    slides.style.height = '1060px';
  } else {
    slides.style.height = '974px';
  }
});

// ── Interception transition titre → whoami ───────────────────
let transitioning = false;

deck.addEventListener('beforeslidechange', (event) => {
  const from = deck.getCurrentSlide();
  const isFromTitle = from && from.querySelector('.slide-title');
  const toIndex = event.indexh;

  if (!isFromTitle || toIndex !== 1 || transitioning) return;

  event.preventDefault();
  transitioning = true;

  matrixBurst.trigger(() => {
    deck.slide(1, 0, 0);
  }).then(() => {
    transitioning = false;
  });
});

// ── Injection des wrappers après highlight.js ────────────────
// Groupes de lignes à wrapper par étape (index 0-based, inclusif)
const CODE_HL_GROUPS = [
  [0, 2],   // step-0 : signature de la fonction
  [4, 4],   // step-1 : getStream
  [6, 6],   // step-2 : projectRoom
  [8, 11],  // step-3 : validations
  [13, 20], // step-4 : construction events + RoomFull
  [22, 22], // step-5 : append
];

function wrapCodeLines() {
  const codeEl = document.querySelector('#cmd-code code');
  if (!codeEl) return;

  // Découper le contenu en lignes (highlight.js produit du HTML)
  const html   = codeEl.innerHTML;
  const lines  = html.split('\n');

  // Reconstruire en wrappant les groupes dans des spans data-hl
  let result = '';
  let hlIndex = 0;
  let inGroup = false;

  for (let i = 0; i < lines.length; i++) {
    const group = CODE_HL_GROUPS.findIndex(([start, end]) => i === start);
    if (group !== -1) {
      result += `<span class="code-hl" data-hl="${group}" style="display:block">`;
      inGroup = true;
      hlIndex = group;
    }

    result += lines[i] + (i < lines.length - 1 ? '\n' : '');

    const currentGroup = CODE_HL_GROUPS[hlIndex];
    if (inGroup && currentGroup && i === currentGroup[1]) {
      result += '</span>';
      inGroup = false;
    }
  }

  codeEl.innerHTML = result;
}

// Appeler dans ready, après que highlight.js a tourné
deck.on('ready', () => {
  wrapCodeLines();

  // ... (le reste du ready existant — injection CSS notes)
});

// ── Synchronisation flux ↔ code ──────────────────────────────
deck.on('fragmentshown', ({ fragment }) => {
  if (!fragment.classList.contains('flux-step')) return;

  const step = fragment.id.split('-')[1];

  document.querySelectorAll('.flux-step').forEach(el => {
    el.style.background   = '';
    el.style.borderRadius = '';
    el.style.fontWeight   = '';
  });

  document.querySelectorAll('.code-hl').forEach(el => {
    el.style.background = 'rgba(255,215,0,0)';
  });

  fragment.style.background   = 'rgba(88,166,255,0.13)';
  fragment.style.borderRadius = '4px';
  fragment.style.fontWeight   = '600';
  fragment.style.fontSize     = '0.5em !important';

  const codeEl = document.querySelector(`.code-hl[data-hl="${step}"]`);
  if (codeEl) {
    codeEl.style.opacity    = '1';
    codeEl.style.background = 'rgba(255,215,0,0.25)';
    codeEl.style.borderRadius = '3px';
  }
});

deck.on('fragmenthidden', ({ fragment }) => {
  if (!fragment.classList.contains('flux-step')) return;

  document.querySelectorAll('.flux-step').forEach(el => {
    el.style.background   = '';
    el.style.borderRadius = '';
    el.style.fontWeight   = '';
  });
  document.querySelectorAll('.code-hl').forEach(el => {
    el.style.opacity    = '';
    el.style.background = 'none';
    el.style.borderRadius = '';
  });
});