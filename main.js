import Reveal from './node_modules/reveal.js/dist/reveal.esm.js';
import RevealHighlight from './node_modules/reveal.js/plugin/highlight/highlight.esm.js';
import RevealNotes from './node_modules/reveal.js/plugin/notes/notes.esm.js';

// ── Matrix burst — transition orchestrée ────────────────────
// Séquence : slide-titre fondu out → canvas burst → slide whoami fondu in
// Reveal.js est mis en pause pendant toute la durée de la transition.

const matrixBurst = (function () {
  const canvas = document.getElementById('matrix-bg');
  if (!canvas) return { trigger: (cb) => cb && cb() };

  const ctx   = canvas.getContext('2d');
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const SIZE  = 16;

  // Overlay sombre pour fondus d'entrée/sortie des slides
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position:       'fixed',
    inset:          '0',
    background:     '#020810',
    opacity:        '0',
    pointerEvents:  'none',
    zIndex:         '9997',
    transition:     'opacity 0s',
  });
  document.body.appendChild(overlay);

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Helpers promesses ──
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

  // ── Pluie Matrix ──
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

  // Canvas invisible au départ
  canvas.style.opacity       = '0';
  canvas.style.transition    = 'none';
  canvas.style.zIndex        = '9998';
  canvas.style.pointerEvents = 'none';

  // ── Séquence complète ──────────────────────────────────────
  // Timings (ms) — ajustables ici
  const T_FADE_OUT   = 400;  // fondu noir sur slide titre
  const T_RAIN_IN    = 200;  // apparition canvas
  const T_RAIN_HOLD  = 1400;  // pluie à pleine opacité
  const T_RAIN_OUT   = 300;  // disparition canvas
  const T_FADE_IN    = 400;  // révélation slide whoami

  async function trigger(onMidpoint) {
    // 1. Fondu noir — masque la slide titre
    await fadeOverlay('1', T_FADE_OUT);

    // 2. Reveal.js navigue vers la slide suivante (invisible sous l'overlay)
    onMidpoint && onMidpoint();

    // 3. Canvas Matrix apparaît par-dessus le noir
    startRain();
    await fadeCanvas('1', T_RAIN_IN);

    // 4. Pluie tient le temps voulu
    await new Promise(r => setTimeout(r, T_RAIN_HOLD));

    // 5. Canvas disparaît — laisse entrevoir le noir
    await fadeCanvas('0', T_RAIN_OUT);
    stopRain();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 6. Fondu révèle la slide whoami
    await fadeOverlay('0', T_FADE_IN);

    // Nettoyage
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
  const originalOpen = window.open;
  window.open = function (...args) {
    const w = originalOpen.apply(window, args);
    const interval = setInterval(() => {
      if (w.document && w.document.head) {
        const link = w.document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'css/notes.css';
        w.document.head.appendChild(link);
        clearInterval(interval);
      }
    }, 100);
    return w;
  };
});

// ── Interception de la navigation ────────────────────────────
let transitioning = false;

deck.on('slidechanged', (event) => {
  const { indexh, indexv } = event;

  // Hauteur slides avec code long
  const tallSlides = [[3,2],[3,3],[4,1],[5,2],[6,1]];
  const slides = document.querySelector('.slides');
  if (tallSlides.some(([h,v]) => h === indexh && v === indexv)) {
    slides.style.height = '1060px';
  } else {
    slides.style.height = '974px';
  }
});

// On intercepte AVANT le changement de slide pour prendre le contrôle
deck.addEventListener('beforeslidechange', (event) => {
  const from = deck.getCurrentSlide();
  const isFromTitle = from && from.querySelector('.slide-title');
  const toIndex = event.indexh;

  // Uniquement pour la transition titre → whoami (0 → 1)
  if (!isFromTitle || toIndex !== 1 || transitioning) return;

  // Bloquer reveal.js
  event.preventDefault();
  transitioning = true;

  matrixBurst.trigger(() => {
    // Ce callback s'exécute sous l'overlay noir — on navigue en silence
    deck.slide(1, 0, 0);
  }).then(() => {
    transitioning = false;
  });
});
