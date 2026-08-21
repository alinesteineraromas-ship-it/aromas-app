let listaPedidos = [];
let listaContasReceberPedidos = [];
let itensPedidoAtual = [];
let itensRemovidosIds = [];

function alternarAbaPedidos(aba) {
  document.getElementById('aba-pedidos-kanban').style.display = aba === 'kanban' ? 'block' : 'none';
  document.getElementById('aba-pedidos-lista').style.display = aba === 'lista' ? 'block' : 'none';
  document.getElementById('aba-pedidos-estatisticas').style.display = aba === 'estatisticas' ? 'block' : 'none';
  document.querySelectorAll('#pagina-pedidos .sub-aba').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
  if (aba === 'estatisticas') renderizarEstatisticasPedidos();
  if (aba === 'kanban') renderizarKanbanClientes();
}

async function carregarPedidos() {
  mostrarCarregando('tabela-pedidos', 8);

  const [{ data: pedidos, error: erroPedidos }, { data: contas, error: erroContas }] = await Promise.all([
    supabaseClient.from('pedidos')
      .select('*, clientes(nome, telefone, email), pedido_itens(id, produto_id, quantidade, valor_unitario, produtos(nome, categoria_id, categorias(nome)))')
      .order('data', { ascending: false }),
    supabaseClient.from('contas_receber').select('*')
  ]);

  if (erroPedidos || erroContas) { mostrarToast(traduzErroBanco(erroPedidos || erroContas), 'erro'); return; }

  listaPedidos = pedidos;
  listaContasReceberPedidos = contas;
  renderizarPedidos();
  atualizarKpisPedidos();
  renderizarKanbanClientes();
  popularSelectRelatorioCliente();
}

function contaDoPedido(pedidoId) {
  return listaContasReceberPedidos.find(c => c.pedido_id === pedidoId);
}

function rotuloStatusConta(status) {
  if (status === 'pago') return { texto: 'Pago', classe: 'ativo' };
  if (status === 'parcial') return { texto: 'Parcial', classe: 'inativo' };
  return { texto: 'Em aberto', classe: 'inativo' };
}

function renderizarPedidos() {
  const tbody = document.getElementById('tabela-pedidos');
  const vazio = document.getElementById('vazio-pedidos');
  tbody.innerHTML = '';
  vazio.style.display = listaPedidos.length === 0 ? 'block' : 'none';

  listaPedidos.forEach(p => {
    const tr = document.createElement('tr');
    const dataFmt = new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR');
    const conta = contaDoPedido(p.id);
    const status = conta ? conta.status : 'aberto';
    const rotulo = rotuloStatusConta(status);
    const valorPago = conta ? Number(conta.valor_pago || 0) : 0;
    const qtdItens = (p.pedido_itens || []).length;

    tr.innerHTML = `
      <td>#${p.numero ?? '—'}</td>
      <td><strong>${p.clientes ? p.clientes.nome : '—'}</strong></td>
      <td>${dataFmt}</td>
      <td>${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'}</td>
      <td>${formatarMoeda(p.valor_total)}</td>
      <td>${formatarMoeda(valorPago)}</td>
      <td>
        <span class="selo ${status === 'parcial' ? 'parcial' : rotulo.classe}">${rotulo.texto}</span>
        ${p.fechado ? '<div style="font-size:10px; color:var(--texto-suave); margin-top:3px;">🔒 Fechado</div>' : ''}
      </td>
      <td><div class="acoes-linha">
        ${p.fechado
          ? `<button onclick="gerarRelatorioPedido('${p.id}')">Relatório</button>`
          : `<button onclick="abrirEdicaoPedido('${p.id}')">Editar</button>
             <button onclick="fecharPedido('${p.id}')">Fechar</button>
             <button onclick="gerarRelatorioPedido('${p.id}')">Relatório</button>
             <button onclick="excluirPedido('${p.id}')">Excluir</button>`
        }
      </div></td>
    `;
    tbody.appendChild(tr);
  });
}

function atualizarKpisPedidos() {
  let pagos = 0, aberto = 0, totalNegociado = 0, qtdProdutos = 0;
  const contagemProdutos = {};

  listaPedidos.forEach(p => {
    const conta = contaDoPedido(p.id);
    const valorPago = conta ? Number(conta.valor_pago || 0) : 0;
    const valorDevido = conta ? Number(conta.valor) : Number(p.valor_total);
    pagos += valorPago;
    aberto += Math.max(valorDevido - valorPago, 0);
    totalNegociado += Number(p.valor_total);

    (p.pedido_itens || []).forEach(item => {
      const nome = item.produtos ? item.produtos.nome : 'Produto removido';
      qtdProdutos += Number(item.quantidade);
      contagemProdutos[nome] = (contagemProdutos[nome] || 0) + Number(item.quantidade);
    });
  });

  document.getElementById('kpi-pedidos-pagos').textContent = formatarMoeda(pagos);
  document.getElementById('kpi-pedidos-aberto').textContent = formatarMoeda(aberto);
  document.getElementById('kpi-pedidos-qtd-produtos').textContent = qtdProdutos;

  const top3 = Object.entries(contagemProdutos).sort((a, b) => b[1] - a[1]).slice(0, 3);
  document.getElementById('kpi-pedidos-top3').innerHTML = top3.length
    ? top3.map(([nome, qtd], i) => `${i + 1}º ${nome} <span style="color:var(--texto-suave);">(${qtd}x)</span>`).join('<br>')
    : '—';

  renderizarGraficoPagoNegociado(pagos, totalNegociado);
}

