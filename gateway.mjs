// Gateway único da Espaço Solda: todas as rotas de IA entram por /api/*.
//   GET  /api/health     → estado do gateway (sem segredos)
//   POST /api/chat       → chat do site (histórico enviado pelo navegador)
//   GET  /api/whatsapp   → verificação do webhook da Meta
//   POST /api/whatsapp   → mensagens recebidas no WhatsApp Business (Cloud API)
import { executarAgente, sanitizeMessages, assinaturaValida, limiteExcedido, origemPermitida } from "../lib/agente.mjs";

export const config = {
  path: ["/api/health", "/api/chat", "/api/whatsapp"],
  rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

const FALHA = "Não consegui responder agora. Fale direto com a equipe pelo WhatsApp.";

/* ---------- Memória opcional das conversas do WhatsApp (Netlify Blobs) ---------- */
async function memoria() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore("conversas-whatsapp");
  } catch {
    return null; // sem o pacote: o agente responde sem histórico
  }
}

async function chat(req, env) {
  if (!origemPermitida(req, env)) return json({ erro: "origem_nao_permitida" }, 403);
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "anon";
  if (limiteExcedido(`chat:${ip}`)) return json({ erro: "muitas_mensagens", texto: "Muitas mensagens em pouco tempo. Tente de novo em alguns minutos." }, 429);

  let corpo;
  try {
    const bruto = await req.text();
    if (bruto.length > 20000) return json({ erro: "corpo_grande" }, 413);
    corpo = JSON.parse(bruto);
  } catch {
    return json({ erro: "json_invalido" }, 400);
  }
  const messages = sanitizeMessages(corpo?.messages);
  if (!messages.length) return json({ erro: "mensagens_invalidas" }, 400);

  try {
    const r = await executarAgente({ messages, canal: "site", env });
    return json({ texto: r.texto, acoes: r.acoes });
  } catch (e) {
    console.error("chat falhou:", e.codigo ?? "erro", e.detalhe ?? e.message);
    return json({ erro: e.codigo ?? "erro", texto: FALHA }, e.codigo === "sem_chave" ? 503 : 502);
  }
}

/* ---------- WhatsApp ---------- */
async function enviarWhatsApp(env, para, texto) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(0, 3500) } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) console.error("whatsapp envio falhou:", r.status);
}

async function whatsapp(req, env) {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("forbidden", { status: 403 });
  }

  const bruto = await req.text();
  if (!(await assinaturaValida(bruto, req.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET))) {
    return new Response("assinatura inválida", { status: 401 });
  }
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return json({ erro: "whatsapp_nao_configurado" }, 503);

  let evento;
  try { evento = JSON.parse(bruto); } catch { return json({ ok: true }); }

  const store = await memoria();
  for (const entrada of evento.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      for (const msg of mudanca.value?.messages ?? []) {
        const de = msg.from;
        if (!de) continue;
        try {
          if (store && msg.id && (await store.get(`msg:${msg.id}`))) continue; // já processada
          if (msg.type !== "text") {
            await enviarWhatsApp(env, de, "Por aqui consigo ler só texto. Escreva o que você precisa, ou ligue para (15) 3225-3416.");
            continue;
          }
          const historico = store ? ((await store.get(`hist:${de}`, { type: "json" })) ?? []) : [];
          const messages = sanitizeMessages([...historico, { role: "user", content: msg.text?.body ?? "" }]);
          if (!messages.length) continue;
          const r = await executarAgente({ messages, canal: "whatsapp", env });
          await enviarWhatsApp(env, de, r.texto);
          if (store) {
            await store.setJSON(`hist:${de}`, [...messages, { role: "assistant", content: r.texto }].slice(-12));
            if (msg.id) await store.set(`msg:${msg.id}`, "1");
          }
        } catch (e) {
          console.error("whatsapp falhou:", e.codigo ?? "erro", e.detalhe ?? e.message);
          try { await enviarWhatsApp(env, de, "Tive um problema aqui. Pode ligar para (15) 3225-3416 ou tentar de novo daqui a pouco."); } catch {}
        }
      }
    }
  }
  return json({ ok: true });
}

export default async (req) => {
  const env = process.env;
  const { pathname } = new URL(req.url);

  if (pathname === "/api/health") {
    return json({ ok: true, ia: Boolean(env.ANTHROPIC_API_KEY), whatsapp: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_APP_SECRET), notificacao: Boolean(env.NOTIFY_WEBHOOK_URL) });
  }
  if (pathname === "/api/chat") {
    if (req.method !== "POST") return json({ erro: "metodo" }, 405, { allow: "POST" });
    return chat(req, env);
  }
  if (pathname === "/api/whatsapp") {
    if (req.method !== "GET" && req.method !== "POST") return json({ erro: "metodo" }, 405);
    return whatsapp(req, env);
  }
  return json({ erro: "nao_encontrado" }, 404);
};
