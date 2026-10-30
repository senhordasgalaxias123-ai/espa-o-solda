// Motor de cenas da home: o scroll vertical controla a "câmera".
// Cada [data-scene] é uma seção alta com um palco fixo (sticky). A rolagem vira um
// progresso 0–1 (--p); cada [data-r="a,b"] recebe --t, o progresso dentro da faixa a–b.
// Só transform/opacity são animados (rápido em iPhone). Sem JS ou com "reduzir movimento",
// a página é um fluxo normal e legível.

const root = document.documentElement;
const cin = root.classList.contains("cin");
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* Cabeçalho sólido depois da abertura */
const header = document.querySelector(".site-header");
const syncHeader = () => header?.classList.toggle("is-solid", window.scrollY > 40);
window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();

/* Linhas do catálogo: destaque da linha central */
const rows = [...document.querySelectorAll(".c-row")];
if (rows.length && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle("is-active", e.isIntersecting)),
    { rootMargin: "-42% 0px -42% 0px" },
  );
  rows.forEach((r) => io.observe(r));
}

/* Revelação simples das seções normais */
const reveals = [...document.querySelectorAll(".c-reveal")];
if (reveals.length) {
  if (!cin || !("IntersectionObserver" in window)) {
    reveals.forEach((r) => r.classList.add("is-visible"));
  } else {
    const rv = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); rv.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    reveals.forEach((r) => rv.observe(r));
  }
}