function renderizarGraficoPagoNegociado(pago, totalNegociado) {
  const container = document.getElementById('grafico-pago-negociado');
  if (totalNegociado <= 0) {
    container.innerHTML = '<div style="color:var(--texto-suave); font-size:13px;">Sem registros ainda.</div>';
    return;
  }
  const percentualPago = Math.min((pago / totalNegociado) * 100, 100);
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--texto-suave); margin-bottom:6px;">
      <span>Pago: <strong style="color:var(--verde-oliva-escuro);">${formatarMoeda(pago)}</strong></span>
      <span>Total negociado: <strong style="color:var(--texto-principal);">${formatarMoeda(totalNegociado)}</strong></span>
    </div>
    <div style="width:100%; height:14px; background:var(--marrom-claro); border-radius:20px; overflow:hidden;">
      <div style="width:${percentualPago}%; height:100%; background:var(--verde-oliva); border-radius:20px;"></div>
    </div>
    <div style="text-align:right; font-size:11px; color:var(--texto-suave); margin-top:4px;">${percentualPago.toFixed(1)}% pago</div>
  `;
}

// ---- Kanban por cliente ----
function renderizarKanbanClientes() {
  const grade = document.getElementById('grade-kanban-clientes');
  const vazio = document.getElementById('vazio-kanban');
  const termo = (document.getElementById('busca-kanban-cliente').value || '').toLowerCase();

  const porCliente = {};
  listaPedidos.forEach(p => {
    const clienteId = p.cliente_id;
    const nome = p.clientes ? p.clientes.nome : '—';
    if (!porCliente[clienteId]) porCliente[clienteId] = { nome, aberto: 0, total: 0, qtdPedidos: 0 };
    const conta = contaDoPedido(p.id);
    const valorPago = conta ? Number(conta.valor_pago || 0) : 0;
    const valorDevido = conta ? Number(conta.valor) : Number(p.valor_total);
    porCliente[clienteId].aberto += Math.max(valorDevido - valorPago, 0);
    porCliente[clienteId].total += Number(p.valor_total);
    porCliente[clienteId].qtdPedidos += 1;
  });

  const entradas = Object.entries(porCliente)
    .filter(([, d]) => d.nome.toLowerCase().includes(termo))
    .sort((a, b) => b[1].aberto - a[1].aberto);

  vazio.style.display = entradas.length === 0 ? 'block' : 'none';
  grade.innerHTML = entradas.map(([clienteId, d]) => `
    <div class="painel" style="padding:16px; cursor:pointer; transition:box-shadow 0.15s;" onclick="abrirDetalheCliente('${clienteId}')" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='var(--sombra)'">
      <div style="font-weight:600; margin-bottom:8px;">${d.nome}</div>
      <div style="font-size:11px; color:var(--texto-suave);">Em aberto</div>
      <div style="font-size:18px; color:${d.aberto > 0 ? 'var(--erro)' : 'var(--verde-oliva-escuro)'};">${formatarMoeda(d.aberto)}</div>
      <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:10px; border-top:1px solid var(--borda); font-size:11px; color:var(--texto-suave);">
        <span>Total gasto: ${formatarMoeda(d.total)}</span>
        <span>${d.qtdPedidos} registro${d.qtdPedidos === 1 ? '' : 's'}</span>
      </div>
    </div>
  `).join('');
}

document.getElementById('busca-kanban-cliente').addEventListener('input', renderizarKanbanClientes);

function abrirDetalheCliente(clienteId) {
  const pedidosCliente = listaPedidos.filter(p => p.cliente_id === clienteId);
  if (pedidosCliente.length === 0) return;
  const nome = pedidosCliente[0].clientes ? pedidosCliente[0].clientes.nome : '—';

  let aberto = 0, total = 0, qtdProdutos = 0;
  pedidosCliente.forEach(p => {
    const conta = contaDoPedido(p.id);
    const valorPago = conta ? Number(conta.valor_pago || 0) : 0;
    const valorDevido = conta ? Number(conta.valor) : Number(p.valor_total);
    aberto += Math.max(valorDevido - valorPago, 0);
    total += Number(p.valor_total);
    (p.pedido_itens || []).forEach(item => { qtdProdutos += Number(item.quantidade); });
  });

  document.getElementById('detalhe-cliente-nome').textContent = nome;
  document.getElementById('detalhe-cliente-aberto').textContent = formatarMoeda(aberto);
  document.getElementById('detalhe-cliente-total').textContent = formatarMoeda(total);
  document.getElementById('detalhe-cliente-produtos').textContent = qtdProdutos;

  const tbody = document.getElementById('detalhe-cliente-pedidos');
  tbody.innerHTML = pedidosCliente
    .sort((a, b) => b.data.localeCompare(a.data))
    .map(p => {
      const conta = contaDoPedido(p.id);
      const status = conta ? conta.status : 'aberto';
      const rotulo = rotuloStatusConta(status);
      const valorPago = conta ? Number(conta.valor_pago || 0) : 0;
      const dataFmt = new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR');
      return `<tr>
        <td>#${p.numero ?? '—'}</td>
        <td>${dataFmt}</td>
        <td>${formatarMoeda(p.valor_total)}</td>
        <td>${formatarMoeda(valorPago)}</td>
        <td><span class="selo ${status === 'parcial' ? 'parcial' : rotulo.classe}">${rotulo.texto}</span></td>
        <td><div class="acoes-linha">
          ${p.fechado
            ? `<button onclick="gerarRelatorioPedido('${p.id}')">Relatório</button>`
            : `<button onclick="document.getElementById('modal-cliente-detalhe').classList.remove('ativo'); abrirEdicaoPedido('${p.id}')">Editar</button>`
          }
        </div></td>
      </tr>`;
    }).join('');

  document.getElementById('modal-cliente-detalhe').classList.add('ativo');
}

// ---- Estatísticas (cliente / produto / categoria) ----
function renderizarEstatisticasPedidos() {
  const porCliente = {}, porProduto = {}, porCategoria = {};

  listaPedidos.forEach(p => {
    const nomeCliente = p.clientes ? p.clientes.nome : '—';
    porCliente[nomeCliente] = porCliente[nomeCliente] || { pedidos: 0, total: 0 };
    porCliente[nomeCliente].pedidos += 1;
    porCliente[nomeCliente].total += Number(p.valor_total);

    (p.pedido_itens || []).forEach(item => {
      const nomeProduto = item.produtos ? item.produtos.nome : 'Produto removido';
      const receita = Number(item.quantidade) * Number(item.valor_unitario);
      porProduto[nomeProduto] = porProduto[nomeProduto] || { qtd: 0, receita: 0 };
      porProduto[nomeProduto].qtd += Number(item.quantidade);
      porProduto[nomeProduto].receita += receita;

      const nomeCategoria = item.produtos && item.produtos.categorias ? item.produtos.categorias.nome : 'Sem categoria';
      porCategoria[nomeCategoria] = porCategoria[nomeCategoria] || { qtd: 0, receita: 0 };
      porCategoria[nomeCategoria].qtd += Number(item.quantidade);
      porCategoria[nomeCategoria].receita += receita;
    });
  });

  preencherTabelaStats('stats-por-cliente', Object.entries(porCliente).sort((a, b) => b[1].total - a[1].total),
    (nome, d) => `<td>${nome}</td><td>${d.pedidos}</td><td>${formatarMoeda(d.total)}</td>`);

  preencherTabelaStats('stats-por-produto', Object.entries(porProduto).sort((a, b) => b[1].qtd - a[1].qtd),
    (nome, d) => `<td>${nome}</td><td>${d.qtd}</td><td>${formatarMoeda(d.receita)}</td>`);

  preencherTabelaStats('stats-por-categoria', Object.entries(porCategoria).sort((a, b) => b[1].qtd - a[1].qtd),
    (nome, d) => `<td>${nome}</td><td>${d.qtd}</td><td>${formatarMoeda(d.receita)}</td>`);
}

function preencherTabelaStats(idTbody, entradas, montarLinha) {
  const tbody = document.getElementById(idTbody);
  tbody.innerHTML = entradas.length
    ? entradas.map(([nome, d]) => `<tr>${montarLinha(nome, d)}</tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center; color:var(--texto-suave); padding:16px;">Sem dados</td></tr>';
}

