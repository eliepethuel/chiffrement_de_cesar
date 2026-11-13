/* César — chiffrement par décalage.
   Organisation : 1. Chiffre (fonctions pures)  2. État  3. Rendu  4. Interactions */
(() => {
  'use strict';

  /* 1. Chiffre ------------------------------------------------------------ */

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const N = ALPHABET.length;
  const mod = (n, m = N) => ((n % m) + m) % m;

  /** Retire les accents et développe les ligatures : « Œuvre » → « OEuvre ». */
  const normalize = (text) => text
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Décale chaque lettre de `k` rangs ; casse, chiffres et ponctuation conservés. */
  const shiftText = (text, k) => normalize(text).replace(/[a-z]/gi, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code < 97 ? 65 : 97;
    return String.fromCharCode(base + mod(code - base + k));
  });

  // Fréquence des lettres en français (%), de A à Z.
  const FR_FREQ = [7.636, 0.901, 3.26, 3.669, 14.715, 1.066, 0.866, 0.737, 7.529, 0.613, 0.074, 5.456, 2.968,
    7.095, 5.796, 2.521, 1.362, 6.693, 7.948, 7.244, 6.311, 1.838, 0.049, 0.427, 0.128, 0.326];

  /** Clé la plus vraisemblable d'un texte chiffré (test du χ²), ou null s'il est trop court. */
  function guessKey(cipher) {
    const counts = new Array(N).fill(0);
    let total = 0;
    for (const ch of cipher.toUpperCase()) {
      const i = ch.charCodeAt(0) - 65;
      if (i >= 0 && i < N) { counts[i]++; total++; }
    }
    if (total < 6) return null;

    let best = null;
    let bestScore = Infinity;
    for (let k = 1; k < N; k++) {
      let chi = 0;
      for (let i = 0; i < N; i++) {
        const expected = (FR_FREQ[i] / 100) * total;
        const diff = counts[mod(i + k)] - expected;
        chi += (diff * diff) / expected;
      }
      if (chi < bestScore) { bestScore = chi; best = k; }
    }
    return best;
  }

  /* 2. État --------------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const el = {
    input: $('input'), output: $('output'), count: $('count'),
    inputLabel: $('inputLabel'), outputLabel: $('outputLabel'),
    keyChip: $('keyChip'), hubNum: $('hubNum'), pairTo: $('pairTo'), readoutText: $('readoutText'),
    wheel: $('wheel'), range: $('range'), strip: $('strip'),
    crack: $('crack'), crackEmpty: $('crackEmpty'),
    copyBtn: $('copyBtn'), copyLabel: $('copyLabel'), title: $('title'),
  };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ } },
  };

  const savedKey = Number(store.get('cesar:key'));
  const state = {
    mode: 'encrypt',
    key: savedKey >= 1 && savedKey <= 25 ? savedKey : 3,
    output: '',
  };

  const COPY = {
    encrypt: { input: 'Message clair', output: 'Message chiffré', placeholder: 'Écrivez votre message…' },
    decrypt: { input: 'Message chiffré', output: 'Message clair', placeholder: 'Collez le message à déchiffrer…' },
  };

  /* 3. Rendu -------------------------------------------------------------- */

  const STEP = 360 / N;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  };

  let ring;                 // anneau intérieur (alphabet chiffré), seul élément qui tourne
  let rotation = 0;         // rotation cumulée, pour toujours tourner par le plus court chemin
  const plainLetters = [];  // <text> de l'anneau extérieur
  const cipherLetters = []; // <text> de l'anneau intérieur
  const cells = [];         // cellules de la table
  const rows = [];          // lignes de l'analyse

  function buildWheel() {
    const ringOf = (cls, radius, list) => {
      const group = svg('g', { class: cls });
      for (let i = 0; i < N; i++) {
        const letter = svg('text', { x: 200, y: 200 - radius, transform: `rotate(${i * STEP} 200 200)` });
        letter.textContent = ALPHABET[i];
        list.push(letter);
        group.append(letter);
      }
      return group;
    };
    const ticks = (r1, r2) => {
      const group = svg('g');
      for (let i = 0; i < N; i++) {
        group.append(svg('line', {
          class: 'w-tick', x1: 200, x2: 200, y1: 200 - r1, y2: 200 - r2,
          transform: `rotate(${(i + 0.5) * STEP} 200 200)`,
        }));
      }
      return group;
    };

    ring = svg('g', { id: 'ring' });
    ring.append(svg('circle', { class: 'w-inner', cx: 200, cy: 200, r: 148 }), ticks(148, 140), ringOf('w-cipher', 126, cipherLetters));

    el.wheel.append(
      svg('circle', { class: 'w-outer', cx: 200, cy: 200, r: 192 }),
      ticks(192, 184),
      ringOf('w-plain', 170, plainLetters),
      ring,
      svg('circle', { class: 'w-hub', cx: 200, cy: 200, r: 104 }),
      svg('rect', { class: 'w-lens', x: 181, y: 12, width: 38, height: 82, rx: 19 }),
    );
    plainLetters[0].classList.add('is-top');
  }

  function buildStrip() {
    for (let i = 0; i < N; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML = `<span class="p">${ALPHABET[i]}</span><span class="c"></span>`;
      cells.push(cell);
      el.strip.append(cell);
    }
  }

  function buildCrack() {
    for (let k = 1; k < N; k++) {
      const item = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'row';
      row.dataset.key = k;
      row.innerHTML = `<span class="row__k">${String(k).padStart(2, '0')}</span><span class="row__t"></span><span class="row__b"></span>`;
      rows.push(row);
      item.append(row);
      el.crack.append(item);
    }
  }

  /** Révèle `target` en brouillant brièvement les seules lettres qui ont changé. */
  function scrambleTo(node, target, previous) {
    cancelAnimationFrame(node._raf);
    const changed = [];
    if (!reduceMotion.matches && target.length <= 800) {
      for (let i = 0; i < target.length; i++) {
        if (target[i] !== previous[i] && /[a-z]/i.test(target[i])) changed.push(i);
      }
    }
    // Le texte exact est posé tout de suite : si l'onglet est en arrière-plan
    // (pas de frame d'animation), le résultat reste juste.
    node.textContent = target;
    if (!changed.length) return;

    const total = Math.min(520, 160 + changed.length * 14);
    const revealAt = changed.map((_, n) => 90 + (n / changed.length) * (total - 90));
    const start = performance.now();

    const frame = (now) => {
      const elapsed = now - start;
      const chars = target.split('');
      let pending = false;
      changed.forEach((index, n) => {
        if (elapsed >= revealAt[n]) return;
        pending = true;
        const random = ALPHABET[(Math.random() * N) | 0];
        chars[index] = target[index] === target[index].toUpperCase() ? random : random.toLowerCase();
      });
      node.textContent = chars.join('');
      if (pending) node._raf = requestAnimationFrame(frame);
    };
    node._raf = requestAnimationFrame(frame);
  }

  const pop = (node) => {
    if (reduceMotion.matches) return;
    node.animate(
      [{ transform: 'translateY(35%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  };

  function renderText() {
    const raw = el.input.value;
    const previous = state.output;
    state.output = shiftText(raw, state.mode === 'encrypt' ? state.key : -state.key);
    scrambleTo(el.output, state.output, previous);

    const letters = (normalize(raw).match(/[a-z]/gi) || []).length;
    const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
    el.count.textContent = `${plural(raw.length, 'caractère')} · ${plural(letters, 'lettre')}`;
    el.copyBtn.disabled = !state.output;

    renderCrack();
  }

  function renderCrack() {
    // L'analyse porte toujours sur le texte chiffré, quel que soit le mode.
    const cipher = state.mode === 'encrypt' ? state.output : normalize(el.input.value);
    const hasText = /[a-z]/i.test(cipher);
    el.crackEmpty.hidden = hasText;
    el.crack.hidden = !hasText;
    if (!hasText) return;

    const best = guessKey(cipher.slice(0, 4000));
    const excerpt = cipher.slice(0, 140).replace(/\s+/g, ' ');
    rows.forEach((row, index) => {
      const k = index + 1;
      const isBest = k === best;
      const isCurrent = k === state.key;
      row.children[1].textContent = shiftText(excerpt, -k);
      row.children[2].textContent = isBest ? 'probable' : isCurrent ? 'clé actuelle' : '';
      row.classList.toggle('is-best', isBest);
      row.classList.toggle('is-current', isCurrent);
      row.setAttribute('aria-label', `Clé ${k}${isBest ? ', la plus probable' : ''} : ${row.children[1].textContent}`);
    });
  }

  function renderKey({ animate = true } = {}) {
    const k = state.key;
    const target = ALPHABET[k];

    ring.style.transform = `rotate(${rotation}deg)`;
    cipherLetters.forEach((letter, i) => letter.classList.toggle('is-top', i === k));
    el.wheel.setAttribute('aria-valuenow', k);
    el.wheel.setAttribute('aria-valuetext', `Clé ${k} : A devient ${target}`);

    el.range.value = k;
    el.range.style.setProperty('--pct', `${((k - 1) / 24) * 100}%`);

    for (const node of [el.hubNum, el.keyChip]) node.textContent = k;
    el.pairTo.textContent = target;
    el.readoutText.textContent = `décalage de ${k} lettre${k > 1 ? 's' : ''}`;
    document.querySelectorAll('.formula .k').forEach((node) => { node.textContent = k; });
    document.querySelectorAll('.chip[data-key]').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.key) === k));
    });

    cells.forEach((cell, i) => {
      const cipher = cell.lastElementChild;
      cipher.textContent = ALPHABET[mod(i + k)];
      if (animate && !reduceMotion.matches) {
        cipher.animate(
          [{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: 340, delay: i * 9, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' },
        );
      }
    });

    if (animate) { pop(el.hubNum); pop(el.pairTo); }
  }

  function renderMode() {
    const copy = COPY[state.mode];
    root.dataset.mode = state.mode;
    el.inputLabel.textContent = copy.input;
    el.outputLabel.textContent = copy.output;
    el.input.placeholder = copy.placeholder;
    document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
  }

  /* 4. Interactions ------------------------------------------------------- */

  function setKey(next, options) {
    const k = mod(next - 1, 25) + 1; // toujours entre 1 et 25
    if (k === state.key) return;
    // Plus court chemin sur la roue : jamais plus d'un demi-tour.
    const delta = mod(k - state.key + 13) - 13;
    rotation -= delta * STEP;
    state.key = k;
    store.set('cesar:key', k);
    renderKey(options);
    renderText();
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    renderMode();
    renderText();
  }

  /** Fait briller sur la roue et la table la paire correspondant à la lettre tapée. */
  function flash(char) {
    const typed = ALPHABET.indexOf(normalize(char).toUpperCase()[0]);
    if (typed < 0) return;
    const plain = state.mode === 'encrypt' ? typed : mod(typed - state.key);
    const targets = [plainLetters[plain], cipherLetters[mod(plain + state.key)], cells[plain]];
    targets.forEach((node) => {
      node.classList.add('is-hit');
      clearTimeout(node._hit);
      node._hit = setTimeout(() => node.classList.remove('is-hit'), 520);
    });
  }

  el.input.addEventListener('input', (event) => {
    renderText();
    if (event.data && event.data.length === 1) flash(event.data);
  });

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener('change', () => setMode(radio.value));
  });

  el.range.addEventListener('input', () => setKey(Number(el.range.value)));
  $('minusBtn').addEventListener('click', () => setKey(state.key - 1));
  $('plusBtn').addEventListener('click', () => setKey(state.key + 1));
  $('randomBtn').addEventListener('click', () => {
    let k;
    do { k = 1 + ((Math.random() * 25) | 0); } while (k === state.key);
    setKey(k);
  });
  document.querySelectorAll('.chip[data-key]').forEach((chip) => {
    chip.addEventListener('click', () => setKey(Number(chip.dataset.key)));
  });

  // Roue : glisser pour tourner, flèches au clavier.
  {
    let dragging = false;
    let lastAngle = 0;
    let travelled = 0;
    let startKey = 0;

    const angleOf = (event) => {
      const box = el.wheel.getBoundingClientRect();
      return Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180 / Math.PI;
    };

    el.wheel.addEventListener('pointerdown', (event) => {
      dragging = true;
      lastAngle = angleOf(event);
      travelled = 0;
      startKey = state.key;
      el.wheel.setPointerCapture(event.pointerId);
    });
    el.wheel.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const angle = angleOf(event);
      travelled += mod(angle - lastAngle + 180, 360) - 180;
      lastAngle = angle;
      // Tourner dans le sens horaire fait reculer l'alphabet chiffré : la clé diminue.
      const k = mod(startKey - Math.round(travelled / STEP));
      if (k !== 0) setKey(k);
    });
    const release = () => { dragging = false; };
    el.wheel.addEventListener('pointerup', release);
    el.wheel.addEventListener('pointercancel', release);

    el.wheel.addEventListener('keydown', (event) => {
      const moves = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
      if (event.key in moves) { event.preventDefault(); setKey(state.key + moves[event.key]); }
      if (event.key === 'Home') { event.preventDefault(); setKey(1); }
      if (event.key === 'End') { event.preventDefault(); setKey(25); }
    });
  }

  $('swapBtn').addEventListener('click', () => {
    el.input.value = state.output;
    state.output = '';
    state.mode = state.mode === 'encrypt' ? 'decrypt' : 'encrypt';
    renderMode();
    renderText();
  });

  $('clearBtn').addEventListener('click', () => {
    el.input.value = '';
    renderText();
    el.input.focus();
  });

  // Analyse : choisir une ligne applique ce déchiffrement.
  el.crack.addEventListener('click', (event) => {
    const row = event.target.closest('.row');
    if (!row) return;
    if (state.mode === 'encrypt') {
      el.input.value = state.output;
      state.output = '';
      state.mode = 'decrypt';
      renderMode();
    }
    const k = Number(row.dataset.key);
    if (k === state.key) renderText(); else setKey(k);
    $('atelier').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
  });

  // Copie, avec repli pour les contextes sans API Clipboard (file://, anciens navigateurs).
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.cssText = 'position:fixed;opacity:0';
      document.body.append(helper);
      helper.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      helper.remove();
      return ok;
    }
  }

  let copyTimer;
  el.copyBtn.addEventListener('click', async () => {
    if (!state.output) return;
    const ok = await copyText(state.output);
    el.copyLabel.textContent = ok ? 'Copié' : 'Copie impossible';
    el.copyBtn.classList.toggle('is-done', ok);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      el.copyLabel.textContent = 'Copier le résultat';
      el.copyBtn.classList.remove('is-done');
    }, 1600);
  });

  $('themeBtn').addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = theme;
    store.set('cesar:theme', theme);
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0e0d0b' : '#f3ecdf';
  });

  /** Le titre arrive chiffré puis se déchiffre lettre à lettre. */
  function decodeTitle() {
    if (reduceMotion.matches) return;
    const walker = document.createTreeWalker(el.title, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) nodes.push({ node: walker.currentNode, text: walker.currentNode.nodeValue });
    }
    const lettersTotal = nodes.reduce((sum, { text }) => sum + text.length, 0);
    const start = performance.now() + 350;
    const duration = 1100;

    const frame = (now) => {
      const progress = (now - start) / duration;
      let offset = 0;
      for (const { node, text } of nodes) {
        node.nodeValue = text.replace(/\p{L}/gu, (ch, index) => {
          if ((offset + index) / lettersTotal < progress) return ch;
          const random = ALPHABET[(Math.random() * N) | 0];
          return ch === ch.toUpperCase() ? random : random.toLowerCase();
        });
        offset += text.length;
      }
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* Démarrage ------------------------------------------------------------- */

  buildWheel();
  buildStrip();
  buildCrack();
  rotation = -state.key * STEP;
  renderMode();
  renderKey({ animate: false });
  renderText();
  decodeTitle();
})();
