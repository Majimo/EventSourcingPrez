import Reveal from './node_modules/reveal.js/dist/reveal.esm.js';
import RevealHighlight from './node_modules/reveal.js/plugin/highlight/highlight.esm.js';
import RevealNotes from './node_modules/reveal.js/plugin/notes/notes.esm.js';

// ── Matrix rain background ──────────────────────────────────
(function initMatrixRain() {
  const canvas = document.getElementById('matrix-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
  const fontSize = 14;
  let columns = Math.floor(canvas.width / fontSize);
  let drops = Array(columns).fill(1);

  function draw() {
    ctx.fillStyle = 'rgba(2,4,8,0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff41';
    ctx.font = fontSize + 'px Share Tech Mono, monospace';
    for (let i = 0; i < drops.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(char, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  setInterval(draw, 50);
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
  highlight: {
    highlightOnLoad: true,
  },
});

// ── Speaker notes window CSS injection ──────────────────────
deck.on('ready', () => {
  const originalOpen = window.open;
  window.open = function (...args) {
    const w = originalOpen.apply(window, args);
    const interval = setInterval(() => {
      if (w.document && w.document.head) {
        const link = w.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/notes.css';
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

  // Slides tall (code long)
  const tallSlides = [[3,2],[3,3],[4,1],[5,2],[6,1]];
  const slides = document.querySelector('.slides');
  if (tallSlides.some(([h,v]) => h === indexh && v === indexv)) {
    slides.style.height = '1060px';
  } else {
    slides.style.height = '974px';
  }
});