// ---- Novo / editar ----
document.getElementById('btn-novo-pedido').addEventListener('click', () => {
  document.getElementById('form-pedido').reset();
  document.getElementById('pedido-id').value = '';
  document.getElementById('pedido-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('pedido-antecipado').value = 0;
  document.getElementById('pedido-desconto').value = 0;
  document.getElementById('pedido-frete').value = 0;
  document.getElementById('pedido-numero-info').textContent = '';
  document.getElementById('pedido-contato-cliente').textContent = '';
  document.getElementById('modal-pedido-titulo').textContent = 'Novo Controle Individual';
  document.querySelector('#form-pedido button[type="submit"]').style.display = 'inline-block';
  popularSelectClientes('pedido-cliente', false);
  itensPedidoAtual = [];
  itensRemovidosIds = [];
  adicionarLinhaItem();
  document.getElementById('modal-pedido').classList.add('ativo');
});

function mostrarContatoCliente() {
  const id = document.getElementById('pedido-cliente').value;
  const c = listaClientes.find(x => x.id === id);
  const el = document.getElementById('pedido-contato-cliente');
  el.textContent = c ? [c.telefone, c.email].filter(Boolean).join(' · ') : '';
}

async function abrirEdicaoPedido(id) {
  const { data: pedido, error } = await supabaseClient
    .from('pedidos').select('*, pedido_itens(*)').eq('id', id).single();
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }

  if (pedido.fechado) { mostrarToast('Este Controle Individual está fechado e não pode ser editado.', 'erro'); return; }

  document.getElementById('form-pedido').reset();
  document.getElementById('pedido-id').value = pedido.id;
  document.getElementById('pedido-data').value = pedido.data;
  document.getElementById('pedido-antecipado').value = pedido.valor_antecipado || 0;
  document.getElementById('pedido-desconto').value = pedido.desconto || 0;
  document.getElementById('pedido-frete').value = pedido.frete || 0;
  document.getElementById('pedido-observacao').value = pedido.observacao || '';
  document.getElementById('pedido-forma-pagamento').value = pedido.forma_pagamento || '';
  document.getElementById('pedido-numero-info').textContent = `Registro nº ${pedido.numero} deste cliente`;
  document.getElementById('modal-pedido-titulo').textContent = 'Editar Controle Individual';
  popularSelectClientes('pedido-cliente', false);
  document.getElementById('pedido-cliente').value = pedido.cliente_id;
  mostrarContatoCliente();

  itensPedidoAtual = (pedido.pedido_itens || []).map(i => ({
    id: i.id, produto_id: i.produto_id, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario),
    embrulhado: i.embrulhado, embrulhado_em: i.embrulhado_em,
    enviado: i.enviado, enviado_em: i.enviado_em,
    pago: i.pago, pago_em: i.pago_em, valor_pago: Number(i.valor_pago) || 0
  }));
  itensRemovidosIds = [];
  if (itensPedidoAtual.length === 0) adicionarLinhaItem();
  renderizarItensPedido();
  document.getElementById('modal-pedido').classList.add('ativo');
}

