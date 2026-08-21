let listaReceber = [], listaPagar = [], listaCustos = [];

function alternarAbaFinanceiro(aba) {
  ['receber','pagar','dre','fluxo','custos'].forEach(a => {
    document.getElementById('aba-' + a).style.display = a === aba ? 'block' : 'none';
    document.querySelector(`.sub-aba[data-aba="${a}"]`).classList.toggle('ativo', a === aba);
  });
  if (aba === 'custos') renderizarCustosEPontoEquilibrio();
}

async function carregarFinanceiro() {
  await Promise.all([carregarContasReceber(), carregarContasPagar(), carregarCustos()]);
  renderizarDre();
  renderizarFluxo();
}

async function carregarContasReceber() {
  mostrarCarregando('tabela-receber', 7);
  const { data, error } = await supabaseClient
    .from('contas_receber').select('*, clientes(nome)').order('vencimento', { ascending: false });
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaReceber = data;
  renderizarReceber();
}

function renderizarReceber() {
  const tbody = document.getElementById('tabela-receber');
  const vazio = document.getElementById('vazio-receber');
  tbody.innerHTML = '';
  vazio.style.display = listaReceber.length === 0 ? 'block' : 'none';

  listaReceber.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.clientes ? c.clientes.nome : '—'}</strong></td>
      <td>${c.descricao}</td>
      <td>${formatarMoeda(c.valor)}</td>
      <td>${new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td>${c.valor_pago != null ? formatarMoeda(c.valor_pago) : '—'}</td>
      <td>${c.pago_em ? new Date(c.pago_em + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td><span class="selo ${c.status === 'pago' ? 'ativo' : c.status === 'parcial' ? 'parcial' : 'inativo'}">${c.status === 'pago' ? 'Pago' : c.status === 'parcial' ? 'Parcial' : 'Aberto'}</span></td>
      <td><div class="acoes-linha"><button onclick="abrirEdicaoConta('contas_receber','${c.id}')">Editar</button></div></td>
    `;
    tbody.appendChild(tr);
  });
}

async function carregarContasPagar() {
  mostrarCarregando('tabela-pagar', 8);
  const { data, error } = await supabaseClient
    .from('contas_pagar').select('*, fornecedores(nome), categorias(nome)').order('vencimento', { ascending: false });
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaPagar = data;
  renderizarPagar();
  atualizarKpisPagar();
}

function renderizarPagar() {
  const tbody = document.getElementById('tabela-pagar');
  const vazio = document.getElementById('vazio-pagar');
  tbody.innerHTML = '';
  vazio.style.display = listaPagar.length === 0 ? 'block' : 'none';

  const hoje = new Date().toISOString().slice(0, 10);

  listaPagar.forEach(c => {
    const tr = document.createElement('tr');
    const atrasada = c.status !== 'pago' && c.vencimento < hoje;
    tr.innerHTML = `
      <td>${c.fornecedores ? c.fornecedores.nome : '—'}</td>
      <td>${c.descricao}${c.categorias ? ` <span style="color:var(--texto-suave); font-size:11px;">· ${c.categorias.nome}</span>` : ''}</td>
      <td>${formatarMoeda(c.valor)}</td>
      <td style="${atrasada ? 'color:var(--erro); font-weight:600;' : ''}">${new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}${atrasada ? ' (atrasada)' : ''}</td>
      <td>${c.valor_pago != null ? formatarMoeda(c.valor_pago) : '—'}</td>
      <td>${c.pago_em ? new Date(c.pago_em + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td><span class="selo ${c.status === 'pago' ? 'ativo' : c.status === 'parcial' ? 'parcial' : 'inativo'}">${c.status === 'pago' ? 'Pago' : c.status === 'parcial' ? 'Parcial' : 'Aberto'}</span></td>
      <td><div class="acoes-linha"><button onclick="abrirEdicaoConta('contas_pagar','${c.id}')">Editar</button></div></td>
    `;
    tbody.appendChild(tr);
  });
}

function atualizarKpisPagar() {
  const hoje = new Date();
  const em7 = new Date(hoje); em7.setDate(em7.getDate() + 7);
  const em15 = new Date(hoje); em15.setDate(em15.getDate() + 15);
  const hojeStr = hoje.toISOString().slice(0, 10);
  const em7Str = em7.toISOString().slice(0, 10);
  const em15Str = em15.toISOString().slice(0, 10);

  let soma7 = 0, soma15 = 0, somaAtraso = 0;
  listaPagar.filter(c => c.status !== 'pago').forEach(c => {
    const saldo = Math.max(Number(c.valor) - Number(c.valor_pago || 0), 0);
    if (c.vencimento < hojeStr) somaAtraso += saldo;
    else if (c.vencimento <= em7Str) soma7 += saldo;
    if (c.vencimento >= hojeStr && c.vencimento <= em15Str) soma15 += saldo;
  });

  document.getElementById('kpi-pagar-7d').textContent = formatarMoeda(soma7);
  document.getElementById('kpi-pagar-15d').textContent = formatarMoeda(soma15);
  document.getElementById('kpi-pagar-atraso').textContent = formatarMoeda(somaAtraso);
}

// ---- DRE ----
function renderizarDre() {
  const hoje = new Date();
  const mesAtual = hoje.toISOString().slice(0, 7);
  const dataMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mesAnterior = dataMesAnterior.toISOString().slice(0, 7);

  const receberPagos = listaReceber.filter(c => (c.status === 'pago' || c.status === 'parcial') && c.pago_em);
  const pagarPagos = listaPagar.filter(c => (c.status === 'pago' || c.status === 'parcial') && c.pago_em);

  const mapaMeses = {};
  receberPagos.forEach(c => {
    const mes = c.pago_em.slice(0, 7);
    mapaMeses[mes] = mapaMeses[mes] || { receitas: 0, despesas: 0 };
    mapaMeses[mes].receitas += Number(c.valor_pago ?? c.valor);
  });
  pagarPagos.forEach(c => {
    const mes = c.pago_em.slice(0, 7);
    mapaMeses[mes] = mapaMeses[mes] || { receitas: 0, despesas: 0 };
    mapaMeses[mes].despesas += Number(c.valor_pago ?? c.valor);
  });

  const meses = Object.keys(mapaMeses).sort().reverse();
  const tbody = document.getElementById('tabela-dre');
  const vazio = document.getElementById('vazio-dre');
  tbody.innerHTML = '';
  vazio.style.display = meses.length === 0 ? 'block' : 'none';

  meses.forEach(mes => {
    const { receitas, despesas } = mapaMeses[mes];
    const resultado = receitas - despesas;
    const margem = receitas > 0 ? (resultado / receitas * 100) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${mes}</strong></td>
      <td style="color:var(--verde-oliva-escuro);">${formatarMoeda(receitas)}</td>
      <td style="color:var(--erro);">${formatarMoeda(despesas)}</td>
      <td><strong>${formatarMoeda(resultado)}</strong></td>
      <td>${margem.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });

  const dadosMesAtual = mapaMeses[mesAtual] || { receitas: 0, despesas: 0 };
  const dadosMesAnterior = mapaMeses[mesAnterior] || { receitas: 0, despesas: 0 };
  const resultadoMes = dadosMesAtual.receitas - dadosMesAtual.despesas;
  const margemMes = dadosMesAtual.receitas > 0 ? (resultadoMes / dadosMesAtual.receitas * 100) : 0;

  document.getElementById('dre-receita-mes').textContent = formatarMoeda(dadosMesAtual.receitas);
  document.getElementById('dre-despesa-mes').textContent = formatarMoeda(dadosMesAtual.despesas);
  const elResultado = document.getElementById('dre-resultado-mes');
  elResultado.textContent = formatarMoeda(resultadoMes);
  elResultado.style.color = resultadoMes >= 0 ? 'var(--verde-oliva-escuro)' : 'var(--erro)';
  document.getElementById('dre-margem-mes').textContent = margemMes.toFixed(1) + '%';

  document.getElementById('dre-receita-variacao').innerHTML = textoVariacao(dadosMesAtual.receitas, dadosMesAnterior.receitas);
  document.getElementById('dre-despesa-variacao').innerHTML = textoVariacao(dadosMesAtual.despesas, dadosMesAnterior.despesas, true);

  // Gráfico comparativo receita x despesa — últimos 6 meses
  const ultimos6 = Object.keys(mapaMeses).sort().slice(-6);
  renderizarGraficoComparativoDre(ultimos6.map(m => ({ mes: m, ...mapaMeses[m] })));

  // Maiores despesas do mês
  const despesasMes = pagarPagos.filter(c => c.pago_em.slice(0, 7) === mesAtual)
    .sort((a, b) => Number(b.valor_pago ?? b.valor) - Number(a.valor_pago ?? a.valor)).slice(0, 5);
  const tbodyTop = document.getElementById('tabela-dre-top-despesas');
  const vazioTop = document.getElementById('vazio-dre-top');
  tbodyTop.innerHTML = '';
  vazioTop.style.display = despesasMes.length === 0 ? 'block' : 'none';
  despesasMes.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.descricao}</td><td>${formatarMoeda(c.valor_pago ?? c.valor)}</td>`;
    tbodyTop.appendChild(tr);
  });

  // Despesas por categoria (mês atual)
  const porCategoria = {};
  pagarPagos.filter(c => c.pago_em.slice(0, 7) === mesAtual).forEach(c => {
    const nome = c.categorias ? c.categorias.nome : 'Sem categoria';
    porCategoria[nome] = (porCategoria[nome] || 0) + Number(c.valor_pago ?? c.valor);
  });
  const tbodyCat = document.getElementById('tabela-dre-categorias');
  const vazioCat = document.getElementById('vazio-dre-categorias');
  tbodyCat.innerHTML = '';
  const entradasCat = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  vazioCat.style.display = entradasCat.length === 0 ? 'block' : 'none';
  entradasCat.forEach(([nome, valor]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${nome}</td><td>${formatarMoeda(valor)}</td>`;
    tbodyCat.appendChild(tr);
  });
}

function textoVariacao(atual, anterior, invertido) {
  if (anterior === 0) return atual > 0 ? 'novo neste mês' : '';
  const variacao = ((atual - anterior) / anterior) * 100;
  const positivoEBom = invertido ? variacao <= 0 : variacao >= 0;
  const cor = positivoEBom ? 'var(--verde-oliva-escuro)' : 'var(--erro)';
  const seta = variacao >= 0 ? '↑' : '↓';
  return `<span style="color:${cor};">${seta} ${Math.abs(variacao).toFixed(1)}% vs mês anterior</span>`;
}

function renderizarGraficoComparativoDre(dados) {
  const container = document.getElementById('grafico-dre-comparativo');
  if (!dados || dados.length === 0) {
    container.innerHTML = '<div style="color:var(--texto-suave); font-size:13px;">Sem dados suficientes ainda.</div>';
    return;
  }
  const maxValor = Math.max(...dados.map(d => Math.max(d.receitas, d.despesas)), 1);

  const colunas = dados.map(d => {
    const [ano, mes] = d.mes.split('-');
    const rotuloMes = new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const alturaReceita = Math.max((d.receitas / maxValor) * 100, d.receitas > 0 ? 3 : 0);
    const alturaDespesa = Math.max((d.despesas / maxValor) * 100, d.despesas > 0 ? 3 : 0);
    return `
      <div style="display:flex; flex-direction:column; align-items:center; flex:1; gap:6px;">
        <div style="display:flex; align-items:flex-end; gap:3px; height:130px;">
          <div title="Receita" style="width:16px; height:${alturaReceita}%; background:var(--verde-oliva); border-radius:3px 3px 0 0;"></div>
          <div title="Despesa" style="width:16px; height:${alturaDespesa}%; background:var(--erro); border-radius:3px 3px 0 0; opacity:0.85;"></div>
        </div>
        <div style="font-size:11px; color:var(--texto-suave); text-transform:capitalize;">${rotuloMes}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex; gap:14px; align-items:center; margin-bottom:10px; font-size:11px; color:var(--texto-suave);">
      <span><span style="display:inline-block; width:10px; height:10px; background:var(--verde-oliva); border-radius:2px; margin-right:4px;"></span>Receita</span>
      <span><span style="display:inline-block; width:10px; height:10px; background:var(--erro); border-radius:2px; margin-right:4px; opacity:0.85;"></span>Despesa</span>
    </div>
    <div style="display:flex; align-items:flex-end; gap:8px;">${colunas}</div>
  `;
}

// ---- Fluxo de caixa ----
function renderizarFluxo() {
  const lancamentos = [
    ...listaReceber.filter(c => c.status !== 'pago').map(c => ({ tipo: 'receber', descricao: c.descricao, valor: Math.max(Number(c.valor) - Number(c.valor_pago || 0), 0), vencimento: c.vencimento, status: c.status })),
    ...listaPagar.filter(c => c.status !== 'pago').map(c => ({ tipo: 'pagar', descricao: c.descricao, valor: -Math.max(Number(c.valor) - Number(c.valor_pago || 0), 0), vencimento: c.vencimento, status: c.status }))
  ].sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const totalEntrada = lancamentos.filter(l => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const totalSaida = Math.abs(lancamentos.filter(l => l.valor < 0).reduce((s, l) => s + l.valor, 0));
  document.getElementById('fluxo-total-entrada').textContent = formatarMoeda(totalEntrada);
  document.getElementById('fluxo-total-saida').textContent = formatarMoeda(totalSaida);
  const saldoEl = document.getElementById('fluxo-saldo-projetado');
  const saldo = totalEntrada - totalSaida;
  saldoEl.textContent = formatarMoeda(saldo);
  saldoEl.style.color = saldo >= 0 ? 'var(--verde-oliva-escuro)' : 'var(--erro)';

  let acumulado = 0;
  const tbody = document.getElementById('tabela-fluxo');
  const vazio = document.getElementById('vazio-fluxo');
  tbody.innerHTML = '';
  vazio.style.display = lancamentos.length === 0 ? 'block' : 'none';

  lancamentos.forEach(l => {
    acumulado += l.valor;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(l.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td>${l.tipo === 'receber' ? 'A receber' : 'A pagar'}</td>
      <td>${l.descricao}</td>
      <td style="color:${l.valor < 0 ? 'var(--erro)' : 'var(--verde-oliva-escuro)'};">${formatarMoeda(l.valor)}</td>
      <td><span class="selo ${l.status === 'parcial' ? 'parcial' : 'inativo'}">${l.status === 'parcial' ? 'Parcial (saldo)' : 'Em aberto'}</span></td>
      <td style="color:${acumulado < 0 ? 'var(--erro)' : 'var(--texto-principal)'};"><strong>${formatarMoeda(acumulado)}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function popularSelectFornecedoresPagar() {
  const select = document.getElementById('pagar-fornecedor');
  select.innerHTML = '<option value="">Nenhum</option>';
  listaFornecedores.forEach(f => select.innerHTML += `<option value="${f.id}">${f.nome}</option>`);
  popularSelectCategoriasFinanceiras('pagar-categoria');
}

function popularSelectCategoriasFinanceiras(idSelect) {
  const select = document.getElementById(idSelect);
  if (!select) return;
  select.innerHTML = '<option value="">Nenhuma</option>';
  listaCategorias.filter(c => c.tipo === 'financeira').forEach(c => select.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
}

function gerarDatasParcelas(vencimentoBase, quantidade) {
  const datas = [];
  const base = new Date(vencimentoBase + 'T00:00:00');
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i);
    datas.push(d.toISOString().slice(0, 10));
  }
  return datas;
}

function ligarCalculoParcelas(idValor, idParcelas, idValorParcela) {
  const atualizar = () => {
    const valor = parseFloat(document.getElementById(idValor).value) || 0;
    const parcelas = Math.max(parseInt(document.getElementById(idParcelas).value) || 1, 1);
    document.getElementById(idValorParcela).value = (valor / parcelas).toFixed(2);
  };
  document.getElementById(idValor).addEventListener('input', atualizar);
  document.getElementById(idParcelas).addEventListener('input', atualizar);
}
ligarCalculoParcelas('pagar-valor', 'pagar-parcelas', 'pagar-valor-parcela');
ligarCalculoParcelas('receber-valor', 'receber-parcelas', 'receber-valor-parcela');

document.getElementById('btn-nova-conta-pagar').addEventListener('click', () => {
  document.getElementById('form-conta-pagar').reset();
  document.getElementById('pagar-parcelas').value = 1;
  popularSelectCategoriasFinanceiras('pagar-categoria');
  document.getElementById('modal-conta-pagar').classList.add('ativo');
});

document.getElementById('form-conta-pagar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const valorTotal = parseFloat(document.getElementById('pagar-valor').value) || 0;
  const parcelas = Math.max(parseInt(document.getElementById('pagar-parcelas').value) || 1, 1);
  const valorParcela = parseFloat((valorTotal / parcelas).toFixed(2));
  const datas = gerarDatasParcelas(document.getElementById('pagar-vencimento').value, parcelas);
  const descricaoBase = document.getElementById('pagar-descricao').value.trim();

  const linhas = datas.map((data, i) => ({
    fornecedor_id: document.getElementById('pagar-fornecedor').value || null,
    descricao: parcelas > 1 ? `${descricaoBase} (parcela ${i + 1}/${parcelas})` : descricaoBase,
    valor: valorParcela,
    vencimento: data,
    categoria_id: document.getElementById('pagar-categoria').value || null,
    parcelas, numero_parcela: i + 1, valor_parcela: valorParcela
  }));

  const { error } = await supabaseClient.from('contas_pagar').insert(linhas);
  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  document.getElementById('modal-conta-pagar').classList.remove('ativo');
  mostrarToast(parcelas > 1 ? `${parcelas} parcelas registradas.` : 'Conta a pagar salva.', 'sucesso');
  carregarContasPagar();
  renderizarDre();
  renderizarFluxo();
});

document.getElementById('btn-nova-conta-receber').addEventListener('click', () => {
  document.getElementById('form-conta-receber').reset();
  document.getElementById('receber-parcelas').value = 1;
  popularSelectClientes('receber-cliente', false);
  document.getElementById('modal-conta-receber').classList.add('ativo');
});

document.getElementById('form-conta-receber').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const valorTotal = parseFloat(document.getElementById('receber-valor').value) || 0;
  const parcelas = Math.max(parseInt(document.getElementById('receber-parcelas').value) || 1, 1);
  const valorParcela = parseFloat((valorTotal / parcelas).toFixed(2));
  const datas = gerarDatasParcelas(document.getElementById('receber-vencimento').value, parcelas);
  const descricaoBase = document.getElementById('receber-descricao').value.trim();

  const linhas = datas.map((data, i) => ({
    cliente_id: document.getElementById('receber-cliente').value,
    descricao: parcelas > 1 ? `${descricaoBase} (parcela ${i + 1}/${parcelas})` : descricaoBase,
    valor: valorParcela,
    vencimento: data,
    parcelas, numero_parcela: i + 1, valor_parcela: valorParcela
  }));

  const { error } = await supabaseClient.from('contas_receber').insert(linhas);
  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  document.getElementById('modal-conta-receber').classList.remove('ativo');
  mostrarToast(parcelas > 1 ? `${parcelas} parcelas registradas.` : 'Conta a receber salva.', 'sucesso');
  carregarContasReceber();
  renderizarDre();
  renderizarFluxo();
});

// ---- Editar / pagar (comum a receber e pagar) ----
function abrirEdicaoConta(tabela, id) {
  const lista = tabela === 'contas_receber' ? listaReceber : listaPagar;
  const conta = lista.find(c => c.id === id);
  if (!conta) return;

  document.getElementById('editar-conta-tabela').value = tabela;
  document.getElementById('editar-conta-id').value = id;
  document.getElementById('editar-descricao').value = conta.descricao;
  document.getElementById('editar-valor').value = conta.valor;
  document.getElementById('editar-vencimento').value = conta.vencimento;
  document.getElementById('editar-status').value = conta.status;
  document.getElementById('editar-pago-em').value = conta.pago_em || '';
  document.getElementById('editar-valor-pago').value = conta.valor_pago ?? conta.valor;
  document.getElementById('modal-conta-editar-titulo').textContent =
    tabela === 'contas_receber' ? 'Editar conta a receber' : 'Editar conta a pagar';

  const blocoCategoria = document.getElementById('editar-bloco-categoria');
  if (tabela === 'contas_pagar') {
    blocoCategoria.style.display = 'block';
    popularSelectCategoriasFinanceiras('editar-categoria');
    document.getElementById('editar-categoria').value = conta.categoria_id || '';
  } else {
    blocoCategoria.style.display = 'none';
  }

  alternarBlocoPagamento();
  document.getElementById('modal-conta-editar').classList.add('ativo');
}

document.getElementById('editar-status').addEventListener('change', alternarBlocoPagamento);

function alternarBlocoPagamento() {
  const status = document.getElementById('editar-status').value;
  const mostrar = status === 'pago' || status === 'parcial';
  document.getElementById('editar-bloco-pagamento').style.display = mostrar ? 'grid' : 'none';
  if (mostrar && !document.getElementById('editar-pago-em').value) {
    document.getElementById('editar-pago-em').value = new Date().toISOString().slice(0, 10);
  }
}

document.getElementById('form-conta-editar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const tabela = document.getElementById('editar-conta-tabela').value;
  const id = document.getElementById('editar-conta-id').value;
  const status = document.getElementById('editar-status').value;

  const payload = {
    descricao: document.getElementById('editar-descricao').value.trim(),
    valor: parseFloat(document.getElementById('editar-valor').value) || 0,
    vencimento: document.getElementById('editar-vencimento').value,
    status,
    pago_em: (status === 'pago' || status === 'parcial') ? document.getElementById('editar-pago-em').value : null,
    valor_pago: (status === 'pago' || status === 'parcial') ? (parseFloat(document.getElementById('editar-valor-pago').value) || 0) : null
  };
  if (tabela === 'contas_pagar') payload.categoria_id = document.getElementById('editar-categoria').value || null;

  const { error } = await supabaseClient.from(tabela).update(payload).eq('id', id);
  destravarBotao(botao);

  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }

  document.getElementById('modal-conta-editar').classList.remove('ativo');
  mostrarToast('Lançamento atualizado.', 'sucesso');
  await carregarFinanceiro();
});

function exportarReceberCSV() {
  exportarCSV(listaReceber, [
    { rotulo: 'Cliente', valor: c => c.clientes ? c.clientes.nome : '' },
    { rotulo: 'Descrição', valor: 'descricao' },
    { rotulo: 'Valor a receber', valor: c => Number(c.valor).toFixed(2) },
    { rotulo: 'Vencimento', valor: c => new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') },
    { rotulo: 'Valor recebido', valor: c => c.valor_pago != null ? Number(c.valor_pago).toFixed(2) : '' },
    { rotulo: 'Data recebimento', valor: c => c.pago_em ? new Date(c.pago_em + 'T00:00:00').toLocaleDateString('pt-BR') : '' },
    { rotulo: 'Status', valor: 'status' }
  ], 'contas_a_receber');
}

function exportarPagarCSV() {
  exportarCSV(listaPagar, [
    { rotulo: 'Fornecedor', valor: c => c.fornecedores ? c.fornecedores.nome : '' },
    { rotulo: 'Descrição', valor: 'descricao' },
    { rotulo: 'Valor a pagar', valor: c => Number(c.valor).toFixed(2) },
    { rotulo: 'Vencimento', valor: c => new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') },
    { rotulo: 'Valor pago', valor: c => c.valor_pago != null ? Number(c.valor_pago).toFixed(2) : '' },
    { rotulo: 'Data pagamento', valor: c => c.pago_em ? new Date(c.pago_em + 'T00:00:00').toLocaleDateString('pt-BR') : '' },
    { rotulo: 'Categoria', valor: c => c.categorias ? c.categorias.nome : '' },
    { rotulo: 'Status', valor: 'status' }
  ], 'contas_a_pagar');
}

// ---- Custos fixos/variáveis e ponto de equilíbrio ----
async function carregarCustos() {
  const { data, error } = await supabaseClient.from('custos').select('*').eq('ativo', true).order('nome');
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaCustos = data;
}

function renderizarCustosEPontoEquilibrio() {
  const fixos = listaCustos.filter(c => c.tipo === 'fixo');
  const variaveis = listaCustos.filter(c => c.tipo === 'variavel');

  const tbodyFixos = document.getElementById('tabela-custos-fixos');
  const vazioFixos = document.getElementById('vazio-custos-fixos');
  tbodyFixos.innerHTML = '';
  vazioFixos.style.display = fixos.length === 0 ? 'block' : 'none';
  fixos.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.nome}</td><td>${formatarMoeda(c.valor_mensal || 0)}</td>
      <td><div class="acoes-linha"><button onclick="excluirCusto('${c.id}')">Excluir</button></div></td>`;
    tbodyFixos.appendChild(tr);
  });

  const tbodyVar = document.getElementById('tabela-custos-variaveis');
  const vazioVar = document.getElementById('vazio-custos-variaveis');
  tbodyVar.innerHTML = '';
  vazioVar.style.display = variaveis.length === 0 ? 'block' : 'none';
  variaveis.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.nome}</td><td>${Number(c.percentual || 0).toFixed(1)}%</td>
      <td><div class="acoes-linha"><button onclick="excluirCusto('${c.id}')">Excluir</button></div></td>`;
    tbodyVar.appendChild(tr);
  });

  // Ponto de equilíbrio
  const totalFixos = fixos.reduce((s, c) => s + Number(c.valor_mensal || 0), 0);
  const totalPercentualVariavel = variaveis.reduce((s, c) => s + Number(c.percentual || 0), 0);
  const fatorContribuicao = 1 - (totalPercentualVariavel / 100);
  const metaVenda = fatorContribuicao > 0 ? totalFixos / fatorContribuicao : 0;

  const mesAtual = new Date().toISOString().slice(0, 7);
  const jaRecebido = listaReceber
    .filter(c => (c.status === 'pago' || c.status === 'parcial') && c.pago_em && c.pago_em.slice(0, 7) === mesAtual)
    .reduce((s, c) => s + Number(c.valor_pago || 0), 0);

  const faltaNegociar = Math.max(metaVenda - jaRecebido, 0);
  const percentualAtingido = metaVenda > 0 ? Math.min((jaRecebido / metaVenda) * 100, 100) : 0;

  document.getElementById('pe-custos-fixos').textContent = formatarMoeda(totalFixos);
  document.getElementById('pe-percentual-variavel').textContent = totalPercentualVariavel.toFixed(1) + '%';
  document.getElementById('pe-meta-venda').textContent = fatorContribuicao > 0 ? formatarMoeda(metaVenda) : '—';
  document.getElementById('pe-ja-recebido').textContent = formatarMoeda(jaRecebido);
  document.getElementById('pe-falta-negociar').textContent = fatorContribuicao > 0 ? formatarMoeda(faltaNegociar) : '—';
  document.getElementById('pe-barra-progresso').style.width = percentualAtingido + '%';
  document.getElementById('pe-percentual-atingido').textContent =
    fatorContribuicao > 0 ? `${percentualAtingido.toFixed(0)}% da meta atingida este mês` :
    'Cadastre custos variáveis abaixo de 100% para calcular a meta';
}

function abrirNovoCusto(tipo) {
  document.getElementById('custo-tipo').value = tipo;
  document.getElementById('custo-nome').value = '';
  document.getElementById('custo-valor').value = '';
  document.getElementById('custo-percentual').value = '';
  document.getElementById('modal-custo-titulo').textContent = tipo === 'fixo' ? 'Novo custo fixo' : 'Novo custo variável';
  document.getElementById('bloco-custo-valor').style.display = tipo === 'fixo' ? 'block' : 'none';
  document.getElementById('bloco-custo-percentual').style.display = tipo === 'variavel' ? 'block' : 'none';
  document.getElementById('modal-custo').classList.add('ativo');
}

document.getElementById('form-custo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const tipo = document.getElementById('custo-tipo').value;
  const payload = {
    nome: document.getElementById('custo-nome').value.trim(),
    tipo,
    valor_mensal: tipo === 'fixo' ? (parseFloat(document.getElementById('custo-valor').value) || 0) : null,
    percentual: tipo === 'variavel' ? (parseFloat(document.getElementById('custo-percentual').value) || 0) : null
  };

  const { error } = await supabaseClient.from('custos').insert(payload);
  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  document.getElementById('modal-custo').classList.remove('ativo');
  mostrarToast('Custo salvo.', 'sucesso');
  await carregarCustos();
  renderizarCustosEPontoEquilibrio();
});

async function excluirCusto(id) {
  if (!(await confirmarAcao('Excluir este custo?'))) return;
  const { error } = await supabaseClient.from('custos').delete().eq('id', id);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  mostrarToast('Custo excluído.', 'sucesso');
  await carregarCustos();
  renderizarCustosEPontoEquilibrio();
}
