/* César — chiffrement par décalage · IM_ME
   1. Chiffre (fonctions pures)   2. État   3. Construction
   4. Rendu   5. Interactions     6. Effets  7. Démarrage */
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

  /* Table ASCII : noms des 32 caractères de contrôle, puis familles. */
  const CONTROL = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
    'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];

  const asciiLabel = (code) => (code < 32 ? CONTROL[code] : code === 32 ? 'SP' : code === 127 ? 'DEL' : String.fromCharCode(code));
  const asciiKind = (code) => {
    if (code < 32 || code === 127) return 'ctrl';
    if (code >= 48 && code <= 57) return 'digit';
    if (code >= 65 && code <= 90) return 'upper';
    if (code >= 97 && code <= 122) return 'lower';
    return 'symbol';
  };
  const KIND_LABEL = {
    ctrl: 'Caractère de contrôle', digit: 'Chiffre', upper: 'Lettre majuscule',
    lower: 'Lettre minuscule', symbol: 'Symbole ou ponctuation',
  };

  /* 2. État --------------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.add('js');

  const el = {
    input: $('input'), output: $('output'), count: $('count'),
    inputLabel: $('inputLabel'), outputLabel: $('outputLabel'),
    hubNum: $('hubNum'), pairTo: $('pairTo'), readoutText: $('readoutText'),
    wheel: $('wheel'), range: $('range'), strip: $('strip'),
    copyBtn: $('copyBtn'), copyLabel: $('copyLabel'), title: $('title'),
    promptMode: $('promptMode'), sigArt: $('sigArt'), sigCaesar: $('sigCaesar'),
    ascii: $('ascii'), brandName: $('brandName'),
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
    inspected: 65, // code ASCII affiché dans l'inspecteur
  };

  const COPY = {
    encrypt: { input: 'Message clair', output: 'Message chiffré', placeholder: 'Écrivez votre message…', verb: 'chiffrer' },
    decrypt: { input: 'Message chiffré', output: 'Message clair', placeholder: 'Collez le message à déchiffrer…', verb: 'dechiffrer' },
  };

  const NICKNAME = 'IM_ME';
  // « IM_ME » en caractères blocs (police ANSI Shadow).
  const SIGNATURE = [
    '██╗███╗   ███╗        ███╗   ███╗███████╗',
    '██║████╗ ████║        ████╗ ████║██╔════╝',
    '██║██╔████╔██║        ██╔████╔██║█████╗  ',
    '██║██║╚██╔╝██║        ██║╚██╔╝██║██╔══╝  ',
    '██║██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗',
    '╚═╝╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝',
  ];

  /* 3. Construction ------------------------------------------------------- */

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
  const cells = [];         // cellules de la table de correspondance
  const asciiCells = [];    // 128 cellules de la table ASCII

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

  function buildAscii() {
    for (let code = 0; code < 128; code++) {
      const cell = document.createElement('button');
      const hex = code.toString(16).toUpperCase().padStart(2, '0');
      cell.type = 'button';
      cell.className = 'ac';
      cell.dataset.code = code;
      cell.dataset.kind = asciiKind(code);
      cell.setAttribute('aria-label', `${asciiLabel(code)}, code ${code}, hexadécimal ${hex}`);

      const glyph = document.createElement('b');
      glyph.textContent = asciiLabel(code); // textContent : « < » et « & » restent du texte
      const codes = document.createElement('small');
      codes.innerHTML = `<span>${code}</span><i>${hex}</i>`;

      cell.append(glyph, codes);
      asciiCells.push(cell);
      el.ascii.append(cell);
    }
  }

  /* 4. Rendu -------------------------------------------------------------- */

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

    // Table ASCII : repère les codes présents dans le message et dans le résultat.
    const codesOf = (text) => new Set(Array.from(text, (ch) => ch.charCodeAt(0)));
    const source = codesOf(normalize(raw));
    const result = codesOf(state.output);
    asciiCells.forEach((cell, code) => {
      cell.classList.toggle('in-src', source.has(code));
      cell.classList.toggle('in-out', result.has(code));
    });
  }

  function renderInspector() {
    const code = state.inspected;
    const kind = asciiKind(code);
    const label = asciiLabel(code);
    const bin = code.toString(2).padStart(8, '0');

    const glyph = $('insGlyph');
    glyph.textContent = label;
    glyph.classList.toggle('is-small', label.length > 1);
    $('insDec').textContent = code;
    $('insHex').textContent = `0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
    $('insOct').textContent = code.toString(8).padStart(3, '0');
    $('insBin').textContent = `${bin.slice(0, 4)} ${bin.slice(4)}`;
    $('insKind').textContent = code === 32 ? 'Espace' : KIND_LABEL[kind];
    $('insCaesar').textContent = kind === 'upper' || kind === 'lower'
      ? `${label} → ${shiftText(label, state.key)}`
      : 'inchangé';

    asciiCells.forEach((cell, index) => cell.classList.toggle('is-sel', index === code));
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

    document.querySelectorAll('[data-k]').forEach((node) => { node.textContent = k; });
    el.pairTo.textContent = target;
    el.readoutText.textContent = `décalage de ${k} lettre${k > 1 ? 's' : ''}`;
    el.sigCaesar.textContent = shiftText(NICKNAME, k);
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

    renderInspector();
    if (animate) { pop(el.hubNum); pop(el.pairTo); pop(el.sigCaesar); }
  }

  function renderMode() {
    const copy = COPY[state.mode];
    root.dataset.mode = state.mode;
    el.inputLabel.textContent = copy.input;
    el.outputLabel.textContent = copy.output;
    el.input.placeholder = copy.placeholder;
    el.promptMode.textContent = copy.verb;
    document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
  }

  /* 5. Interactions ------------------------------------------------------- */

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
    if (event.data && event.data.length === 1) {
      flash(event.data);
      // L'inspecteur ASCII suit le dernier caractère tapé.
      const code = normalize(event.data).charCodeAt(0);
      if (code < 128) { state.inspected = code; renderInspector(); }
    }
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

  // Table ASCII : survol, focus ou clic d'une cellule → inspecteur.
  {
    const inspect = (event) => {
      const cell = event.target.closest('.ac');
      if (!cell) return;
      state.inspected = Number(cell.dataset.code);
      renderInspector();
    };
    el.ascii.addEventListener('pointerover', inspect);
    el.ascii.addEventListener('focusin', inspect);
    el.ascii.addEventListener('click', inspect);

    const filters = document.querySelectorAll('.chip[data-filter]');
    filters.forEach((chip) => {
      chip.addEventListener('click', () => {
        const filter = chip.dataset.filter;
        filters.forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
        asciiCells.forEach((cell) => {
          cell.classList.toggle('is-dim', filter !== 'all' && cell.dataset.kind !== filter);
        });
      });
    });
  }

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

  /* 6. Effets ------------------------------------------------------------- */

  const HACK_GLYPHS = '01#$%&@<>/\\[]{}=+*?!';
  const BLOCK_GLYPHS = '░▒▓█';
  const pick = (glyphs) => glyphs[(Math.random() * glyphs.length) | 0];

  /** Le titre arrive en caractères brouillés puis se résout de gauche à droite. */
  function decodeTitle() {
    if (reduceMotion.matches) return;
    const walker = document.createTreeWalker(el.title, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue.trim() && !node.parentElement.classList.contains('title__cursor')) {
        nodes.push({ node, text: node.nodeValue });
      }
    }
    const total = nodes.reduce((sum, { text }) => sum + text.length, 0);
    const start = performance.now() + 300;
    const duration = 1200;

    const frame = (now) => {
      const progress = (now - start) / duration;
      let offset = 0;
      for (const { node, text } of nodes) {
        node.nodeValue = text.replace(/\p{L}/gu, (ch, index) => ((offset + index) / total < progress ? ch : pick(HACK_GLYPHS)));
        offset += text.length;
      }
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Signature en blocs : balayage de gauche à droite depuis du bruit. */
  function drawSignature({ animate = true } = {}) {
    const final = SIGNATURE.join('\n');
    el.sigArt.textContent = final;
    if (!animate || reduceMotion.matches) return;

    const width = SIGNATURE[0].length;
    const start = performance.now();
    const duration = 1100;
    const frame = (now) => {
      const progress = (now - start) / duration;
      el.sigArt.textContent = SIGNATURE
        .map((line) => Array.from(line, (ch, x) => (ch === ' ' || x / width < progress - Math.random() * 0.18 ? ch : pick(BLOCK_GLYPHS))).join(''))
        .join('\n');
      if (progress < 1.2) requestAnimationFrame(frame); else el.sigArt.textContent = final;
    };
    requestAnimationFrame(frame);
  }

  /** Pseudo dans l'en-tête : au survol, passe par du bruit et son écriture « leet ». */
  function hackName(node) {
    let timer;
    const run = () => {
      if (reduceMotion.matches) return;
      clearInterval(timer);
      let tick = 0;
      timer = setInterval(() => {
        tick++;
        let text;
        if (tick < 8) text = Array.from(NICKNAME, (ch) => (ch === '_' ? '_' : pick(HACK_GLYPHS))).join('');
        else if (tick < 16) text = '1M_M3';
        else { text = NICKNAME; clearInterval(timer); }
        node.textContent = text;
        node.dataset.text = text;
      }, 55);
    };
    node.closest('a, p').addEventListener('pointerenter', run);
    return run;
  }

  // Halo des cartes : suit le pointeur.
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - box.left}px`);
      card.style.setProperty('--my', `${event.clientY - box.top}px`);
    });
  });

  // Entrée des cartes au défilement ; la signature se dessine à son arrivée.
  function observeCards() {
    const cards = document.querySelectorAll('[data-in]');
    const show = (card) => {
      card.classList.add('is-in');
      if (card.contains(el.sigArt)) drawSignature();
    };
    if (!('IntersectionObserver' in window)) { cards.forEach(show); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    cards.forEach((card) => observer.observe(card));
  }

  /* 7. Démarrage ---------------------------------------------------------- */

  buildWheel();
  buildStrip();
  buildAscii();
  drawSignature({ animate: false });
  rotation = -state.key * STEP;
  renderMode();
  renderKey({ animate: false });
  renderText();
  observeCards();
  decodeTitle();
  setTimeout(hackName(el.brandName), 900);
})();