async function fecharPedido(id) {
  if (!(await confirmarAcao('Fechar este Controle Individual? Depois de fechado ele não poderá mais ser alterado.', 'Fechar'))) return;
  const { error } = await supabaseClient.from('pedidos').update({ fechado: true }).eq('id', id);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  mostrarToast('Controle Individual fechado.', 'sucesso');
  carregarPedidos();
}

document.getElementById('btn-add-item').addEventListener('click', adicionarLinhaItem);

function adicionarLinhaItem() {
  itensPedidoAtual.push({
    id: null, produto_id: '', quantidade: 1, valor_unitario: 0,
    embrulhado: false, embrulhado_em: null, enviado: false, enviado_em: null, pago: false, pago_em: null, valor_pago: 0
  });
  renderizarItensPedido();
}

function removerLinhaItem(idx) {
  const item = itensPedidoAtual[idx];
  if (item.id) itensRemovidosIds.push(item.id);
  itensPedidoAtual.splice(idx, 1);
  renderizarItensPedido();
}

function atualizarItem(idx, campo, valor) {
  itensPedidoAtual[idx][campo] = valor;
  if (campo === 'produto_id') {
    const prod = listaProdutos.find(p => p.id === valor);
    if (prod) itensPedidoAtual[idx].valor_unitario = prod.valor_venda || 0;
  }
  renderizarItensPedido();
}

function alternarStatusItem(idx, campo) {
  const item = itensPedidoAtual[idx];
  item[campo] = !item[campo];
  item[campo + '_em'] = item[campo] ? new Date().toISOString() : null;
  if (campo === 'pago') {
    if (item.pago && !item.valor_pago) {
      item.valor_pago = (item.quantidade || 0) * (item.valor_unitario || 0);
    }
    if (!item.pago) item.valor_pago = 0;
  }
  renderizarItensPedido();
}

function atualizarValorPagoItem(idx, valor) {
  itensPedidoAtual[idx].valor_pago = parseFloat(valor) || 0;
}

function recalcularTotalPreview() {
  const antecipado = parseFloat(document.getElementById('pedido-antecipado').value) || 0;
  const desconto = parseFloat(document.getElementById('pedido-desconto').value) || 0;
  const frete = parseFloat(document.getElementById('pedido-frete').value) || 0;
  const subtotal = itensPedidoAtual.reduce((s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0), 0);
  const total = subtotal - desconto + frete;
  document.getElementById('pedido-total-preview').textContent = formatarMoeda(total);

  const jaPagoItens = itensPedidoAtual.reduce((s, i) => s + (i.pago ? Number(i.valor_pago || 0) : 0), 0);
  const aberto = Math.max(total - jaPagoItens - antecipado, 0);
  document.getElementById('pedido-aberto-preview').textContent =
    antecipado > 0 ? `Com o adiantamento de ${formatarMoeda(antecipado)}, fica ${formatarMoeda(aberto)} em aberto` : '';
}

document.getElementById('pedido-antecipado').addEventListener('input', recalcularTotalPreview);
document.getElementById('pedido-desconto').addEventListener('input', recalcularTotalPreview);
document.getElementById('pedido-frete').addEventListener('input', recalcularTotalPreview);

