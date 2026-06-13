import Reveal from './node_modules/reveal.js/dist/reveal.esm.js';
import RevealHighlight from './node_modules/reveal.js/plugin/highlight/highlight.esm.js';
import RevealNotes from './node_modules/reveal.js/plugin/notes/notes.esm.js';

// ── Matrix burst — transition orchestrée ────────────────────
const matrixBurst = (function () {
  const canvas = document.getElementById('matrix-bg');
  if (!canvas) return { trigger: (cb) => cb && cb() };

  const ctx   = canvas.getContext('2d');
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@&(§)$£%+=?*#';
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
    return Array.from({ length: cols }, () => Math.random() * -2);
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

  const T_FADE_OUT   = 500;  // fondu noir sur slide titre
  const T_RAIN_IN    = 400;  // apparition canvas (fondu)
  const T_RAIN_OUT   = 400;  // disparition canvas
  const T_FADE_IN    = 500;  // révélation slide suivante

  async function trigger(onMidpoint, rainHold = 1400) {
    await fadeOverlay('1', T_FADE_OUT);
    onMidpoint && onMidpoint();
    startRain();
    await fadeCanvas('1', T_RAIN_IN);
    await new Promise(r => setTimeout(r, rainHold)); // ← paramétré
    await fadeCanvas('0', T_RAIN_OUT);
    stopRain();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await fadeOverlay('0', T_FADE_IN);
    overlay.style.transition = 'opacity 0s';
  }

  return { trigger };
})();

// ── Wrappers highlight post-highlight.js ─────────────────────
// Groupes de lignes (index 0-based, inclusif) pour la slide command handler
const CODE_HL_GROUPS = [
  [0,  2],  // step-0 : signature de la fonction
  [4,  4],  // step-1 : getStream
  [6,  6],  // step-2 : projectRoom
  [8,  11], // step-3 : validations
  [13, 20], // step-4 : construction events + RoomFull
  [22, 22], // step-5 : append
];

function wrapCodeLines() {
  const codeEl = document.querySelector('#cmd-code code');
  if (!codeEl) return;

  const lines  = codeEl.innerHTML.split('\n');
  let result   = '';
  let inGroup  = false;
  let hlIndex  = -1;

  for (let i = 0; i < lines.length; i++) {
    const groupIdx = CODE_HL_GROUPS.findIndex(([start]) => i === start);
    if (groupIdx !== -1) {
      result  += `<span class="code-hl" data-hl="${groupIdx}" style="display:block">`;
      inGroup  = true;
      hlIndex  = groupIdx;
    }

    result += lines[i] + (i < lines.length - 1 ? '\n' : '');

    if (inGroup && CODE_HL_GROUPS[hlIndex] && i === CODE_HL_GROUPS[hlIndex][1]) {
      result += '</span>';
      inGroup = false;
      hlIndex = -1;
    }
  }

  codeEl.innerHTML = result;
}

// ── Notes synchronisées avec les fragments ───────────────────
// Usage dans l'aside.notes :
//   <div class="notes-fragment" data-fragment-index="-1">intro</div>
//   <div class="notes-fragment" data-fragment-index="0">fragment 0</div>
//   <div class="notes-fragment" data-fragment-index="1">fragment 1</div>
//
// Arrivée slide  → affiche index -1
// fragmentshown  → affiche le bloc à l'index du fragment
// fragmenthidden → revient au bloc précédent (index - 1)

function syncFragmentNotes(slide, activeIndex) {
  const blocks = slide.querySelectorAll('aside.notes .notes-fragment');
  if (!blocks.length) return;
  blocks.forEach(block => {
    const idx = parseInt(block.dataset.fragmentIndex ?? '-99', 10);
    block.style.display = (idx === activeIndex) ? '' : 'none';
  });
}

function initFragmentNotes(slide) {
  const blocks = slide.querySelectorAll('aside.notes .notes-fragment');
  if (!blocks.length) return;
  blocks.forEach(block => { block.style.display = 'none'; });
  const intro = slide.querySelector('aside.notes .notes-fragment[data-fragment-index="-1"]');
  if (intro) intro.style.display = '';
}

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

// ── Ready — un seul bloc ─────────────────────────────────────
deck.on('ready', () => {
  // Wrappers code highlight — après que highlight.js a tourné
  wrapCodeLines();

  // Init notes fragments sur la slide courante au démarrage
  initFragmentNotes(deck.getCurrentSlide());

  // Injection CSS dans la fenêtre speaker notes
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
  const { indexh, indexv, currentSlide } = event;

  // Hauteur slides avec code long
  const tallSlides = [[3,2],[3,3],[4,1],[5,2],[6,1]];
  const slides = document.querySelector('.slides');
  if (tallSlides.some(([h,v]) => h === indexh && v === indexv)) {
    slides.style.height = '1060px';
  } else {
    slides.style.height = '974px';
  }

  // Offset vertical personnalisé par slide
  // Usage : <section data-slide-offset="-80"> (valeur en px)
  // Reset la slide précédente pour éviter l'accumulation au retour arrière
  const { previousSlide } = event;
  if (previousSlide && previousSlide.dataset.slideOffset) {
    previousSlide.style.transform = previousSlide.style.transform
      .replace(/\s*translateY\([^)]+\)/, '')
      .trim();
  }
  const offset = currentSlide.dataset.slideOffset;
  if (offset) {
    const base = currentSlide.style.transform || '';
    currentSlide.style.transform = (base + ` translateY(${offset}px)`).trim();
  }

  // Init notes fragments sur la nouvelle slide
  initFragmentNotes(currentSlide);
});

