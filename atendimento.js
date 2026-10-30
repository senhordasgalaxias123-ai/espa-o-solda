// Assistente virtual (IA) da Espaço Solda. Conversa com o gateway em /api/chat.
// Guarda o histórico só na aba (sessionStorage) e só depois do aviso de privacidade.

const ENDPOINT = "/api/chat";
const WA = "https://wa.me/551532253416?text=" + encodeURIComponent("Olá, Espaço Solda! Gostaria de um orçamento.");
const NOTICE_KEY = "es_chat_ok";
const HIST_KEY = "es_chat_hist";

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
};
const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

let history = [];
try { history = JSON.parse(store.get(HIST_KEY) || "[]"); } catch { history = []; }

/* ---------- Estrutura ---------- */
const fab = el("button", "chat-fab");
fab.type = "button";
fab.setAttribute("aria-expanded", "false");
fab.setAttribute("aria-controls", "chat-panel");
fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="10" r="1.2"/><circle cx="12.5" cy="10" r="1.2"/><circle cx="16" cy="10" r="1.2"/></svg><span>Atendente virtual</span>';

const panel = el("section", "chat-panel");
panel.id = "chat-panel";
panel.hidden = true;
panel.setAttribute("role", "dialog");
panel.setAttribute("aria-label", "Atendente virtual da Espaço Solda");

const head = el("header", "chat-head");
const title = el("div", "chat-title");
title.append(el("strong", "", "Atendente virtual"), el("small", "", "Inteligência artificial · a equipe confirma preços e prazos"));
const close = el("button", "chat-close", "×");
close.type = "button";
close.setAttribute("aria-label", "Fechar atendimento");
head.append(title, close);

const notice = el("div", "chat-notice");
const nt = el("p", "", "Este chat usa inteligência artificial para ajudar no seu orçamento. Não envie CPF, dados de cartão ou senhas. Se pedir orçamento, vamos usar seu nome e telefone só para a equipe retornar.");
const nl = el("a", "", "Política de Privacidade");
nl.href = "politica-de-privacidade.html";
const nb = el("button", "btn", "Começar conversa");
nb.type = "button";
notice.append(nt, nl, nb);

const log = el("div", "chat-log");
log.setAttribute("role", "log");
log.setAttribute("aria-live", "polite");

const chips = el("div", "chat-chips");
for (const c of ["Quero um orçamento", "Mangueiras hidráulicas", "Onde fica a loja?", "Falar com uma pessoa"]) {
  const b = el("button", "chat-chip", c); b.type = "button"; chips.append(b);
}

const form = el("form", "chat-form");
const input = el("input");
input.type = "text"; input.maxLength = 500; input.autocomplete = "off";
input.placeholder = "Escreva sua mensagem…";
input.setAttribute("aria-label", "Sua mensagem");
const send = el("button", "chat-send", "Enviar");
send.type = "submit";
form.append(input, send);

const foot = el("a", "chat-wa", "Prefere falar direto? WhatsApp da equipe ↗");
foot.href = WA; foot.target = "_blank"; foot.rel = "noopener noreferrer";

panel.append(head, notice, log, chips, form, foot);
document.body.append(fab, panel);

/* ---------- Mensagens ---------- */
function bubble(role, text, acoes = []) {
  const b = el("div", `chat-msg chat-msg--${role}`);
  b.append(el("p", "", text));
  for (const a of acoes) {
    if (a?.url?.startsWith("https://wa.me/")) {
      const l = el("a", "btn chat-action", a.rotulo || "Abrir no WhatsApp");
      l.href = a.url; l.target = "_blank"; l.rel = "noopener noreferrer";
      b.append(l);
    }
  }
  log.append(b);
  log.scrollTop = log.scrollHeight;
  return b;
}
function persist() { store.set(HIST_KEY, JSON.stringify(history.slice(-14))); }

function render() {
  log.replaceChildren();
  if (!history.length) bubble("bot", "Oi! Sou o assistente virtual da Espaço Solda. Me conta o que você precisa (máquina, ferramenta, mangueira…) e eu ajudo a montar o orçamento.");
  for (const m of history) bubble(m.role === "user" ? "user" : "bot", m.content, m.acoes);
  chips.hidden = history.length > 0;
}

function ready() { return local.get(NOTICE_KEY) === "1"; }
function sync() {
  const ok = ready();
  notice.hidden = ok;
  for (const n of [log, chips, form, foot]) n.hidden = !ok;
  if (ok) render();
}

async function ask(text) {
  text = text.trim();
  if (!text) return;
  history.push({ role: "user", content: text });
  persist(); render();
  chips.hidden = true;
  input.value = ""; send.disabled = true; input.disabled = true;
  const typing = bubble("bot", "Digitando…"); typing.classList.add("is-typing");
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
    });
    const data = await res.json().catch(() => ({}));
    typing.remove();
    if (!res.ok || !data.texto) throw new Error(data.texto || "falha");
    history.push({ role: "assistant", content: data.texto, acoes: data.acoes || [] });
  } catch (e) {
    typing.remove();
    history.push({ role: "assistant", content: "Não consegui responder agora. Fale direto com a equipe pelo WhatsApp.", acoes: [{ url: WA, rotulo: "Chamar no WhatsApp" }] });
  }
  persist(); render();
  send.disabled = false; input.disabled = false; input.focus();
}

/* ---------- Eventos ---------- */
function open() {
  panel.hidden = false; fab.setAttribute("aria-expanded", "true"); document.body.classList.add("chat-open");
  sync();
  (ready() ? input : nb).focus();
}
function shut() { panel.hidden = true; fab.setAttribute("aria-expanded", "false"); document.body.classList.remove("chat-open"); fab.focus(); }
fab.addEventListener("click", () => (panel.hidden ? open() : shut()));
close.addEventListener("click", shut);
panel.addEventListener("keydown", (e) => { if (e.key === "Escape") shut(); });
nb.addEventListener("click", () => { local.set(NOTICE_KEY, "1"); sync(); input.focus(); });
form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
chips.addEventListener("click", (e) => { const c = e.target.closest(".chat-chip"); if (c) ask(c.textContent); });