function renderizarItensPedido() {
  const container = document.getElementById('lista-itens-pedido');
  container.innerHTML = '';

  itensPedidoAtual.forEach((item, idx) => {
    const opcoesProduto = listaProdutos.map(p => `<option value="${p.id}" ${p.id === item.produto_id ? 'selected' : ''}>${p.nome}</option>`).join('');
    const subtotalItem = (item.quantidade || 0) * (item.valor_unitario || 0);

    const linha = document.createElement('div');
    linha.style.cssText = 'border:1px solid var(--borda); border-radius:8px; padding:12px; margin-bottom:10px;';
    linha.innerHTML = `
      <div style="display:grid; grid-template-columns: 2fr 70px 90px 90px 30px; gap:8px; align-items:center;">
        <select style="padding:9px; border:1px solid var(--borda); border-radius:6px; font-family:'Jost',sans-serif; font-size:13px;" onchange="atualizarItem(${idx}, 'produto_id', this.value)">
          <option value="">Produto...</option>${opcoesProduto}
        </select>
        <input type="number" min="0.01" step="0.01" value="${item.quantidade}" style="padding:9px; border:1px solid var(--borda); border-radius:6px; font-size:13px;" onchange="atualizarItem(${idx}, 'quantidade', parseFloat(this.value)||0)">
        <input type="number" min="0" step="0.01" value="${item.valor_unitario}" style="padding:9px; border:1px solid var(--borda); border-radius:6px; font-size:13px;" onchange="atualizarItem(${idx}, 'valor_unitario', parseFloat(this.value)||0)">
        <div style="font-size:13px; text-align:right; color:var(--texto-suave);">${formatarMoeda(subtotalItem)}</div>
        <button type="button" onclick="removerLinhaItem(${idx})" style="border:none; background:none; color:var(--erro); cursor:pointer; font-size:16px;">×</button>
      </div>
      <div style="display:flex; gap:16px; margin-top:10px; padding-top:10px; border-top:1px solid var(--borda); font-size:12px; flex-wrap:wrap; align-items:center;">
        ${caixaItem(idx, 'embrulhado', 'Embrulhado', item)}
        ${caixaItem(idx, 'enviado', 'Enviado', item)}
        ${caixaItem(idx, 'pago', 'Pago', item)}
        ${item.pago ? `
          <span style="display:flex; align-items:center; gap:5px; color:var(--texto-suave);">
            Valor pago:
            <input type="number" step="0.01" value="${item.valor_pago}" style="width:80px; padding:5px 7px; border:1px solid var(--borda); border-radius:5px; font-size:12px;" onchange="atualizarValorPagoItem(${idx}, this.value)">
          </span>
        ` : ''}
      </div>
    `;
    container.appendChild(linha);
  });

  recalcularTotalPreview();
}

function caixaItem(idx, campo, rotulo, item) {
  const dataTexto = item[campo + '_em']
    ? new Date(item[campo + '_em']).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  return `
    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; color:var(--texto-suave);">
      <input type="checkbox" ${item[campo] ? 'checked' : ''} onchange="alternarStatusItem(${idx}, '${campo}')">
      ${rotulo}${dataTexto ? ` <span style="color:var(--dourado);">(${dataTexto})</span>` : ''}
    </label>
  `;
}

document.getElementById('form-pedido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const itensValidos = itensPedidoAtual.filter(i => i.produto_id && i.quantidade > 0);
  if (itensValidos.length === 0) { mostrarToast('Adicione ao menos um item válido.', 'erro'); return; }

  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const idPedido = document.getElementById('pedido-id').value;
  const payloadPedido = {
    cliente_id: document.getElementById('pedido-cliente').value,
    data: document.getElementById('pedido-data').value,
    valor_antecipado: parseFloat(document.getElementById('pedido-antecipado').value) || 0,
    desconto: parseFloat(document.getElementById('pedido-desconto').value) || 0,
    frete: parseFloat(document.getElementById('pedido-frete').value) || 0,
    observacao: document.getElementById('pedido-observacao').value.trim() || null,
    forma_pagamento: document.getElementById('pedido-forma-pagamento').value || null
  };

  let pedidoId = idPedido;
  let erroPedido;

  if (idPedido) {
    ({ error: erroPedido } = await supabaseClient.from('pedidos').update(payloadPedido).eq('id', idPedido));
  } else {
    const resultado = await supabaseClient.from('pedidos').insert(payloadPedido).select().single();
    erroPedido = resultado.error;
    if (resultado.data) pedidoId = resultado.data.id;
  }

  if (erroPedido) { destravarBotao(botao); mostrarToast(traduzErroBanco(erroPedido), 'erro'); return; }

  if (itensRemovidosIds.length > 0) {
    await supabaseClient.from('pedido_itens').delete().in('id', itensRemovidosIds);
  }

  for (const item of itensValidos.filter(i => i.id)) {
    await supabaseClient.from('pedido_itens').update({
      produto_id: item.produto_id, quantidade: item.quantidade, valor_unitario: item.valor_unitario,
      embrulhado: item.embrulhado, embrulhado_em: item.embrulhado_em,
      enviado: item.enviado, enviado_em: item.enviado_em,
      pago: item.pago, pago_em: item.pago_em, valor_pago: item.valor_pago
    }).eq('id', item.id);
  }

  const itensNovos = itensValidos.filter(i => !i.id).map(i => ({
    pedido_id: pedidoId, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
    embrulhado: i.embrulhado, embrulhado_em: i.embrulhado_em,
    enviado: i.enviado, enviado_em: i.enviado_em,
    pago: i.pago, pago_em: i.pago_em, valor_pago: i.valor_pago
  }));
  if (itensNovos.length > 0) {
    await supabaseClient.from('pedido_itens').insert(itensNovos);
  }

  destravarBotao(botao);
  document.getElementById('modal-pedido').classList.remove('ativo');
  mostrarToast('Controle Individual salvo.', 'sucesso');
  await carregarProdutos();
  await carregarPedidos();
});

