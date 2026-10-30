// Funções puras (sem DOM) — cobertas por testes unitários em tests/unit.test.js

export const CONSENT_VERSION = 1;

export function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Telefone brasileiro: DDD + 8 ou 9 dígitos, com ou sem o código do país (55). */
export function isValidBrPhone(value) {
  let digits = onlyDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits.length === 10 || digits.length === 11;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? "").trim());
}

/**
 * Valida o formulário de orçamento.
 * Só exige o necessário: nome, telefone, mensagem e o consentimento (LGPD).
 * O e-mail é opcional, mas se vier preenchido precisa ser válido.
 */
export function validateQuote(data) {
  const errors = {};
  const nome = String(data?.nome ?? "").trim();
  const mensagem = String(data?.mensagem ?? "").trim();
  const email = String(data?.email ?? "").trim();

  if (nome.length < 2) {
    errors.nome = "Informe seu nome.";
  }
  if (!isValidBrPhone(data?.telefone)) {
    errors.telefone = "Informe um telefone válido com DDD, por exemplo (15) 99999-9999.";
  }
  if (email && !isValidEmail(email)) {
    errors.email = "Esse e-mail parece inválido. Confira ou deixe em branco.";
  }
  if (mensagem.length < 5) {
    errors.mensagem = "Conte rapidamente o que você precisa.";
  }
  if (data?.consentimento !== true) {
    errors.consentimento = "Marque a caixa para confirmar que leu a Política de Privacidade.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Monta o link do WhatsApp com a mensagem já preenchida. */
export function buildWhatsAppUrl(number, data) {
  const lines = ["Olá, Espaço Solda! Gostaria de um orçamento."];
  const nome = String(data?.nome ?? "").trim();
  const interesse = String(data?.interesse ?? "").trim();
  const mensagem = String(data?.mensagem ?? "").trim();
  const telefone = String(data?.telefone ?? "").trim();

  if (nome) lines.push(`Nome: ${nome}`);
  if (telefone) lines.push(`Telefone: ${telefone}`);
  if (interesse) lines.push(`Assunto: ${interesse}`);
  if (mensagem) lines.push(`Mensagem: ${mensagem}`);

  return `https://wa.me/${onlyDigits(number)}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/** Lê a escolha de cookies salva. Retorna null se não existir, estiver corrompida ou desatualizada. */
export function parseConsent(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v !== CONSENT_VERSION) return null;
    return {
      analytics: parsed.analytics === true,
      thirdparty: parsed.thirdparty === true,
    };
  } catch {
    return null;
  }
}

export function serializeConsent(choice, now = Date.now()) {
  return JSON.stringify({
    v: CONSENT_VERSION,
    analytics: choice?.analytics === true,
    thirdparty: choice?.thirdparty === true,
    ts: now,
  });
}
