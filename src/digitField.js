const CELL = 30;
const FRAME_MS = 1000 / 30;
const HOVER_RADIUS = 150;
// Onda criada por um toque (celular): velocidade da frente, largura da faixa que acende, duração e quantidade máxima ao mesmo tempo.
const RIPPLE_SPEED = 380;
const RIPPLE_BAND = 55;
const RIPPLE_LIFE = 1.4;
const RIPPLE_MAX = 6;
const PALETTE_DARK = { base: "139, 156, 173", baseAlpha: 0.055, hover: "232, 175, 62", hoverAlpha: 0.32 };
const PALETTE_LIGHT = { base: "71, 85, 105", baseAlpha: 0.075, hover: "183, 121, 31", hoverAlpha: 0.42 };

const randomDigit = () => String(Math.floor(Math.random() * 10));
const themeSwitching = () => document.documentElement.classList.contains("theme-switching");

// O canvas desenha dentro do elemento pai: ele precisa ter posição (relative/absolute/fixed) e conteúdo acima (z-index) para a logo não ficar por baixo dos dígitos.
// adaptive: segue o tema claro/escuro da página. Sem ele, a paleta é sempre a de fundo escuro (painéis e cortinas que são grafite nos dois temas).
export function createDigitField(canvas, { media = "(min-width: 768px)", adaptive = false } = {}) {
  const host = canvas.parentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wide = window.matchMedia(media);

  let ctx = null;
  let raf = 0;
  let lastFrame = 0;
  let lastTick = 0;
  let width = 0;
  let height = 0;
  let wanted = false;
  let columns = [];
  const pointer = { x: -1000, y: -1000, strength: 0, target: 0 };
  let ripples = [];

  function buildColumns() {
    const cols = Math.ceil(width / CELL) + 1;
    const rows = Math.ceil(height / CELL) + 2;
    columns = Array.from({ length: cols }, () => ({
      speed: 6 + Math.random() * 16,
      offset: Math.random() * CELL,
      digits: Array.from({ length: rows }, randomDigit)
    }));
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `13px "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    buildColumns();
    draw();
  }

  function step(dt) {
    for (const col of columns) {
      col.offset += col.speed * dt;
      while (col.offset >= CELL) {
        col.offset -= CELL;
        col.digits.pop();
        col.digits.unshift(randomDigit());
      }
      if (Math.random() < 0.004) col.digits[Math.floor(Math.random() * col.digits.length)] = randomDigit();
    }
    pointer.strength += (pointer.target - pointer.strength) * Math.min(1, dt * 6);
    ripples.forEach((rp) => {
      rp.age += dt;
      rp.radius = RIPPLE_SPEED * rp.age;
    });
    ripples = ripples.filter((rp) => rp.age < RIPPLE_LIFE);
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    // Fora da faixa de tela do componente nada deve ser desenhado: sem isto sobra um desenho estático ao montar.
    if (!wide.matches) return;
    const palette = adaptive && !document.documentElement.classList.contains("dark") ? PALETTE_LIGHT : PALETTE_DARK;
    ctx.fillStyle = `rgba(${palette.base}, ${palette.baseAlpha})`;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const x = c * CELL + CELL / 2;
      for (let r = 0; r < col.digits.length; r++) {
        ctx.fillText(col.digits[r], x, (r - 1) * CELL + col.offset + CELL / 2);
      }
    }

    const spot = pointer.strength >= 0.02;
    if (reduced || (!spot && !ripples.length)) return;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const x = c * CELL + CELL / 2;
      if (!ripples.length && Math.abs(x - pointer.x) > HOVER_RADIUS) continue;
      for (let r = 0; r < col.digits.length; r++) {
        const y = (r - 1) * CELL + col.offset + CELL / 2;
        let alpha = 0;
        let dx = 0;
        let dy = 0;
        if (spot) {
          const d = Math.hypot(x - pointer.x, y - pointer.y);
          if (d < HOVER_RADIUS) {
            const k = 1 - d / HOVER_RADIUS;
            alpha = k * k * palette.hoverAlpha * pointer.strength;
          }
        }
        for (const rp of ripples) {
          const dist = Math.hypot(x - rp.x, y - rp.y);
          const delta = dist - rp.radius;
          if (Math.abs(delta) >= RIPPLE_BAND) continue;
          const k = 1 - Math.abs(delta) / RIPPLE_BAND;
          const strength = k * k * (1 - rp.age / RIPPLE_LIFE);
          alpha = Math.max(alpha, strength * palette.hoverAlpha * 1.35);
          if (dist > 0) {
            dx += ((x - rp.x) / dist) * strength * 5;
            dy += ((y - rp.y) / dist) * strength * 5;
          }
        }
        if (alpha < 0.012) continue;
        ctx.fillStyle = `rgba(${palette.hover}, ${alpha.toFixed(3)})`;
        ctx.fillText(col.digits[r], x + dx, y + dy);
      }
    }
  }

  function loop(now) {
    if (!host.isConnected) {
      destroy();
      return;
    }
    raf = requestAnimationFrame(loop);
    // Durante a onda de tema (useTheme.js) o canvas não anima: cada quadro desenhado invalida a captura ao vivo da transição e piora a travada do primeiro quadro.
    if (document.hidden || themeSwitching() || now - lastFrame < FRAME_MS) return;
    const dt = Math.min((now - (lastTick || now)) / 1000, 0.1);
    lastFrame = now;
    lastTick = now;
    step(dt);
    draw();
  }

  function run() {
    if (reduced || raf || !wanted || !wide.matches) return;
    lastTick = 0;
    raf = requestAnimationFrame(loop);
  }

  function halt() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function onMove(e) {
    const rect = host.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.target = 1;
  }

  function onLeave() {
    pointer.target = 0;
  }

  // Clique ou toque: uma onda parte do ponto. No toque (sem cursor), segurar também acende os números ao redor do dedo, como o mouse faz ao passar por cima.
  function onDown(e) {
    if (!wide.matches) return;
    const rect = host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (e.pointerType !== "mouse") {
      pointer.x = x;
      pointer.y = y;
      pointer.target = 1;
    }
    ripples.push({ x, y, age: 0, radius: 0 });
    if (ripples.length > RIPPLE_MAX) ripples.shift();
  }

  function onUp(e) {
    if (e.pointerType === "mouse") return;
    pointer.target = 0;
  }

  function onWideChange() {
    draw();
    if (wide.matches) run();
    else halt();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  let lastDark = document.documentElement.classList.contains("dark");
  const themeObserver = adaptive
    ? new MutationObserver(() => {
        const dark = document.documentElement.classList.contains("dark");
        if (dark === lastDark) return;
        lastDark = dark;
        // Com o laço rodando, o próximo quadro já redesenha com a paleta nova: desenhar aqui só pesaria no primeiro quadro da onda.
        if (!raf) draw();
      })
    : null;
  if (themeObserver) themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  if (!reduced) {
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);
  }
  wide.addEventListener("change", onWideChange);
  resize();

  function destroy() {
    halt();
    wanted = false;
    observer.disconnect();
    if (themeObserver) themeObserver.disconnect();
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
    host.removeEventListener("pointerdown", onDown);
    host.removeEventListener("pointerup", onUp);
    host.removeEventListener("pointercancel", onUp);
    wide.removeEventListener("change", onWideChange);
  }

  return {
    start() {
      wanted = true;
      run();
    },
    stop() {
      wanted = false;
      halt();
    },
    destroy
  };
}