if (cin) {
  const film = document.querySelector("[data-film]");
  const stage = film.querySelector(".f-stage");
  const beats = [...film.querySelectorAll(".f-beat")];
  const items = [...film.querySelectorAll("[data-r]")].map((n) => {
    const [a, b] = n.dataset.r.split(",").map(Number);
    return { n, a, b, t: -1 };
  });
  const byEl = new Map(items.map((i) => [i.n, i]));
  const plates = [...film.querySelectorAll(".c-plate")];
  const seams = [...film.querySelectorAll(".f-seam")].map((n) => byEl.get(n));
  const railBtns = [...film.querySelectorAll(".f-rail button")];
  const draws = [...document.querySelectorAll("[data-draw]")].map((n) => ({ n, path: n.querySelector("path"), head: n.querySelector(".c-bead__head"), len: 0 }));
  draws.forEach((d) => { try { d.len = d.path.getTotalLength(); } catch { d.len = 0; } });
  const maskT = (beat) => byEl.get(beat)?.t ?? 1;
  let vh = window.innerHeight, queued = false, P = 0;

  const update = () => {
    queued = false;
    const rect = film.getBoundingClientRect();
    const span = Math.max(1, rect.height - vh);
    P = clamp(-rect.top / span);
    for (const it of items) {
      const t = clamp((P - it.a) / (it.b - it.a));
      if (Math.abs(t - it.t) > 0.0004) { it.t = t; it.n.style.setProperty("--t", t.toFixed(4)); }
    }
    // cena "viva" = a que está inteira na tela e ainda não foi coberta pela próxima
    beats.forEach((b, i) => {
      const live = maskT(b) > 0.7 && (i === beats.length - 1 || maskT(beats[i + 1]) < 0.25);
      b.classList.toggle("is-live", live);
    });
    const idx = P < 0.19 ? 0 : P < 0.62 ? 1 : P < 0.9 ? 2 : 3;
    railBtns.forEach((b, i) => b.classList.toggle("is-active", i === idx));
    for (const d of draws) {
      const r = d.n.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const t = clamp((vh * 0.92 - r.top) / (vh * 0.5));
      d.n.style.setProperty("--d", t.toFixed(3));
      if (d.head && d.len) { const pt = d.path.getPointAtLength(t * d.len); d.head.setAttribute("cx", pt.x.toFixed(1)); d.head.setAttribute("cy", pt.y.toFixed(1)); }
    }
    const b2live = beats[1].classList.contains("is-live");
    plates.forEach((pl, i) => {
      const t = byEl.get(pl).t;
      pl.classList.toggle("is-on", b2live && t > 0.15 && (i === plates.length - 1 || t < 0.9));
    });
  };
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  /* Posição do arco de solda (imagem com object-fit: cover, posição 70% 50%) */
  const b1 = beats[0];
  const cam = b1.querySelector(".f-layer");
  const arc = { x: 0, y: 0 };
  const placeArc = () => {
    const w = stage.clientWidth, h = stage.clientHeight, iw = 1672, ih = 940;
    const k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k;
    arc.x = (w - dw) * 0.7 + 0.7117 * dw;
    arc.y = (h - dh) * 0.5 + 0.7234 * dh;
    b1.style.setProperty("--ax", `${arc.x.toFixed(1)}px`);
    b1.style.setProperty("--ay", `${arc.y.toFixed(1)}px`);
  };

  /* Faíscas: no arco (abertura) e ao longo de cada costura durante a fusão */
  const canvas = film.querySelector(".f-sparks");
  const ctx = canvas.getContext("2d");
  let cw = 0, ch = 0;
  const sizeCanvas = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const ANG = (105 * Math.PI) / 180;
  const dir = { x: Math.sin(ANG), y: -Math.cos(ANG) };      // direção do gradiente
  const perp = { x: -dir.y, y: dir.x };                      // direção da costura
  const seamPoint = (t) => {
    const L = Math.abs(cw * Math.sin(ANG)) + Math.abs(ch * Math.cos(ANG));
    const pos = (t * 1.5 - 0.17) - 0.5;                      // % do gradiente a partir do centro
    const r = (Math.random() - 0.5) * (Math.abs(cw * perp.x) + Math.abs(ch * perp.y)) * 1.1;
    return { x: cw / 2 + dir.x * pos * L + perp.x * r, y: ch / 2 + dir.y * pos * L + perp.y * r };
  };
  const parts = [];
  const cap = window.innerWidth < 800 ? 120 : 260;
  const spawn = (x, y, boost, up) => {
    const a = up ? -Math.PI * (0.05 + Math.random() * 0.9) : Math.random() * Math.PI * 2;
    const v = (1.2 + Math.random() * 3.6) * (1 + boost * 0.7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, d: 0.014 + Math.random() * 0.022, w: 0.6 + Math.random() * 1.3 });
  };
  let running = false, raf = 0;
  const frame = () => {
    if (!running) return;
    ctx.clearRect(0, 0, cw, ch);
    if (parts.length < cap) {
      const heroT = byEl.get(cam).t;
      if (P < 0.26) for (let i = 0; i < 1 + heroT * 3; i++) if (Math.random() < 0.7) spawn(arc.x, arc.y, heroT, true);
      for (const s of seams) {
        if (s.t > 0.02 && s.t < 0.98) for (let i = 0; i < 4; i++) { const p = seamPoint(s.t); spawn(p.x, p.y, 1, false); }
      }
    }
    ctx.lineCap = "round";
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.vy += 0.08; q.x += q.vx; q.y += q.vy; q.life -= q.d;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255, ${Math.round(150 + q.life * 80)}, ${Math.round(40 + q.life * 60)}, ${q.life})`;
      ctx.lineWidth = q.w;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 2.2, q.y - q.vy * 2.2); ctx.stroke();
    }
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!running && !document.hidden) { running = true; raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(film);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", () => { vh = window.innerHeight; placeArc(); sizeCanvas(); request(); }, { passive: true });
  placeArc(); sizeCanvas(); update();
  window.addEventListener("load", () => { placeArc(); sizeCanvas(); request(); });

  railBtns.forEach((b) => b.addEventListener("click", () => {
    const span = film.offsetHeight - vh;
    window.scrollTo({ top: film.offsetTop + span * parseFloat(b.dataset.go), behavior: "smooth" });
  }));

  /* "Ver o que temos": desce até o catálogo, passando pelo filme */
  document.querySelectorAll('a[href="#produtos-home"]').forEach((a) => a.addEventListener("click", (ev) => {
    ev.preventDefault();
    const t = document.getElementById("produtos-home");
    window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
  }));
}