async function excluirPedido(id) {
  if (!(await confirmarAcao('Excluir este registro? Os itens vinculados também serão removidos e o estoque devolvido.'))) return;
  const { error } = await supabaseClient.from('pedidos').delete().eq('id', id);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  mostrarToast('Registro excluído.', 'sucesso');
  carregarPedidos();
}

// ---- Relatórios ----
function popularSelectRelatorioCliente() {
  const select = document.getElementById('select-relatorio-cliente');
  if (!select) return;
  const atual = select.value;
  select.innerHTML = '<option value="">Selecione o cliente...</option>';
  listaClientes.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
  if (atual) select.value = atual;

  const selectProduto = document.getElementById('select-relatorio-produto');
  if (selectProduto) {
    const atualProduto = selectProduto.value;
    selectProduto.innerHTML = '<option value="">Selecione o produto...</option>';
    listaProdutos.forEach(p => selectProduto.innerHTML += `<option value="${p.id}">${p.nome}</option>`);
    if (atualProduto) selectProduto.value = atualProduto;
  }
}

function abrirJanelaRelatorio(html) {
  const janela = window.open('', '_blank');
  janela.document.write(html);
  janela.document.close();
  janela.focus();
  setTimeout(() => janela.print(), 400);
}

let dadosEmpresaCache = null;

async function buscarDadosEmpresaRelatorio() {
  if (dadosEmpresaCache) return dadosEmpresaCache;
  const { data } = await supabaseClient.from('empresa').select('*').limit(1).maybeSingle();
  dadosEmpresaCache = data || {};
  return dadosEmpresaCache;
}

function cabecalhoRelatorio(empresa, titulo) {
  const contato = [empresa.telefone, empresa.email, empresa.endereco].filter(Boolean).join(' · ');
  const cnpj = empresa.cnpj ? `CNPJ: ${empresa.cnpj}` : '';
  return `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:6px;">
      ${empresa.logo_url ? `<img src="${empresa.logo_url}" style="width:48px; height:48px; object-fit:cover; border-radius:8px;">` : ''}
      <div>
        <h1 style="font-size:22px; margin:0;">${empresa.nome_fantasia || empresa.razao_social || 'Aromas de Alta Frequência'}</h1>
        ${contato ? `<div style="font-size:11px; color:#8C8778;">${contato}</div>` : ''}
        ${cnpj ? `<div style="font-size:11px; color:#8C8778;">${cnpj}</div>` : ''}
      </div>
    </div>
    <div style="color:#6B6656; font-size:13px; margin-bottom:24px; padding-bottom:12px; border-bottom:2px solid #E7E3D9;">${titulo}</div>
  `;
}

