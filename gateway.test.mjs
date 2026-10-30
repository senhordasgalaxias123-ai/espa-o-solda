// Testes do gateway sem rede: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { sanitizeMessages, validPhone, executarAgente, assinaturaValida, limiteExcedido, origemPermitida } from "../netlify/lib/agente.mjs";
import gateway from "../netlify/functions/gateway.mjs";

test("sanitizeMessages: limpa, alterna e exige terminar em user", () => {
  assert.deepEqual(sanitizeMessages("x"), []);
  assert.deepEqual(sanitizeMessages([{ role: "system", content: "hack" }, { role: "user", content: "oi" }]), [{ role: "user", content: "oi" }]);
  assert.deepEqual(sanitizeMessages([{ role: "assistant", content: "a" }, { role: "user", content: "b" }]), [{ role: "user", content: "b" }]);
  assert.deepEqual(sanitizeMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]), []);
  assert.equal(sanitizeMessages([{ role: "user", content: "x".repeat(5000) }])[0].content.length, 1200);
});

test("validPhone", () => {
  assert.ok(validPhone("(15) 99999-1234"));
  assert.ok(validPhone("+55 15 3225-3416"));
  assert.ok(!validPhone("1234"));
});

test("agente: loop de ferramenta registra orçamento e devolve ação de WhatsApp", async () => {
  const chamadas = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    chamadas.push(body);
    if (chamadas.length === 1) {
      return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "registrar_orcamento", input: { nome: "Ana", telefone: "(15) 99999-1234", itens: "2 inversoras" } }] }));
    }
    const ultimo = body.messages.at(-1);
    assert.equal(ultimo.content[0].type, "tool_result");
    return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "Pedido registrado!" }] }));
  };
  const r = await executarAgente({ messages: [{ role: "user", content: "quero orçamento" }], env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.equal(r.texto, "Pedido registrado!");
  assert.equal(r.acoes.length, 1);
  assert.match(r.acoes[0].url, /^https:\/\/wa\.me\/551532253416\?text=/);
  assert.equal(chamadas[0].model, "claude-haiku-5-5");
});

test("agente: telefone inválido volta como erro da ferramenta, sem ação", async () => {
  let n = 0;
  const fetchImpl = async (_u, init) => {
    n++;
    if (n === 1) return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "registrar_orcamento", input: { nome: "A", telefone: "12", itens: "x" } }] }));
    const r = JSON.parse(JSON.parse(init.body).messages.at(-1).content[0].content);
    assert.equal(r.ok, false);
    return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "Qual o DDD?" }] }));
  };
  const r = await executarAgente({ messages: [{ role: "user", content: "oi" }], env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
  assert.equal(r.acoes.length, 0);
});

test("assinatura do webhook da Meta", async () => {
  const corpo = '{"a":1}';
  const ok = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  assert.equal(await assinaturaValida(corpo, ok, "segredo"), true);
  assert.equal(await assinaturaValida(corpo, ok.replace(/.$/, "0"), "segredo"), false);
  assert.equal(await assinaturaValida(corpo, ok, ""), false);
});

test("limite por IP", () => {
  for (let i = 0; i < 3; i++) assert.equal(limiteExcedido("t", 3, 1000, 1), false);
  assert.equal(limiteExcedido("t", 3, 1000, 2), true);
});

test("origem: mesma origem passa, estranha não", () => {
  const mk = (o) => new Request("https://loja.com.br/api/chat", { method: "POST", headers: o ? { origin: o } : {} });
  assert.ok(origemPermitida(mk("https://loja.com.br"), {}));
  assert.ok(!origemPermitida(mk("https://evil.com"), {}));
  assert.ok(origemPermitida(mk("https://evil.com"), { ALLOWED_ORIGINS: "https://evil.com" }));
  assert.ok(origemPermitida(mk(null), {}));
});

test("gateway: health, método, JSON inválido e verificação do webhook", async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = "vt";
  const h = await gateway(new Request("https://loja.com.br/api/health"));
  assert.equal((await h.json()).ok, true);
  assert.equal((await gateway(new Request("https://loja.com.br/api/chat"))).status, 405);
  assert.equal((await gateway(new Request("https://loja.com.br/api/chat", { method: "POST", body: "{x" }))).status, 400);
  const v = await gateway(new Request("https://loja.com.br/api/whatsapp?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=123"));
  assert.equal(await v.text(), "123");
  assert.equal((await gateway(new Request("https://loja.com.br/api/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1"))).status, 403);
  assert.equal((await gateway(new Request("https://loja.com.br/api/whatsapp", { method: "POST", body: "{}" }))).status, 401);
});
