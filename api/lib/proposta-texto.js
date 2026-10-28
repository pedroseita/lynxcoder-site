// Texto da proposta, editável no painel (Configurações → Texto da proposta).
// Guardado em /data/config/proposta-texto.md; sem ficheiro usa-se o PADRAO.
// Cada proposta copia o texto no momento em que é criada.
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { DIRS } = require('./common');

const FILE = path.join(DIRS.config, 'proposta-texto.md');
const MAX = 60000;

const PADRAO = `## 1. Visão geral

A LynxCoder cria e mantém a página profissional do seu negócio: rápida no celular, encontrada no Google e pensada para gerar contatos pelo WhatsApp. Você escolhe entre dois planos, que diferem no endereço da página e na forma de cobrança.

Todo o processo é digital: você preenche um formulário online em etapas, aprova uma prévia e a página vai ao ar. Nenhum arquivo precisa ser trocado por mensagem.

## 2. Planos

O Plano Essencial usa um endereço da LynxCoder e não exige nenhuma burocracia; o Plano Profissional usa o seu próprio domínio, registrado em seu nome.

| | Plano Essencial | Plano Profissional |
|---|---|---|
| **Endereço** | seunome.lynxsites.com.br | www.seunome.com.br |
| **Dono do domínio** | LynxCoder | Você (registrado no seu CPF ou CNPJ) |
| **Registro do domínio** | Incluído | Pago por você no Registro.br (cerca de R$ 40/ano) |
| **Taxa de implantação (única)** | **{{essencial_implantacao}}** | **{{profissional_implantacao}}** |
| **Mensalidade** | **{{essencial_mensalidade}}/mês** | **{{profissional_mensalidade}}/mês** |
| **Hospedagem, HTTPS e backups** | Incluídos | Incluídos |
| **Alterações de conteúdo** | Até {{alteracoes_mes}} por mês | Até {{alteracoes_mes}} por mês |
| **Prazo de publicação** | Até {{prazo_publicacao}} dias úteis | Até {{prazo_publicacao}} dias úteis + propagação do DNS |
| **Ideal para** | Começar rápido e com baixo custo | Quem já tem marca e quer o endereço no cartão, uniforme e veículo |

É possível começar no Essencial e migrar para o Profissional depois. O endereço antigo passa a redirecionar automaticamente para o novo, sem perder visitas.

## 3. O que a página inclui

As duas opções incluem a mesma página completa; muda apenas o endereço.

### Conteúdo

- Abertura com o nome do negócio, a especialidade, a cidade e um botão de contato.
- Seção "Sobre" com a sua experiência e os seus diferenciais.
- Lista de serviços com uma descrição curta de cada um.
- Galeria de trabalhos realizados.
- Depoimentos de clientes (opcional).
- Botão flutuante de WhatsApp, formulário de pedido de orçamento e links para as suas redes sociais (Instagram, Facebook, TikTok, YouTube, LinkedIn).

### Técnica

- Página otimizada para o Google: carregamento rápido e conteúdo legível pelos buscadores, com título, descrição e dados do negócio (nome, telefone, cidade e área de atendimento) em formato que o Google reconhece.
- Adaptada a celular, tablet e computador.
- Conexão segura (HTTPS) com certificado renovado automaticamente.
- Backups diários da página e dos dados.

### Privacidade (LGPD)

- Política de privacidade publicada na página.
- Aviso de consentimento no formulário de orçamento.
- Os pedidos de orçamento chegam até você por e-mail ou WhatsApp e não são usados para nenhuma outra finalidade.

Veja um exemplo: [página de demonstração de um eletricista](/exemplos/eletricista).

## 4. Extras e manutenção

A página padrão já resolve o essencial. Os extras abaixo podem ser contratados junto com a página ou a qualquer momento depois, e são cobrados à parte.

### Extras

| Extra | O que inclui | Cobrança | Valor |
|---|---|---|---|
| **Criação de logotipo** | Logotipo simples em vetor, com versões colorida e monocromática | Única | {{extra_logo}} |
| **Textos profissionais** | Redação de todos os textos da página a partir de uma conversa com você | Única | {{extra_textos}} |
| **Cartão de visita digital e QR Code** | Botão "Salvar contato" na página e QR Code em alta resolução para cartões, adesivos, uniforme e veículo | Única | {{extra_cartao}} |
| **Galeria antes e depois** | Fotos de antes e depois lado a lado, para mostrar a diferença do seu trabalho | Única | {{extra_antes_depois}} |
| **Vídeo de apresentação** | Seu vídeo (do YouTube ou gravado no celular) em destaque na página | Única | {{extra_video}} |
| **Perfil da Empresa no Google** | Criação ou otimização do seu perfil no Google Maps e na Busca, ligado à página | Única | {{extra_perfil_google}} |
| **Avaliações do Google na página** | Exibição automática das suas avaliações do Google | Única | {{extra_avaliacoes_google}} |
| **Avaliação dos serviços pelos seus clientes** | Ao terminar um serviço, você envia um link pelo WhatsApp; o cliente dá de 1 a 5 estrelas, comenta e pode enviar uma foto. As avaliações aparecem na página com a nota média | Mensal | {{extra_avaliacao_servicos}}/mês |
| **Feed do Instagram na página** | Suas últimas publicações aparecem automaticamente na página. Exige conta profissional (Comercial ou Criador de conteúdo) no Instagram | Mensal | {{extra_feed_instagram}}/mês |
| **E-mail profissional** | contato@seudominio.com.br configurado no celular (só no Plano Profissional) | Única + custo do provedor | {{extra_email}} |

**Como funciona a avaliação dos serviços:** cada link de avaliação vale para um único serviço e expira em 30 dias, por isso só quem foi atendido consegue avaliar. Antes de aparecerem na página, as avaliações passam por moderação, que remove apenas ofensas, spam e dados pessoais. Críticas legítimas não são apagadas: você pode respondê-las publicamente. Quando a nota é 4 ou 5, o cliente é convidado a repetir a avaliação no Google.

**Precisa de mais?** Agendamento online, catálogo de produtos, loja virtual, várias páginas, blog, área de clientes ou integração com outros sistemas pedem um site completo. A LynxCoder também faz sites para empresas e lojas, com orçamento à parte. Se a sua página crescer, ela pode ser migrada sem perder o endereço.

### Planos de manutenção

A manutenção Básica já vem em qualquer mensalidade. Os planos Plus e Premium são para quem quer a página sempre atualizada sem se preocupar com nada.

| | Básica (incluída) | Plus | Premium |
|---|---|---|---|
| **Hospedagem, HTTPS, backups e segurança** | Sim | Sim | Sim |
| **Alterações de texto e fotos por mês** | Até {{alteracoes_mes}} | Até {{plus_alteracoes}} | Ilimitadas (prazo de 2 dias úteis) |
| **Atualização de promoções e avisos sazonais** | Não | Sim | Sim |
| **Relatório mensal de visitas e contatos** | Não | Sim | Sim |
| **Gestão do Perfil da Empresa no Google (posts e respostas a avaliações)** | Não | Não | Sim |
| **Prazo de atendimento** | Até 5 dias úteis | Até 2 dias úteis | Mesmo dia útil |
| **Valor adicional** | Incluído | **+ {{plus_valor}}/mês** | **+ {{premium_valor}}/mês** |

**Sem mensalidade:** no Plano Profissional, também é possível receber os arquivos da página e hospedá-la por conta própria. Nesse caso paga-se apenas a implantação, e qualquer alteração futura é cobrada por hora, a {{hora_valor}}/hora.

## 5. Formulário digital de início

Depois da contratação, você recebe pelo WhatsApp um link para o formulário online da LynxCoder. Ele leva cerca de 10 minutos, funciona no celular e permite enviar as fotos diretamente da galeria.

1. **Seu negócio:** nome, especialidade, cidade e área de atendimento, WhatsApp, e-mail e redes sociais.
2. **Plano e endereço:** escolha entre Essencial e Profissional e o endereço desejado. No Profissional, informe o domínio já registrado ou o que pretende registrar.
3. **Visual:** envio do logotipo (se tiver) e escolha das cores ou de um estilo pronto.
4. **Serviços:** os principais serviços, com uma descrição curta de cada um.
5. **Fotos e depoimentos:** fotos de trabalhos realizados, uma foto sua (opcional) e frases de clientes (opcional).
6. **Revisão e envio:** resumo de tudo o que você preencheu, aceite dos termos e envio.

Ao enviar, você recebe um e-mail de confirmação com o resumo, e a LynxCoder começa o desenvolvimento. Se faltar alguma informação, entramos em contato pelo WhatsApp.

> **Dica:** fotos nítidas, com boa luz e na horizontal, fazem mais diferença na página do que qualquer outro elemento.

## 6. Domínio próprio: como configurar (só no Plano Profissional)

Você registra o domínio em seu nome e cria dois apontamentos no painel do Registro.br. A LynxCoder envia os valores exatos e pode acompanhar a configuração por chamada de vídeo.

| Tipo | Nome | Valor | Para quê |
|---|---|---|---|
| CNAME | www | lynxsites.com.br | Endereço principal da página |
| A | (em branco) | IP enviado pela LynxCoder | Faz o endereço sem "www" funcionar e redirecionar para o com "www" |

Depois de salvos, os apontamentos levam de alguns minutos a 24 horas para propagar. O certificado de segurança (HTTPS) é emitido automaticamente assim que o domínio passa a apontar para os nossos servidores.

**Importante:** a renovação anual do domínio é sua responsabilidade. Se ele expirar, a página sai do ar e o endereço pode ser registrado por outra pessoa. Ative a renovação automática no Registro.br; a LynxCoder também avisa 30 dias antes do vencimento.

## 7. Etapas e prazos

A página vai ao ar em até {{prazo_publicacao}} dias úteis depois do envio completo do formulário e do pagamento da implantação.

1. **Contratação:** aceite desta proposta e pagamento da taxa de implantação (PIX ou link de pagamento).
2. **Formulário digital:** você preenche e envia (seção 5).
3. **Prévia:** em até {{prazo_previa}} dias úteis, você recebe um link de prévia privado.
4. **Ajustes:** estão incluídas até 2 rodadas de ajustes na prévia. Rodadas extras são orçadas à parte.
5. **Publicação:** a página vai ao ar no endereço escolhido. No Plano Profissional, isso acontece depois da configuração do domínio (seção 6).

O prazo começa a contar apenas quando todas as informações e fotos tiverem sido enviadas.

## 8. Termos

### Propriedade

- Os textos, as fotos e o logotipo enviados por você continuam sendo seus.
- O sistema, o modelo da página e o código pertencem à LynxCoder. Você recebe o direito de uso enquanto a assinatura estiver ativa.
- No Plano Profissional, o domínio é seu desde o primeiro dia.

### Mensalidade

- A mensalidade cobre hospedagem, HTTPS, backups, atualizações de segurança e as alterações de conteúdo incluídas no plano.
- Alterações além do limite mensal, novas seções ou novas funcionalidades são orçadas à parte.
- Em caso de atraso superior a {{atraso_dias}} dias, a página pode ser suspensa até a regularização.

### Cancelamento

- Você pode cancelar a qualquer momento, com aviso de {{aviso_cancelamento}} dias. A taxa de implantação não é reembolsável.
- Ao cancelar, você recebe um pacote com todos os seus textos e fotos.
- No Plano Essencial, o endereço seunome.lynxsites.com.br é desativado.
- No Plano Profissional, o domínio continua sendo seu e pode ser apontado para outro serviço.

### Suporte

- Atendimento por WhatsApp e e-mail em dias úteis, das {{horario_inicio}} às {{horario_fim}}.
- Problemas que tiram a página do ar têm prioridade e são tratados no mesmo dia útil.

## 9. Próximos passos

Para começar, aceite a proposta abaixo escolhendo o plano. Em seguida, você recebe o link de pagamento da implantação e o link do formulário digital.

**LynxCoder:** {{contato}}

Esta proposta é válida até {{validade}}.
`;

async function load() {
  try {
    const t = await fsp.readFile(FILE, 'utf8');
    return { texto: t, padrao: false };
  } catch {
    return { texto: PADRAO, padrao: true };
  }
}

// texto vazio/null volta ao padrão (apaga o ficheiro)
async function save(texto) {
  if (texto == null || !String(texto).trim()) {
    await fsp.rm(FILE, { force: true });
    return { texto: PADRAO, padrao: true };
  }
  const t = String(texto).replace(/\r\n?/g, '\n').slice(0, MAX);
  await fsp.mkdir(DIRS.config, { recursive: true });
  await fsp.writeFile(FILE, t);
  return { texto: t, padrao: false };
}

module.exports = { PADRAO, load, save };
