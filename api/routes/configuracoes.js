// Configurações do painel que não são de um fluxo só: Empresa, Pagamentos e
// Estado do sistema. (Propostas: routes/propostas.js; catálogo: routes/criar.js.)
'use strict';

const QRCode = require('qrcode');
const { HttpError } = require('../lib/common');
const empresa = require('../lib/empresa');
const pix = require('../lib/pix');
const catalogo = require('../lib/catalogo');
const gateway = require('../lib/gateway');
const mail = require('../lib/mail');
const flags = require('../lib/flags');

async function estadoPagamentos() {
  const cat = await catalogo.load();
  const g = gateway.ativo();
  return { pix: await pix.load(), ativos: !!cat.pagamentos_ativos, gateway: g.id, formas: g.formas };
}

module.exports = async function configuracoesRoutes(app) {
  app.get('/adm/empresa', async () => ({ ok: true, campos: empresa.CAMPOS, empresa: await empresa.load() }));
  app.put('/adm/empresa', async (req) => ({ ok: true, empresa: await empresa.save(req.body) }));

  app.get('/adm/pagamentos', async () => ({ ok: true, ...(await estadoPagamentos()) }));

  // PIX e o interruptor dos pagamentos no /criar (que vive no catálogo).
  app.put('/adm/pagamentos', async (req) => {
    const b = req.body || {};
    if (b.pix) await pix.save(b.pix);
    if (typeof b.ativos === 'boolean') {
      if (b.ativos && !(await pix.load()).chave && gateway.ativo().id === 'manual') {
        throw new HttpError(400, 'Configure a chave PIX antes de ligar os pagamentos.');
      }
      const cat = await catalogo.load();
      await catalogo.save({ ...cat, pagamentos_ativos: b.ativos });
      req.log.info({ ativos: b.ativos }, 'pagamentos do /criar alterados no painel');
    }
    return { ok: true, ...(await estadoPagamentos()) };
  });

  // PIX de R$ 1,00 para testar a chave numa app de banco antes de abrir ao público.
  app.post('/adm/pagamentos/teste', async () => {
    const cfg = await pix.load();
    if (!cfg.chave) throw new HttpError(400, 'Configure primeiro a chave PIX.');
    const payload = gateway.pixCopiaECola({ chave: cfg.chave, nome: cfg.nome, cidade: cfg.cidade, valor: 1, txid: 'TESTE' + Date.now().toString(36).toUpperCase() });
    return { ok: true, payload, qr: await QRCode.toDataURL(payload, { margin: 1, width: 260 }) };
  });

  // O que está ligado e o que falta, com onde se resolve.
  app.get('/adm/estado', async () => {
    const emp = await empresa.load();
    const pag = await estadoPagamentos();
    const m = await flags.estado();
    const tsSite = !!process.env.TURNSTILE_SITEKEY, tsSecret = !!process.env.TURNSTILE_SECRET;
    const turnstile = tsSite && tsSecret;
    // Só uma das chaves é o pior caso: o widget aparece mas nada é verificado.
    const tsIncompleto = tsSite !== tsSecret;
    const tsDetalhe = turnstile ? 'Ligado.'
      : tsIncompleto ? 'Incompleto: falta ' + (tsSecret ? 'TURNSTILE_SITEKEY' : 'TURNSTILE_SECRET') + '. O /criar não está a verificar robôs.'
        : 'Desligado: o /criar não verifica robôs. Ligue antes de abrir os pagamentos.';
    return {
      ok: true,
      itens: [
        { id: 'email', ok: mail.enabled, titulo: 'Envio de e-mail (SMTP)', detalhe: mail.enabled ? 'Configurado: avisos, recibos e códigos do painel do cliente saem por e-mail.' : 'Sem SMTP: o painel do cliente não envia códigos e não chegam avisos.', onde: 'infra/onboarding.env na VPS (runbook: "Aviso por e-mail")' },
        { id: 'empresa', ok: !!(emp.nome && emp.documento && emp.endereco), titulo: 'Dados da empresa', detalhe: emp.documento && emp.endereco ? 'Nome, CPF/CNPJ e endereço preenchidos.' : 'Falta o CPF/CNPJ ou o endereço, obrigatórios no rodapé da compra.', link: '#/config' },
        { id: 'pix', ok: !!pag.pix.chave, titulo: 'Chave PIX', detalhe: pag.pix.chave ? 'Configurada (' + pag.pix.nome + ', ' + pag.pix.cidade + ').' : 'Sem chave: a compra e as mensalidades não mostram QR Code.', link: '#/config/pagamentos' },
        { id: 'pagamentos', ok: pag.ativos, aviso: !pag.ativos, titulo: 'Pagamentos no /criar', detalhe: pag.ativos ? 'Ligados: o cliente pode pagar no fim da compra.' : 'Desligados: o /criar mostra "Pagamentos em breve".', link: '#/config/pagamentos' },
        { id: 'gateway', ok: pag.gateway !== 'manual', aviso: pag.gateway === 'manual', titulo: 'Confirmação automática (gateway)', detalhe: pag.gateway === 'manual' ? 'PIX manual: confirma cada pagamento no painel. Asaas preparado, por ligar.' : 'Ligado: ' + pag.gateway + '.', onde: 'GATEWAY e ASAAS_* no infra/onboarding.env' },
        { id: 'turnstile', ok: turnstile, aviso: !turnstile && !tsIncompleto && !pag.ativos, titulo: 'Anti-robô no /criar (Turnstile)', detalhe: tsDetalhe, onde: 'TURNSTILE_SITEKEY e TURNSTILE_SECRET no infra/onboarding.env' },
        { id: 'manutencao', ok: !m.ativo, titulo: 'Site lynxcoder.com.br', detalhe: m.ativo ? 'Em manutenção.' : 'No ar.', link: null },
      ],
    };
  });
};
