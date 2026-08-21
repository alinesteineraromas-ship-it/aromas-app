async function carregarDashboard() {
  mostrarCarregando('tabela-dashboard-pedidos', 4);
  document.getElementById('grafico-receita').innerHTML = '<div style="color:var(--texto-suave); font-size:13px;">Carregando...</div>';

  const hoje = new Date();
  const inicioMes = hoje.toISOString().slice(0, 7) + '-01';
  const hojeStr = hoje.toISOString().slice(0, 10);

  const [
    { count: totalClientes },
    { data: produtosData },
    { data: receberPendente },
    { data: pagarPendente },
    { data: pedidosRecentes },
    { data: dre },
    { data: pedidosMes },
    { data: pedidosClientes }
  ] = await Promise.all([
    supabaseClient.from('clientes').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
    supabaseClient.from('produtos').select('nome, quantidade, valor_custo'),
    supabaseClient.from('contas_receber').select('valor, valor_pago, status').in('status', ['aberto', 'parcial']),
    supabaseClient.from('contas_pagar').select('valor, valor_pago, status, vencimento').in('status', ['aberto', 'parcial']),
    supabaseClient.from('pedidos').select('*, clientes(nome), contas_receber(status)').order('criado_em', { ascending: false }).limit(6),
    supabaseClient.from('dre_mensal').select('*').limit(6),
    supabaseClient.from('pedidos').select('valor_total, data').gte('data', inicioMes),
    supabaseClient.from('pedidos').select('valor_total, clientes(nome)')
  ]);

  document.getElementById('kpi-clientes').textContent = totalClientes ?? 0;
  document.getElementById('kpi-produtos').textContent = (produtosData || []).length;

  const valorEstoque = (produtosData || []).reduce((s, p) => s + Number(p.quantidade) * Number(p.valor_custo), 0);
  document.getElementById('kpi-valor-estoque').textContent = formatarMoeda(valorEstoque);

  // Saldo em aberto = valor da conta menos o que já foi pago (cobre "parcial" também)
  const somaReceber = (receberPendente || []).reduce((s, r) => s + Math.max(Number(r.valor) - Number(r.valor_pago || 0), 0), 0);
  document.getElementById('kpi-receber').textContent = formatarMoeda(somaReceber);

  const somaPagar = (pagarPendente || []).reduce((s, r) => s + Math.max(Number(r.valor) - Number(r.valor_pago || 0), 0), 0);
  document.getElementById('kpi-pagar').textContent = formatarMoeda(somaPagar);

  const somaAtraso = (pagarPendente || []).filter(r => r.vencimento < hojeStr).reduce((s, r) => s + Math.max(Number(r.valor) - Number(r.valor_pago || 0), 0), 0);
  document.getElementById('kpi-atraso').textContent = formatarMoeda(somaAtraso);

  const em7dias = new Date(hoje); em7dias.setDate(em7dias.getDate() + 7);
  const em7Str = em7dias.toISOString().slice(0, 10);
  const qtdAtrasadas = (pagarPendente || []).filter(r => r.vencimento < hojeStr).length;
  const qtdProximas = (pagarPendente || []).filter(r => r.vencimento >= hojeStr && r.vencimento <= em7Str).length;
  if (qtdAtrasadas > 0) {
    mostrarToast(`⚠️ ${qtdAtrasadas} conta(s) a pagar em atraso — ${formatarMoeda(somaAtraso)}`, 'erro');
  } else if (qtdProximas > 0) {
    mostrarToast(`${qtdProximas} conta(s) a pagar vencem nos próximos 7 dias`, 'sucesso');
  }

  const totalMes = (pedidosMes || []).reduce((s, p) => s + Number(p.valor_total), 0);
  document.getElementById('kpi-pedidos-mes').textContent = formatarMoeda(totalMes);

  const ticketMedio = (pedidosClientes || []).length ? (pedidosClientes.reduce((s, p) => s + Number(p.valor_total), 0) / pedidosClientes.length) : 0;
  document.getElementById('kpi-ticket-medio').textContent = formatarMoeda(ticketMedio);

  renderizarGraficoReceita((dre || []).slice().reverse());
  renderizarMelhoresClientes(pedidosClientes || []);
  renderizarProdutosEstoqueBaixo(produtosData || []);

  const tbody = document.getElementById('tabela-dashboard-pedidos');
  tbody.innerHTML = '';
  if (!pedidosRecentes || pedidosRecentes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--texto-suave);">Nenhum registro ainda</td></tr>';
    return;
  }
  pedidosRecentes.forEach(p => {
    const tr = document.createElement('tr');
    const dataFmt = new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR');
    const status = (p.contas_receber || [])[0]?.status || 'aberto';
    const rotulo = status === 'pago' ? 'Pago' : status === 'parcial' ? 'Parcial' : 'Em aberto';
    tr.innerHTML = `
      <td><strong>${p.clientes ? p.clientes.nome : '—'}</strong></td>
      <td>${dataFmt}</td>
      <td>${formatarMoeda(p.valor_total)}</td>
      <td><span class="selo ${status === 'pago' ? 'ativo' : status === 'parcial' ? 'parcial' : 'inativo'}">${rotulo}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderizarMelhoresClientes(pedidos) {
  const porCliente = {};
  pedidos.forEach(p => {
    const nome = p.clientes ? p.clientes.nome : '—';
    porCliente[nome] = (porCliente[nome] || 0) + Number(p.valor_total);
  });
  const top5 = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const tbody = document.getElementById('tabela-melhores-clientes');
  tbody.innerHTML = top5.length
    ? top5.map(([nome, total]) => `<tr><td>${nome}</td><td style="text-align:right;">${formatarMoeda(total)}</td></tr>`).join('')
    : '<tr><td style="color:var(--texto-suave); padding:12px;">Sem dados ainda</td></tr>';
}

function renderizarProdutosEstoqueBaixo(produtos) {
  const baixos = produtos.filter(p => Number(p.quantidade) <= 5).sort((a, b) => a.quantidade - b.quantidade).slice(0, 6);
  const tbody = document.getElementById('tabela-estoque-baixo');
  tbody.innerHTML = baixos.length
    ? baixos.map(p => `<tr><td>${p.nome}</td><td style="color:var(--erro);">${p.quantidade}</td></tr>`).join('')
    : '<tr><td colspan="2" style="color:var(--texto-suave); padding:12px;">Nenhum produto com estoque baixo</td></tr>';
}

// Gráfico em HTML/CSS (barras flex) — mais previsível que SVG com poucos pontos de dado
function renderizarGraficoReceita(dados) {
  const container = document.getElementById('grafico-receita');
  if (!dados || dados.length === 0 || dados.every(d => Number(d.total_receitas) === 0)) {
    container.innerHTML = '<div style="color:var(--texto-suave); font-size:13px; padding:20px 0;">Sem receitas registradas ainda — o gráfico aparece assim que houver pagamentos (totais ou parciais) recebidos.</div>';
    return;
  }

  const maxValor = Math.max(...dados.map(d => Number(d.total_receitas)), 1);

  const barras = dados.map(d => {
    const [ano, mes] = d.mes.split('-');
    const rotuloMes = new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const alturaPercentual = Math.max((Number(d.total_receitas) / maxValor) * 100, 3);
    return `
      <div style="display:flex; flex-direction:column; align-items:center; flex:1; gap:6px;">
        <div style="font-size:11px; color:var(--texto-principal); font-weight:500;">${formatarMoeda(d.total_receitas).replace('R$','').trim()}</div>
        <div style="width:100%; max-width:38px; height:120px; display:flex; align-items:flex-end;">
          <div style="width:100%; height:${alturaPercentual}%; background:var(--verde-oliva); border-radius:4px 4px 0 0;"></div>
        </div>
        <div style="font-size:11px; color:var(--texto-suave); text-transform:capitalize;">${rotuloMes}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div style="display:flex; align-items:flex-end; gap:10px; padding-top:10px;">${barras}</div>`;
}
