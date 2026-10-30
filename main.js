import { buildWhatsAppUrl, parseConsent, serializeConsent, validateQuote } from "./lib.js";

const CONSENT_KEY = "es_consent";
// Preencha o ID (ex.: "G-XXXXXXX") para ativar o Google Analytics. Só carrega após consentimento.
const ANALYTICS_ID = "";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- Consentimento de cookies ---------------- */

function readConsent() {
  try {
    return parseConsent(localStorage.getItem(CONSENT_KEY));
  } catch {
    return null;
  }
}

function saveConsent(choice) {
  try {
    localStorage.setItem(CONSENT_KEY, serializeConsent(choice));
  } catch {
    // Navegador bloqueou o armazenamento: a escolha vale apenas nesta página.
  }
}

function loadAnalytics() {
  if (!ANALYTICS_ID || document.querySelector("script[data-analytics]")) return;
  const script = document.createElement("script");
  script.async = true;
  script.dataset.analytics = "true";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_ID)}`;
  document.head.append(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", ANALYTICS_ID, { anonymize_ip: true });
}

function applyConsent(choice) {
  if (choice.analytics) loadAnalytics();
  if (choice.thirdparty) document.querySelectorAll("[data-map-src]").forEach(loadMap);
}

function setupCookies() {
  const banner = document.getElementById("cookie-banner");
  if (!banner) return;

  const prefs = banner.querySelector(".cookie-prefs");
  const analyticsBox = banner.querySelector("#consent-analytics");
  const thirdpartyBox = banner.querySelector("#consent-thirdparty");
  const customize = banner.querySelector("[data-cookie-customize]");

  const show = () => {
    const current = readConsent();
    analyticsBox.checked = current?.analytics === true;
    thirdpartyBox.checked = current?.thirdparty === true;
    prefs.hidden = true;
    customize.textContent = "Personalizar";
    customize.setAttribute("aria-expanded", "false");
    banner.hidden = false;
    banner.classList.remove("is-leaving");
    banner.classList.add("is-entering");
  };

  const hide = () => {
    banner.classList.remove("is-entering");
    if (reduceMotion) {
      banner.hidden = true;
      return;
    }
    banner.classList.add("is-leaving");
    banner.addEventListener(
      "animationend",
      () => {
        banner.hidden = true;
        banner.classList.remove("is-leaving");
      },
      { once: true },
    );
  };

  const choose = (choice) => {
    saveConsent(choice);
    applyConsent(choice);
    hide();
  };

  banner.querySelector("[data-cookie-accept]").addEventListener("click", () => {
    choose({ analytics: true, thirdparty: true });
  });
  banner.querySelector("[data-cookie-reject]").addEventListener("click", () => {
    choose({ analytics: false, thirdparty: false });
  });
  customize.addEventListener("click", () => {
    if (prefs.hidden) {
      prefs.hidden = false;
      customize.textContent = "Salvar escolhas";
      customize.setAttribute("aria-expanded", "true");
      analyticsBox.focus();
    } else {
      choose({ analytics: analyticsBox.checked, thirdparty: thirdpartyBox.checked });
    }
  });
  banner.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && readConsent()) hide();
  });

  document.querySelectorAll("[data-open-cookies]").forEach((button) => {
    button.addEventListener("click", show);
  });

  const stored = readConsent();
  if (stored) {
    applyConsent(stored);
  } else {
    show();
  }
}

/* ---------------- Mapa (conteúdo de terceiros) ---------------- */

function loadMap(box) {
  if (box.dataset.loaded === "true") return;
  box.dataset.loaded = "true";

  const skeleton = document.createElement("div");
  skeleton.className = "skeleton";
  skeleton.setAttribute("aria-hidden", "true");
  box.append(skeleton);

  const frame = document.createElement("iframe");
  frame.title = "Mapa com a localização da loja Espaço Solda em Sorocaba";
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer-when-downgrade";
  frame.src = box.dataset.mapSrc;
  frame.addEventListener("load", () => {
    skeleton.remove();
    box.querySelector("[data-map-fallback]")?.remove();
  });
  box.append(frame);
}

function setupMap() {
  document.querySelectorAll("[data-load-map]").forEach((button) => {
    button.addEventListener("click", () => {
      const box = button.closest("[data-map-src]");
      if (box) loadMap(box);
    });
  });
}

/* ---------------- Navegação ---------------- */

function setupNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("menu");
  if (!toggle || !nav) return;

  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      close();
      toggle.focus();
    }
  });
}

/* ---------------- Movimento: entrada, saída, progresso, imagens ---------------- */

function setupReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduceMotion) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  items.forEach((item) => observer.observe(item));
}

function setupImages() {
  document.querySelectorAll(".media").forEach((media) => {
    const img = media.querySelector("img");
    if (!img || img.complete) return;
    media.classList.add("is-loading");
    const done = () => media.classList.remove("is-loading");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

function setupScrollProgress() {
  const bar = document.querySelector(".scroll-progress");
  if (!bar || reduceMotion) return;
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

function setupPageTransitions() {
  window.addEventListener("pageshow", () => document.body.classList.remove("is-leaving"));
  if (reduceMotion) return;

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== "_self") return;
    if (link.hasAttribute("download")) return;

    const url = new URL(link.href, window.location.href);
    const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
    if (url.origin !== window.location.origin || samePage) return;

    event.preventDefault();
    document.body.classList.add("is-leaving");
    window.setTimeout(() => {
      window.location.href = url.href;
    }, 180);
  });
}

/* ---------------- Formulário de orçamento ---------------- */

function setupQuoteForm() {
  const form = document.getElementById("form-orcamento");
  if (!form) return;

  const status = document.getElementById("form-status");
  const button = form.querySelector("button[type='submit']");
  const fields = ["nome", "telefone", "email", "mensagem", "consentimento"];

  const clearErrors = () => {
    for (const name of fields) {
      const input = form.elements[name];
      const message = document.getElementById(`erro-${name}`);
      input?.removeAttribute("aria-invalid");
      if (message) message.textContent = "";
    }
    status.textContent = "";
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearErrors();

    const data = {
      nome: form.elements.nome.value,
      telefone: form.elements.telefone.value,
      email: form.elements.email.value,
      interesse: form.elements.interesse.value,
      mensagem: form.elements.mensagem.value,
      consentimento: form.elements.consentimento.checked,
    };
    const { valid, errors } = validateQuote(data);

    if (!valid) {
      let firstInvalid = null;
      for (const name of fields) {
        if (!errors[name]) continue;
        const input = form.elements[name];
        input.setAttribute("aria-invalid", "true");
        document.getElementById(`erro-${name}`).textContent = errors[name];
        firstInvalid ||= input;
      }
      status.textContent = "Confira os campos destacados.";
      firstInvalid?.focus();
      return;
    }

    const url = buildWhatsAppUrl(form.dataset.whatsapp, data);
    button.setAttribute("aria-busy", "true");
    status.textContent = "Preparando sua mensagem…";

    window.setTimeout(() => {
      window.open(url, "_blank", "noopener");
      button.removeAttribute("aria-busy");
      status.textContent = "";
      const fallback = document.createElement("span");
      fallback.append("Pronto! Se o WhatsApp não abriu, ");
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "clique aqui para abrir a conversa";
      fallback.append(link, ".");
      status.append(fallback);
    }, reduceMotion ? 0 : 500);
  });
}

/* ---------------- Início ---------------- */

setupNav();
setupReveal();
setupImages();
setupScrollProgress();
setupPageTransitions();
setupQuoteForm();
setupMap();
setupCookies();
