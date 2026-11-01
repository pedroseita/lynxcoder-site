// Cobrança da compra direta (/criar). Dois modos, escolhidos por ambiente:
//
//   manual (padrão)  PIX para a chave da LynxCoder (PIX_CHAVE, PIX_NOME,
//                    PIX_CIDADE), com QR Code e "copia e cola" gerados aqui.
//                    O pagamento é confirmado à mão no painel.
//   asaas            PREPARADO, ainda não ligado: GATEWAY=asaas + ASAAS_API_KEY
//                    + ASAAS_WEBHOOK_TOKEN (+ ASAAS_SANDBOX=1 para testes).
//                    Cartão pela página de pagamento do próprio Asaas: os dados
//                    do cartão nunca passam por este servidor.
//
// Trocar de gateway = escrever outro objeto com a mesma forma (criarCobranca,
// validarWebhook, consultar) e escolhê-lo em `ativo()`.
'use strict';

const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { HttpError } = require('./common');

// ---------- PIX estático (BR Code / EMV do Banco Central) ----------

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .-]/g, '').trim();
const campo = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;

function crc16(s) {
  let crc = 0xffff;
  for (const byte of Buffer.from(s, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixCopiaECola({ chave, nome, cidade, valor, txid }) {
  const corpo = [
    campo('00', '01'),
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave)),
    campo('52', '0000'),
    campo('53', '986'),
    campo('54', valor.toFixed(2)),
    campo('58', 'BR'),
    campo('59', semAcento(nome).slice(0, 25) || 'LYNXCODER'),
    campo('60', semAcento(cidade).slice(0, 15) || 'BRASIL'),
    campo('62', campo('05', String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')),
  ].join('') + '6304';
  return corpo + crc16(corpo);
}

const manual = {
  id: 'manual',
  formas: ['pix'],
  async criarCobranca({ compra, total }) {
    const chave = (process.env.PIX_CHAVE || '').trim();
    if (!chave) return { modo: 'manual', pix: null };
    const payload = pixCopiaECola({
      chave,
      nome: process.env.PIX_NOME || 'LynxCoder',
      cidade: process.env.PIX_CIDADE || 'Brasil',
      valor: total,
      txid: compra.id.replace(/-/g, ''),
    });
    return { modo: 'manual', pix: { payload, qr: await QRCode.toDataURL(payload, { margin: 1, width: 320 }) } };
  },
  validarWebhook() { throw new HttpError(404, 'Não encontrado.'); },
  async consultar() { return null; },
};

// ---------- Asaas (preparado) ----------

const asaasBase = () => (process.env.ASAAS_SANDBOX === '1' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');

async function asaasFetch(method, url, body) {
  const res = await fetch(asaasBase() + url, {
    method,
    headers: { 'content-type': 'application/json', access_token: process.env.ASAAS_API_KEY, 'user-agent': 'lynxcoder-criar' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.errors && data.errors[0] && data.errors[0].description;
    throw new HttpError(502, msg ? `Pagamento: ${msg}` : 'O serviço de pagamento não respondeu. Tente de novo.');
  }
  return data;
}

const asaas = {
  id: 'asaas',
  formas: ['pix', 'cartao'],
  async criarCobranca({ compra, total, forma, nome, documento }) {
    const n = compra.negocio;
    const cliente = await asaasFetch('POST', '/customers', {
      name: nome, cpfCnpj: documento, email: n.email, mobilePhone: n.whatsapp, externalReference: compra.id,
    });
    const vencimento = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const pagamento = await asaasFetch('POST', '/payments', {
      customer: cliente.id,
      billingType: forma === 'cartao' ? 'CREDIT_CARD' : 'PIX',
      value: total,
      dueDate: vencimento,
      description: `Página ${compra.subdominio}.lynxsites.com.br`,
      externalReference: compra.id,
    });
    const out = { modo: 'gateway', gateway: 'asaas', pagamentoId: pagamento.id, url: pagamento.invoiceUrl || null, pix: null };
    if (forma !== 'cartao') {
      const qr = await asaasFetch('GET', `/payments/${encodeURIComponent(pagamento.id)}/pixQrCode`);
      out.pix = { payload: qr.payload, qr: qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null };
    }
    return out;
  },
  // O Asaas manda o token configurado no webhook no cabeçalho asaas-access-token.
  validarWebhook(req) {
    const esperado = process.env.ASAAS_WEBHOOK_TOKEN || '';
    const recebido = String(req.headers['asaas-access-token'] || '');
    const a = crypto.createHash('sha256').update(esperado).digest();
    const b = crypto.createHash('sha256').update(recebido).digest();
    if (!esperado || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Assinatura inválida.');
    const body = req.body || {};
    const p = body.payment || {};
    return { evento: String(body.id || `${body.event}:${p.id}`), tipo: String(body.event || ''), pagamentoId: String(p.id || ''), compraId: String(p.externalReference || '') };
  },
  // Nunca confiar só no corpo do webhook: perguntar ao Asaas pelo ID.
  async consultar(pagamentoId) {
    const p = await asaasFetch('GET', `/payments/${encodeURIComponent(pagamentoId)}`);
    return { pago: ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(p.status), valor: Number(p.value), compraId: p.externalReference || '', status: p.status };
  },
};

function ativo() {
  if (process.env.GATEWAY === 'asaas' && process.env.ASAAS_API_KEY) return asaas;
  return manual;
}

module.exports = { ativo, pixCopiaECola, crc16 };