const estiloRelatorio = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, serif; color: #26241C; margin: 0; padding: 24px 28px; max-width: 210mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #ddd; font-size: 12px; }
  th { background: #F0EAD9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  .totais { margin-top: 20px; text-align: right; font-size: 13px; }
  .totais strong { font-size: 16px; }
  .bloco-pedido { margin-top: 22px; page-break-inside: avoid; }
  .bloco-pedido h3 { font-size: 14px; margin: 0 0 4px; font-family: 'Cormorant Garamond', Georgia, serif; }
  .bloco-pedido .resumo { font-size: 11px; color: #6B6656; margin-bottom: 6px; }
`;

async function gerarRelatorioPedido(id) {
  const [{ data: p, error }, empresa] = await Promise.all([
    supabaseClient.from('pedidos')
      .select('*, clientes(nome, telefone, email), pedido_itens(*, produtos(nome, unidade))')
      .eq('id', id).single(),
    buscarDadosEmpresaRelatorio()
  ]);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }

  const dataFmt = new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR');
  const subtotal = (p.pedido_itens || []).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const totalPagoItens = (p.pedido_itens || []).reduce((s, i) => s + (i.pago ? Number(i.valor_pago) : 0), 0);

  const linhasItens = (p.pedido_itens || []).map(i => `
    <tr>
      <td>${i.produtos ? i.produtos.nome : '—'}</td>
      <td>${i.quantidade} ${i.produtos && i.produtos.unidade ? i.produtos.unidade : ''}</td>
      <td>${formatarMoeda(i.valor_unitario)}</td>
      <td>${formatarMoeda(i.quantidade * i.valor_unitario)}</td>
      <td>${i.embrulhado ? '✓' : '—'}</td>
      <td>${i.enviado ? '✓' : '—'}</td>
      <td>${i.pago ? `✓ ${formatarMoeda(i.valor_pago)}` : '—'}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Controle Individual nº ${p.numero} — ${p.clientes ? p.clientes.nome : ''}</title>
    <style>${estiloRelatorio}</style></head>
    <body>
      ${cabecalhoRelatorio(empresa, `Controle Individual nº ${p.numero} · Cliente: ${p.clientes ? p.clientes.nome : '—'} · Data: ${dataFmt}${p.forma_pagamento ? ' · Pagamento: ' + p.forma_pagamento : ''}`)}
      <table>
        <thead><tr><th>Produto</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th><th>Embrulho</th><th>Envio</th><th>Pago</th></tr></thead>
        <tbody>${linhasItens}</tbody>
      </table>
      <div class="totais">
        Subtotal: ${formatarMoeda(subtotal)}<br>
        Desconto: -${formatarMoeda(p.desconto)}<br>
        Frete: +${formatarMoeda(p.frete)}<br>
        <strong>Total: ${formatarMoeda(p.valor_total)}</strong><br>
        Pago: ${formatarMoeda(totalPagoItens)} · Em aberto: ${formatarMoeda(Math.max(p.valor_total - totalPagoItens, 0))}
      </div>
    </body></html>`;
  abrirJanelaRelatorio(html);
}

async function gerarRelatorioGeral() {
  const empresa = await buscarDadosEmpresaRelatorio();
  const linhas = listaPedidos.map(p => {
    const conta = contaDoPedido(p.id);
    const status = conta ? conta.status : 'aberto';
    const rotulo = rotuloStatusConta(status);
    const dataFmt = new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR');
    return `<tr>
      <td>#${p.numero ?? '—'}</td>
      <td>${p.clientes ? p.clientes.nome : '—'}</td>
      <td>${dataFmt}</td>
      <td>${formatarMoeda(p.valor_total)}</td>
      <td>${formatarMoeda(conta ? conta.valor_pago || 0 : 0)}</td>
      <td>${rotulo.texto}</td>
    </tr>`;
  }).join('');

  const totalGeral = listaPedidos.reduce((s, p) => s + Number(p.valor_total), 0);
  const totalPago = listaContasReceberPedidos.reduce((s, c) => s + Number(c.valor_pago || 0), 0);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Relatório Geral — Controle Individual</title><style>${estiloRelatorio}</style></head>
    <body>
      ${cabecalhoRelatorio(empresa, `Relatório Geral do Controle Individual — ${listaPedidos.length} registros`)}
      <table>
        <thead><tr><th>Nº</th><th>Cliente</th><th>Data</th><th>Total</th><th>Pago</th><th>Status</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="totais">
        Total geral: ${formatarMoeda(totalGeral)}<br>
        <strong>Total pago: ${formatarMoeda(totalPago)} · Em aberto: ${formatarMoeda(Math.max(totalGeral - totalPago, 0))}</strong>
      </div>
    </body></html>`;
  abrirJanelaRelatorio(html);
}

async function gerarRelatorioCliente() {
  const clienteId = document.getElementById('select-relatorio-cliente').value;
  if (!clienteId) { mostrarToast('Selecione um cliente para gerar o relatório.', 'erro'); return; }

  const empresa = await buscarDadosEmpresaRelatorio();
  const cliente = listaClientes.find(c => c.id === clienteId);
  const pedidosCliente = listaPedidos.filter(p => p.cliente_id === clienteId);

  const comSaldo = pedidosCliente
    .map(p => {
      const conta = contaDoPedido(p.id);
      const devido = conta ? Number(conta.valor) : Number(p.valor_total);
      const pago = conta ? Number(conta.valor_pago || 0) : 0;
      return { pedido: p, devido, pago, aberto: Math.max(devido - pago, 0), status: conta ? conta.status : 'aberto' };
    })
    .filter(x => x.aberto > 0.005)
    .sort((a, b) => a.pedido.data.localeCompare(b.pedido.data));

  if (comSaldo.length === 0) {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Extrato — ${cliente ? cliente.nome : ''}</title><style>${estiloRelatorio}</style></head>
      <body>
        ${cabecalhoRelatorio(empresa, `Extrato de valores em aberto — ${cliente ? cliente.nome : ''}`)}
        <p>Não há valores em aberto para este cliente. Tudo certo por aqui! 🌿</p>
      </body></html>`;
    abrirJanelaRelatorio(html);
    return;
  }

  // Busca os itens de cada registro em aberto, com o status de pagamento por produto
  const idsPedidos = comSaldo.map(x => x.pedido.id);
  const { data: itensDetalhados } = await supabaseClient
    .from('pedido_itens')
    .select('pedido_id, quantidade, valor_unitario, pago, valor_pago, produtos(nome, unidade)')
    .in('pedido_id', idsPedidos);

  const itensPorPedido = {};
  (itensDetalhados || []).forEach(i => {
    itensPorPedido[i.pedido_id] = itensPorPedido[i.pedido_id] || [];
    itensPorPedido[i.pedido_id].push(i);
  });

  const blocos = comSaldo.map(x => {
    const dataFmt = new Date(x.pedido.data + 'T00:00:00').toLocaleDateString('pt-BR');
    const rotulo = rotuloStatusConta(x.status);
    const itens = itensPorPedido[x.pedido.id] || [];

    const linhasItens = itens.map(i => {
      const subtotalItem = i.quantidade * i.valor_unitario;
      const abertoItem = i.pago ? Math.max(subtotalItem - Number(i.valor_pago || 0), 0) : subtotalItem;
      return `<tr>
        <td>${i.produtos ? i.produtos.nome : '—'}</td>
        <td>${i.quantidade} ${i.produtos && i.produtos.unidade ? i.produtos.unidade : ''}</td>
        <td>${formatarMoeda(i.valor_unitario)}</td>
        <td>${formatarMoeda(subtotalItem)}</td>
        <td>${i.pago ? (abertoItem > 0.005 ? `Parcial (pago ${formatarMoeda(i.valor_pago)})` : 'Pago') : 'Em aberto'}</td>
      </tr>`;
    }).join('');

    return `
      <div class="bloco-pedido">
        <h3>Controle Individual nº ${x.pedido.numero ?? '—'} — ${dataFmt}</h3>
        <div class="resumo">Status geral: ${rotulo.texto} · Total do registro: ${formatarMoeda(x.devido)} · Já pago: ${formatarMoeda(x.pago)} · Em aberto: <strong>${formatarMoeda(x.aberto)}</strong></div>
        <table>
          <thead><tr><th>Produto</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th><th>Situação</th></tr></thead>
          <tbody>${linhasItens || '<tr><td colspan="5" style="color:#8C8778;">Sem itens registrados</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }).join('');

  const totalAberto = comSaldo.reduce((s, x) => s + x.aberto, 0);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Extrato — ${cliente ? cliente.nome : ''}</title><style>${estiloRelatorio}</style></head>
    <body>
      ${cabecalhoRelatorio(empresa, `Extrato de valores em aberto — ${cliente ? cliente.nome : ''}`)}
      ${blocos}
      <div class="totais"><strong>Total em aberto: ${formatarMoeda(totalAberto)}</strong></div>
    </body></html>`;
  abrirJanelaRelatorio(html);
}

// ---- Relatório por produto: quem comprou, quem pagou, quem foi enviado ----
async function gerarRelatorioProduto() {
  const produtoId = document.getElementById('select-relatorio-produto').value;
  if (!produtoId) { mostrarToast('Selecione um produto para gerar o relatório.', 'erro'); return; }

  const empresa = await buscarDadosEmpresaRelatorio();
  const produto = listaProdutos.find(p => p.id === produtoId);

  const { data: itens, error } = await supabaseClient
    .from('pedido_itens')
    .select('quantidade, valor_unitario, pago, valor_pago, enviado, embrulhado, pedidos(numero, data, clientes(nome))')
    .eq('produto_id', produtoId)
    .order('pedidos(data)', { ascending: false });

  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }

  if (!itens || itens.length === 0) {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Vendas — ${produto ? produto.nome : ''}</title><style>${estiloRelatorio}</style></head>
      <body>
        ${cabecalhoRelatorio(empresa, `Relatório de vendas — ${produto ? produto.nome : ''}`)}
        <p>Nenhuma venda registrada para este produto ainda.</p>
      </body></html>`;
    abrirJanelaRelatorio(html);
    return;
  }

  const totalQtd = itens.reduce((s, i) => s + Number(i.quantidade), 0);
  const totalReceita = itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0);
  const qtdPagos = itens.filter(i => i.pago).length;
  const qtdEnviados = itens.filter(i => i.enviado).length;

  const linhas = itens.map(i => {
    const p = i.pedidos;
    const dataFmt = p ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const subtotal = Number(i.quantidade) * Number(i.valor_unitario);
    return `<tr>
      <td>${p && p.clientes ? p.clientes.nome : '—'}</td>
      <td>#${p ? p.numero : '—'}</td>
      <td>${dataFmt}</td>
      <td>${i.quantidade}</td>
      <td>${formatarMoeda(subtotal)}</td>
      <td>${i.pago ? `Pago (${formatarMoeda(i.valor_pago)})` : 'Não pago'}</td>
      <td>${i.enviado ? 'Enviado' : 'Não enviado'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Vendas — ${produto ? produto.nome : ''}</title><style>${estiloRelatorio}</style></head>
    <body>
      ${cabecalhoRelatorio(empresa, `Relatório de vendas — ${produto ? produto.nome : ''} · ${itens.length} venda${itens.length === 1 ? '' : 's'}`)}
      <table>
        <thead><tr><th>Cliente</th><th>Nº</th><th>Data</th><th>Qtd.</th><th>Subtotal</th><th>Pagamento</th><th>Envio</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="totais">
        Total vendido: ${totalQtd} unidades · Receita: ${formatarMoeda(totalReceita)}<br>
        <strong>${qtdPagos}/${itens.length} pagos · ${qtdEnviados}/${itens.length} enviados</strong>
      </div>
    </body></html>`;
  abrirJanelaRelatorio(html);
}
