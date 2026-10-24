// Texto da proposta, gerado no servidor só para quem tem um link válido
// (o texto não está no site público). Todos os valores são escapados.
'use strict';

const { dinheiro } = require('./config');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' });

function render(p, cfg) {
  const val = { ...cfg, ...(p.precos || {}) };
  const tbd = '<span class="tbd">a combinar</span>';
  const R = (k) => (dinheiro(val[k]) ? esc(dinheiro(val[k])) : tbd);
  const N = (k) => (String(val[k] || '').trim() ? esc(val[k]) : tbd);
  const T = (k, fallback) => (String(val[k] || '').trim() ? esc(val[k]) : fallback);
  const contato = [
    'lynxcoder.com.br',
    val.whatsapp ? `WhatsApp ${esc(val.whatsapp)}` : '',
    val.email ? esc(val.email) : '',
  ].filter(Boolean).join(' · ');

  return `
<header class="pp-head">
  <p class="pp-kicker">Proposta</p>
  <h1>Página Profissional LynxCoder</h1>
  <p class="pp-meta">Para <strong>${esc(p.cliente.nome)}</strong>${p.cliente.negocio ? ` · ${esc(p.cliente.negocio)}` : ''}<br>
  ${esc(dataBR(p.criadoEm))} · Pedro Seita, LynxCoder</p>
  ${p.mensagem ? `<p class="pp-note">${esc(p.mensagem).replace(/\n/g, '<br>')}</p>` : ''}
</header>

<section>
  <h2>1. Visão geral</h2>
  <p>A LynxCoder cria e mantém a página profissional do seu negócio: rápida no celular, encontrada no Google e pensada para gerar contatos pelo WhatsApp. Você escolhe entre dois planos, que diferem no endereço da página e na forma de cobrança.</p>
  <p>Todo o processo é digital: você preenche um formulário online em etapas, aprova uma prévia e a página vai ao ar. Nenhum arquivo precisa ser trocado por mensagem.</p>
</section>

<section>
  <h2>2. Planos</h2>
  <p>O Plano Essencial usa um endereço da LynxCoder e não exige nenhuma burocracia; o Plano Profissional usa o seu próprio domínio, registrado em seu nome.</p>
  <div class="pp-table"><table>
    <thead><tr><th></th><th>Plano Essencial</th><th>Plano Profissional</th></tr></thead>
    <tbody>
      <tr><th>Endereço</th><td>seunome.lynxcoder.com.br</td><td>www.seunome.com.br</td></tr>
      <tr><th>Dono do domínio</th><td>LynxCoder</td><td>Você (registrado no seu CPF ou CNPJ)</td></tr>
      <tr><th>Registro do domínio</th><td>Incluído</td><td>Pago por você no Registro.br (cerca de R$&nbsp;40/ano)</td></tr>
      <tr class="pp-price"><th>Taxa de implantação (única)</th><td>${R('essencial_implantacao')}</td><td>${R('profissional_implantacao')}</td></tr>
      <tr class="pp-price"><th>Mensalidade</th><td>${R('essencial_mensalidade')}/mês</td><td>${R('profissional_mensalidade')}/mês</td></tr>
      <tr><th>Hospedagem, HTTPS e backups</th><td>Incluídos</td><td>Incluídos</td></tr>
      <tr><th>Alterações de conteúdo</th><td>Até ${N('alteracoes_mes')} por mês</td><td>Até ${N('alteracoes_mes')} por mês</td></tr>
      <tr><th>Prazo de publicação</th><td>Até ${N('prazo_publicacao')} dias úteis</td><td>Até ${N('prazo_publicacao')} dias úteis + propagação do DNS</td></tr>
      <tr><th>Ideal para</th><td>Começar rápido e com baixo custo</td><td>Quem já tem marca e quer o endereço no cartão, uniforme e veículo</td></tr>
    </tbody>
  </table></div>
  <p class="pp-swipe">Deslize a tabela para o lado →</p>
  <p>É possível começar no Essencial e migrar para o Profissional depois. O endereço antigo passa a redirecionar automaticamente para o novo, sem perder visitas.</p>
</section>

<section>
  <h2>3. O que a página inclui</h2>
  <p>As duas opções incluem a mesma página completa; muda apenas o endereço.</p>
  <h3>Conteúdo</h3>
  <ul>
    <li>Abertura com o nome do negócio, a especialidade, a cidade e um botão de contato.</li>
    <li>Seção "Sobre" com a sua experiência e os seus diferenciais.</li>
    <li>Lista de serviços com uma descrição curta de cada um.</li>
    <li>Galeria de trabalhos realizados.</li>
    <li>Depoimentos de clientes (opcional).</li>
    <li>Botão flutuante de WhatsApp, formulário de pedido de orçamento e links para as suas redes sociais (Instagram, Facebook, TikTok, YouTube, LinkedIn).</li>
  </ul>
  <h3>Técnica</h3>
  <ul>
    <li>Página otimizada para o Google: carregamento rápido e conteúdo legível pelos buscadores, com título, descrição e dados do negócio (nome, telefone, cidade e área de atendimento) em formato que o Google reconhece.</li>
    <li>Adaptada a celular, tablet e computador.</li>
    <li>Conexão segura (HTTPS) com certificado renovado automaticamente.</li>
    <li>Backups diários da página e dos dados.</li>
  </ul>
  <h3>Privacidade (LGPD)</h3>
  <ul>
    <li>Política de privacidade publicada na página.</li>
    <li>Aviso de consentimento no formulário de orçamento.</li>
    <li>Os pedidos de orçamento chegam até você por e-mail ou WhatsApp e não são usados para nenhuma outra finalidade.</li>
  </ul>
  <p class="pp-example">Veja um exemplo: <a href="/exemplos/eletricista" target="_blank" rel="noopener">página de demonstração de um eletricista</a>.</p>
</section>

<section>
  <h2>4. Extras e manutenção</h2>
  <p>A página padrão já resolve o essencial. Os extras abaixo podem ser contratados junto com a página ou a qualquer momento depois, e são cobrados à parte.</p>
  <h3>Extras</h3>
  <div class="pp-table"><table>
    <thead><tr><th>Extra</th><th>O que inclui</th><th>Cobrança</th><th>Valor</th></tr></thead>
    <tbody>
      <tr><th>Criação de logotipo</th><td>Logotipo simples em vetor, com versões colorida e monocromática</td><td>Única</td><td>${R('extra_logo')}</td></tr>
      <tr><th>Textos profissionais</th><td>Redação de todos os textos da página a partir de uma conversa com você</td><td>Única</td><td>${R('extra_textos')}</td></tr>
      <tr><th>Cartão de visita digital e QR Code</th><td>Botão "Salvar contato" na página e QR Code em alta resolução para cartões, adesivos, uniforme e veículo</td><td>Única</td><td>${R('extra_cartao')}</td></tr>
      <tr><th>Galeria antes e depois</th><td>Fotos de antes e depois lado a lado, para mostrar a diferença do seu trabalho</td><td>Única</td><td>${R('extra_antes_depois')}</td></tr>
      <tr><th>Vídeo de apresentação</th><td>Seu vídeo (do YouTube ou gravado no celular) em destaque na página</td><td>Única</td><td>${R('extra_video')}</td></tr>
      <tr><th>Perfil da Empresa no Google</th><td>Criação ou otimização do seu perfil no Google Maps e na Busca, ligado à página</td><td>Única</td><td>${R('extra_perfil_google')}</td></tr>
      <tr><th>Avaliações do Google na página</th><td>Exibição automática das suas avaliações do Google</td><td>Única</td><td>${R('extra_avaliacoes_google')}</td></tr>
      <tr><th>Avaliação dos serviços pelos seus clientes</th><td>Ao terminar um serviço, você envia um link pelo WhatsApp; o cliente dá de 1 a 5 estrelas, comenta e pode enviar uma foto. As avaliações aparecem na página com a nota média</td><td>Mensal</td><td>${R('extra_avaliacao_servicos')}/mês</td></tr>
      <tr><th>Feed do Instagram na página</th><td>Suas últimas publicações aparecem automaticamente na página. Exige conta profissional (Comercial ou Criador de conteúdo) no Instagram</td><td>Mensal</td><td>${R('extra_feed_instagram')}/mês</td></tr>
      <tr><th>E-mail profissional</th><td>contato@seudominio.com.br configurado no celular (só no Plano Profissional)</td><td>Única + custo do provedor</td><td>${R('extra_email')}</td></tr>
    </tbody>
  </table></div>
  <p class="pp-swipe">Deslize a tabela para o lado →</p>
  <p><strong>Como funciona a avaliação dos serviços:</strong> cada link de avaliação vale para um único serviço e expira em 30 dias, por isso só quem foi atendido consegue avaliar. Antes de aparecerem na página, as avaliações passam por moderação, que remove apenas ofensas, spam e dados pessoais. Críticas legítimas não são apagadas: você pode respondê-las publicamente. Quando a nota é 4 ou 5, o cliente é convidado a repetir a avaliação no Google.</p>
  <p><strong>Precisa de mais?</strong> Agendamento online, catálogo de produtos, loja virtual, várias páginas, blog, área de clientes ou integração com outros sistemas pedem um site completo. A LynxCoder também faz sites para empresas e lojas, com orçamento à parte. Se a sua página crescer, ela pode ser migrada sem perder o endereço.</p>

  <h3>Planos de manutenção</h3>
  <p>A manutenção Básica já vem em qualquer mensalidade. Os planos Plus e Premium são para quem quer a página sempre atualizada sem se preocupar com nada.</p>
  <div class="pp-table"><table>
    <thead><tr><th></th><th>Básica (incluída)</th><th>Plus</th><th>Premium</th></tr></thead>
    <tbody>
      <tr><th>Hospedagem, HTTPS, backups e segurança</th><td>Sim</td><td>Sim</td><td>Sim</td></tr>
      <tr><th>Alterações de texto e fotos por mês</th><td>Até ${N('alteracoes_mes')}</td><td>Até ${N('plus_alteracoes')}</td><td>Ilimitadas (prazo de 2 dias úteis)</td></tr>
      <tr><th>Atualização de promoções e avisos sazonais</th><td>Não</td><td>Sim</td><td>Sim</td></tr>
      <tr><th>Relatório mensal de visitas e contatos</th><td>Não</td><td>Sim</td><td>Sim</td></tr>
      <tr><th>Gestão do Perfil da Empresa no Google (posts e respostas a avaliações)</th><td>Não</td><td>Não</td><td>Sim</td></tr>
      <tr><th>Prazo de atendimento</th><td>Até 5 dias úteis</td><td>Até 2 dias úteis</td><td>Mesmo dia útil</td></tr>
      <tr class="pp-price"><th>Valor adicional</th><td>Incluído</td><td>+ ${R('plus_valor')}/mês</td><td>+ ${R('premium_valor')}/mês</td></tr>
    </tbody>
  </table></div>
  <p class="pp-swipe">Deslize a tabela para o lado →</p>
  <p><strong>Sem mensalidade:</strong> no Plano Profissional, também é possível receber os arquivos da página e hospedá-la por conta própria. Nesse caso paga-se apenas a implantação, e qualquer alteração futura é cobrada por hora, a ${R('hora_valor')}/hora.</p>
</section>

<section>
  <h2>5. Formulário digital de início</h2>
  <p>Depois da contratação, você recebe pelo WhatsApp um link para o formulário online da LynxCoder. Ele leva cerca de 10 minutos, funciona no celular e permite enviar as fotos diretamente da galeria.</p>
  <ol>
    <li><strong>Seu negócio:</strong> nome, especialidade, cidade e área de atendimento, WhatsApp, e-mail e redes sociais.</li>
    <li><strong>Plano e endereço:</strong> escolha entre Essencial e Profissional e o endereço desejado. No Profissional, informe o domínio já registrado ou o que pretende registrar.</li>
    <li><strong>Visual:</strong> envio do logotipo (se tiver) e escolha das cores ou de um estilo pronto.</li>
    <li><strong>Serviços:</strong> os principais serviços, com uma descrição curta de cada um.</li>
    <li><strong>Fotos e depoimentos:</strong> fotos de trabalhos realizados, uma foto sua (opcional) e frases de clientes (opcional).</li>
    <li><strong>Revisão e envio:</strong> resumo de tudo o que você preencheu, aceite dos termos e envio.</li>
  </ol>
  <p>Ao enviar, você recebe um e-mail de confirmação com o resumo, e a LynxCoder começa o desenvolvimento. Se faltar alguma informação, entramos em contato pelo WhatsApp.</p>
  <p class="pp-tip"><strong>Dica:</strong> fotos nítidas, com boa luz e na horizontal, fazem mais diferença na página do que qualquer outro elemento.</p>
</section>

<section>
  <h2>6. Domínio próprio: como configurar (só no Plano Profissional)</h2>
  <p>Você registra o domínio em seu nome e cria dois apontamentos no painel do Registro.br. A LynxCoder envia os valores exatos e pode acompanhar a configuração por chamada de vídeo.</p>
  <div class="pp-table"><table>
    <thead><tr><th>Tipo</th><th>Nome</th><th>Valor</th><th>Para quê</th></tr></thead>
    <tbody>
      <tr><td>CNAME</td><td>www</td><td>sites.lynxcoder.com.br</td><td>Endereço principal da página</td></tr>
      <tr><td>A</td><td>(em branco)</td><td>IP enviado pela LynxCoder</td><td>Faz o endereço sem "www" funcionar e redirecionar para o com "www"</td></tr>
    </tbody>
  </table></div>
  <p class="pp-swipe">Deslize a tabela para o lado →</p>
  <p>Depois de salvos, os apontamentos levam de alguns minutos a 24 horas para propagar. O certificado de segurança (HTTPS) é emitido automaticamente assim que o domínio passa a apontar para os nossos servidores.</p>
  <p><strong>Importante:</strong> a renovação anual do domínio é sua responsabilidade. Se ele expirar, a página sai do ar e o endereço pode ser registrado por outra pessoa. Ative a renovação automática no Registro.br; a LynxCoder também avisa 30 dias antes do vencimento.</p>
</section>

<section>
  <h2>7. Etapas e prazos</h2>
  <p>A página vai ao ar em até ${N('prazo_publicacao')} dias úteis depois do envio completo do formulário e do pagamento da implantação.</p>
  <ol>
    <li><strong>Contratação:</strong> aceite desta proposta e pagamento da taxa de implantação (PIX ou link de pagamento).</li>
    <li><strong>Formulário digital:</strong> você preenche e envia (seção 5).</li>
    <li><strong>Prévia:</strong> em até ${N('prazo_previa')} dias úteis, você recebe um link de prévia privado.</li>
    <li><strong>Ajustes:</strong> estão incluídas até 2 rodadas de ajustes na prévia. Rodadas extras são orçadas à parte.</li>
    <li><strong>Publicação:</strong> a página vai ao ar no endereço escolhido. No Plano Profissional, isso acontece depois da configuração do domínio (seção 6).</li>
  </ol>
  <p>O prazo começa a contar apenas quando todas as informações e fotos tiverem sido enviadas.</p>
</section>

<section>
  <h2>8. Termos</h2>
  <h3>Propriedade</h3>
  <ul>
    <li>Os textos, as fotos e o logotipo enviados por você continuam sendo seus.</li>
    <li>O sistema, o modelo da página e o código pertencem à LynxCoder. Você recebe o direito de uso enquanto a assinatura estiver ativa.</li>
    <li>No Plano Profissional, o domínio é seu desde o primeiro dia.</li>
  </ul>
  <h3>Mensalidade</h3>
  <ul>
    <li>A mensalidade cobre hospedagem, HTTPS, backups, atualizações de segurança e as alterações de conteúdo incluídas no plano.</li>
    <li>Alterações além do limite mensal, novas seções ou novas funcionalidades são orçadas à parte.</li>
    <li>Em caso de atraso superior a ${N('atraso_dias')} dias, a página pode ser suspensa até a regularização.</li>
  </ul>
  <h3>Cancelamento</h3>
  <ul>
    <li>Você pode cancelar a qualquer momento, com aviso de ${N('aviso_cancelamento')} dias. A taxa de implantação não é reembolsável.</li>
    <li>Ao cancelar, você recebe um pacote com todos os seus textos e fotos.</li>
    <li>No Plano Essencial, o endereço seunome.lynxcoder.com.br é desativado.</li>
    <li>No Plano Profissional, o domínio continua sendo seu e pode ser apontado para outro serviço.</li>
  </ul>
  <h3>Suporte</h3>
  <ul>
    <li>Atendimento por WhatsApp e e-mail em dias úteis, das ${T('horario_inicio', tbd)} às ${T('horario_fim', tbd)}.</li>
    <li>Problemas que tiram a página do ar têm prioridade e são tratados no mesmo dia útil.</li>
  </ul>
</section>

<section>
  <h2>9. Próximos passos</h2>
  <p>Para começar, aceite a proposta abaixo escolhendo o plano. Em seguida, você recebe o link de pagamento da implantação e o link do formulário digital.</p>
  <p class="pp-contact">LynxCoder: ${contato}</p>
  <p class="pp-valid">Esta proposta é válida até ${esc(dataBR(p.expiraEm))}.</p>
</section>`;
}

module.exports = { render };