// ── Interception transition titre → whoami ───────────────────
let transitioning = false;

deck.addEventListener('beforeslidechange', (event) => {
  const from = deck.getCurrentSlide();
  const toIndex  = event.indexh;
  const toIndexV = event.indexv ?? 0;

  const fromIndices = deck.getIndices(from);
  const fromH = fromIndices.h;
  const fromV = fromIndices.v ?? 0;

  // Paires déclenchant le burst — [fromH, fromV, toH, toV]
  const burstTransitions = [
    { from: [0, 0], to: [1, 0], hold: 2400 },  // slide titre → whoami
    { from: [3, 4], to: [3, 5], hold: 1200 },  // démo jeu → section 2
    { from: [5, 3], to: [5, 4], hold: 1200 },  // démo backend → section 4
    { from: [7, 0], to: [8, 0], hold: 2400 },  // takeaways → conclusion
  ];

  const match = burstTransitions.find(
    ({ from: [fh, fv], to: [th, tv] }) =>
      fromH === fh && fromV === fv && toIndex === th && toIndexV === tv
  );

  if (!match || transitioning) return;

  event.preventDefault();
  transitioning = true;

  matrixBurst.trigger(() => {
    deck.slide(match.to[0], match.to[1], 0);
  }, match.hold).then(() => {
    transitioning = false;
  });
});

// ── Command handler — synchronisation flux ↔ code ────────────
deck.on('fragmentshown', (event) => {
  const { fragment } = event;

  if (fragment.classList.contains('flux-step')) {
    const step = fragment.id.split('-')[1];

    // Éteindre colonne gauche
    document.querySelectorAll('.flux-step').forEach(el => {
      el.style.background   = '';
      el.style.borderRadius = '';
      el.style.fontWeight   = '';
    });

    // Atténuer tout le code
    document.querySelectorAll('.code-hl').forEach(el => {
      el.style.opacity    = '0.3';
      el.style.background = '';
    });

    // Allumer la ligne flux active
    fragment.style.background   = 'rgba(88,166,255,0.13)';
    fragment.style.borderRadius = '4px';
    fragment.style.fontWeight   = '600';

    // Allumer le bloc de code correspondant
    const codeEl = document.querySelector(`.code-hl[data-hl="${step}"]`);
    if (codeEl) {
      codeEl.style.opacity      = '1';
      codeEl.style.background   = 'rgba(255,215,0,0.25)';
      codeEl.style.borderRadius = '3px';
    }
  }

  // Fade out DeLorean gif au fragment suivant
  const slide = fragment.closest('section');
  if (slide) {
    const gif = slide.querySelector('#delorean-gif');
    if (gif) {
      const fragIndex = parseInt(fragment.dataset.fragmentIndex ?? '0', 10);
      if (fragIndex >= 1) {
        gif.classList.add('fade-out');
      } else {
        gif.classList.remove('fade-out');
      }
    }
  }

  // Sync notes fragments
  const slideSection = fragment.closest('section');
  if (slideSection) {
    const fragmentIndex = parseInt(fragment.dataset.fragmentIndex ?? '0', 10);
    syncFragmentNotes(slideSection, fragmentIndex);
  }
});

deck.on('fragmenthidden', (event) => {
  const { fragment } = event;

  if (fragment.classList.contains('flux-step')) {
    // Tout remettre à zéro
    document.querySelectorAll('.flux-step').forEach(el => {
      el.style.background   = '';
      el.style.borderRadius = '';
      el.style.fontWeight   = '';
    });
    document.querySelectorAll('.code-hl').forEach(el => {
      el.style.opacity      = '';
      el.style.background   = '';
      el.style.borderRadius = '';
    });
  }

  const slide = fragment.closest('section');
  if (slide) {
    const gif = slide.querySelector('#delorean-gif');
    if (gif) {
      const fragIndex = parseInt(fragment.dataset.fragmentIndex ?? '0', 10);
      if (fragIndex <= 1) {
        gif.classList.remove('fade-out');
      }
    }
  }

  // Sync notes fragments — on revient au bloc précédent
  const slideSection = fragment.closest('section');
  if (slideSection) {
    const fragmentIndex = parseInt(fragment.dataset.fragmentIndex ?? '0', 10);
    syncFragmentNotes(slideSection, fragmentIndex - 1);
  }
});