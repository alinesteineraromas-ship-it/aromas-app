let listaConsorcios = [];
let consorcioAtualId = null;

async function carregarConsorcios() {
  const { data, error } = await supabaseClient
    .from('consorcios')
    .select('*, consorcio_participantes(id, sorteado), consorcio_meses(id, mes, fechado, consorcio_pagamentos(pago))')
    .order('criado_em', { ascending: false });
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaConsorcios = data;
  renderizarKanbanConsorcios();
}

function mesAtualDe(consorcio) {
  const abertos = (consorcio.consorcio_meses || []).filter(m => !m.fechado).sort((a, b) => a.mes.localeCompare(b.mes));
  return abertos[0] || null;
}

function renderizarKanbanConsorcios() {
  const grade = document.getElementById('grade-consorcios');
  const vazio = document.getElementById('vazio-consorcios');
  vazio.style.display = listaConsorcios.length === 0 ? 'block' : 'none';

  grade.innerHTML = listaConsorcios.map(c => {
    const participantes = c.consorcio_participantes || [];
    const sorteados = participantes.filter(p => p.sorteado).length;
    const concorrem = participantes.length - sorteados;
    const mesAtual = mesAtualDe(c);
    const pagosMes = mesAtual ? (mesAtual.consorcio_pagamentos || []).filter(p => p.pago).length : 0;
    const valorPagoMes = pagosMes * Number(c.valor_parcela);

    return `
      <div class="painel" style="padding:16px; cursor:pointer;" onclick="abrirDetalheConsorcio('${c.id}')">
        <div style="font-weight:600; margin-bottom:4px;">${c.nome}</div>
        <div style="font-size:11px; color:var(--texto-suave); margin-bottom:10px;">${formatarMoeda(c.valor_parcela)}/mês · ${participantes.length} participantes</div>
        <div style="font-size:12px; color:var(--texto-suave);">Pago este mês</div>
        <div style="font-size:18px; color:var(--verde-oliva-escuro);">${formatarMoeda(valorPagoMes)}</div>
        <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:10px; border-top:1px solid var(--borda); font-size:11px; color:var(--texto-suave);">
          <span>Concorrem: ${concorrem}</span>
          <span>Sorteados: ${sorteados}</span>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('btn-novo-consorcio').addEventListener('click', () => {
  document.getElementById('form-consorcio').reset();
  document.getElementById('modal-consorcio').classList.add('ativo');
});

document.getElementById('form-consorcio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Criando...');

  const mesInicio = document.getElementById('consorcio-mes-inicio').value + '-01';
  const payload = {
    nome: document.getElementById('consorcio-nome').value.trim(),
    valor_parcela: parseFloat(document.getElementById('consorcio-valor').value) || 0,
    mes_inicio: mesInicio
  };

  const { error } = await supabaseClient.from('consorcios').insert(payload);
  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  document.getElementById('modal-consorcio').classList.remove('ativo');
  mostrarToast('Consórcio criado — adicione os participantes.', 'sucesso');
  carregarConsorcios();
});

// ---- Detalhe do consórcio ----
async function abrirDetalheConsorcio(id) {
  consorcioAtualId = id;
  await recarregarDetalheConsorcio();
  alternarAbaConsorcio('mes-atual');
  document.getElementById('modal-consorcio-detalhe').classList.add('ativo');
}

async function recarregarDetalheConsorcio() {
  const { data: c, error } = await supabaseClient
    .from('consorcios')
    .select('*, consorcio_participantes(*, clientes(nome)), consorcio_meses(*, consorcio_pagamentos(*, consorcio_participantes(*, clientes(nome))))')
    .eq('id', consorcioAtualId).single();
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }

  document.getElementById('detalhe-consorcio-nome').textContent = c.nome;
  document.getElementById('detalhe-consorcio-sub').textContent =
    `${formatarMoeda(c.valor_parcela)}/mês · início em ${new Date(c.mes_inicio + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · ${(c.consorcio_participantes || []).length} participantes`;

  const mesAtual = mesAtualDe(c);
  document.getElementById('consorcio-sem-mes').style.display = (!mesAtual && (c.consorcio_participantes || []).length === 0) ? 'block' : 'none';
  document.getElementById('consorcio-mes-conteudo').style.display = mesAtual ? 'block' : 'none';

  if (mesAtual) {
    document.getElementById('consorcio-mes-titulo').textContent =
      'Mês: ' + new Date(mesAtual.mes + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const tbody = document.getElementById('tabela-consorcio-participantes');
    const pagamentos = mesAtual.consorcio_pagamentos || [];
    tbody.innerHTML = pagamentos.map(pg => {
      const part = pg.consorcio_participantes;
      const nome = part && part.clientes ? part.clientes.nome : '—';
      return `
        <tr>
          <td>${nome}</td>
          <td>${part.sorteado ? '<span class="selo ativo">Já sorteado</span>' : '<span class="selo inativo">Concorre</span>'}</td>
          <td><input type="checkbox" ${pg.pago ? 'checked' : ''} onchange="alternarPagamentoConsorcio('${pg.id}', this.checked)"></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="3" style="text-align:center; color:var(--texto-suave); padding:16px;">Nenhum participante ainda</td></tr>';

    const select = document.getElementById('consorcio-select-sorteado');
    const elegiveis = (c.consorcio_participantes || []).filter(p => !p.sorteado);
    select.innerHTML = elegiveis.length
      ? elegiveis.map(p => `<option value="${p.id}">${p.clientes ? p.clientes.nome : '—'}</option>`).join('')
      : '<option value="">Todos já foram sorteados</option>';
  }

  // Histórico: meses fechados
  const fechados = (c.consorcio_meses || []).filter(m => m.fechado).sort((a, b) => b.mes.localeCompare(a.mes));
  const tbodyHist = document.getElementById('tabela-consorcio-historico');
  tbodyHist.innerHTML = fechados.length
    ? fechados.map(m => {
        const sorteadoPart = (c.consorcio_participantes || []).find(p => p.id === m.participante_sorteado_id);
        const nomeSorteado = sorteadoPart && sorteadoPart.clientes ? sorteadoPart.clientes.nome : '—';
        const pagos = (m.consorcio_pagamentos || []).filter(p => p.pago).length;
        const totalPart = (m.consorcio_pagamentos || []).length;
        const mesFmt = new Date(m.mes + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const dataSorteioFmt = m.data_sorteio ? new Date(m.data_sorteio + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
        return `<tr><td>${mesFmt}</td><td><strong>${nomeSorteado}</strong></td><td>${dataSorteioFmt}</td><td>${pagos}/${totalPart} pagaram</td></tr>`;
      }).join('')
    : '<tr><td colspan="4" style="text-align:center; color:var(--texto-suave); padding:16px;">Nenhum mês fechado ainda</td></tr>';

  window._consorcioAtualCache = c;
}

function alternarAbaConsorcio(aba) {
  document.getElementById('aba-consorcio-mes-atual').style.display = aba === 'mes-atual' ? 'block' : 'none';
  document.getElementById('aba-consorcio-historico').style.display = aba === 'historico' ? 'block' : 'none';
  document.querySelectorAll('#modal-consorcio-detalhe .sub-aba').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
}

async function alternarPagamentoConsorcio(pagamentoId, pago) {
  const { error } = await supabaseClient.from('consorcio_pagamentos').update({
    pago, pago_em: pago ? new Date().toISOString().slice(0, 10) : null
  }).eq('id', pagamentoId);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  await recarregarDetalheConsorcio();
  await carregarConsorcios();
}

// ---- Adicionar participante ----
document.getElementById('btn-add-participante-consorcio').addEventListener('click', () => {
  const c = window._consorcioAtualCache;
  const jaParticipam = new Set((c.consorcio_participantes || []).map(p => p.cliente_id));
  const select = document.getElementById('participante-cliente');
  select.innerHTML = listaClientes
    .filter(cl => !jaParticipam.has(cl.id))
    .map(cl => `<option value="${cl.id}">${cl.nome}</option>`).join('');
  if (!select.innerHTML) select.innerHTML = '<option value="">Todos os clientes já participam</option>';
  document.getElementById('modal-add-participante').classList.add('ativo');
});

document.getElementById('form-add-participante').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clienteId = document.getElementById('participante-cliente').value;
  if (!clienteId) { mostrarToast('Selecione um cliente.', 'erro'); return; }

  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Adicionando...');

  const { data: participante, error } = await supabaseClient
    .from('consorcio_participantes')
    .insert({ consorcio_id: consorcioAtualId, cliente_id: clienteId })
    .select().single();

  if (error) { destravarBotao(botao); mostrarToast(traduzErroBanco(error), 'erro'); return; }

  // Garante que exista um mês aberto; se não existir, cria o mês de início do consórcio
  const c = window._consorcioAtualCache;
  let mesAtual = mesAtualDe(c);
  if (!mesAtual) {
    const { data: novoMes } = await supabaseClient
      .from('consorcio_meses').insert({ consorcio_id: consorcioAtualId, mes: c.mes_inicio }).select().single();
    mesAtual = novoMes;
  }
  // Cria o lançamento de pagamento deste participante para o mês aberto atual
  await supabaseClient.from('consorcio_pagamentos').insert({ mes_id: mesAtual.id, participante_id: participante.id });

  destravarBotao(botao);
  document.getElementById('modal-add-participante').classList.remove('ativo');
  mostrarToast('Participante adicionado.', 'sucesso');
  await recarregarDetalheConsorcio();
  await carregarConsorcios();
});

// ---- Sortear e fechar mês ----
document.getElementById('btn-fechar-mes-consorcio').addEventListener('click', async () => {
  const sorteadoId = document.getElementById('consorcio-select-sorteado').value;
  if (!sorteadoId) { mostrarToast('Selecione quem foi sorteado neste mês.', 'erro'); return; }
  if (!(await confirmarAcao('Fechar este mês com o sorteio selecionado? O próximo mês será aberto automaticamente.', 'Fechar mês'))) return;

  const c = window._consorcioAtualCache;
  const mesAtual = mesAtualDe(c);
  if (!mesAtual) return;

  const hoje = new Date().toISOString().slice(0, 10);
  await supabaseClient.from('consorcio_meses').update({
    fechado: true, participante_sorteado_id: sorteadoId, data_sorteio: hoje
  }).eq('id', mesAtual.id);

  await supabaseClient.from('consorcio_participantes').update({
    sorteado: true, mes_sorteado: mesAtual.mes
  }).eq('id', sorteadoId);

  await abrirProximoMesConsorcio(c, mesAtual.mes);

  mostrarToast('Mês fechado e próximo mês aberto.', 'sucesso');
  await recarregarDetalheConsorcio();
  await carregarConsorcios();
});

async function abrirProximoMesConsorcio(consorcio, mesReferencia) {
  const proximoMes = new Date(mesReferencia + 'T00:00:00');
  proximoMes.setMonth(proximoMes.getMonth() + 1);
  const proximoMesStr = proximoMes.toISOString().slice(0, 10);

  const { data: novoMes, error } = await supabaseClient
    .from('consorcio_meses').insert({ consorcio_id: consorcio.id, mes: proximoMesStr }).select().single();
  if (error) return; // já existe (ex: gerado por "meses anteriores") — sem problema

  const participantesAtuais = consorcio.consorcio_participantes || [];
  if (participantesAtuais.length > 0) {
    await supabaseClient.from('consorcio_pagamentos').insert(
      participantesAtuais.map(p => ({ mes_id: novoMes.id, participante_id: p.id }))
    );
  }
}

// ---- Gerar meses anteriores (catch-up de meses não fechados) ----
document.getElementById('btn-gerar-sorteios-anteriores').addEventListener('click', async () => {
  const c = window._consorcioAtualCache;
  const mesesExistentes = (c.consorcio_meses || []).map(m => m.mes).sort();
  const ultimoMes = mesesExistentes.length ? mesesExistentes[mesesExistentes.length - 1] : c.mes_inicio;

  const cursor = new Date(ultimoMes + 'T00:00:00');
  const hoje = new Date();
  const mesAtualCalendario = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  let criados = 0;

  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor < mesAtualCalendario) {
    const mesStr = cursor.toISOString().slice(0, 10);
    const { data: novoMes, error } = await supabaseClient
      .from('consorcio_meses').insert({ consorcio_id: consorcioAtualId, mes: mesStr }).select().single();
    if (!error && novoMes) {
      const participantesAtuais = c.consorcio_participantes || [];
      if (participantesAtuais.length > 0) {
        await supabaseClient.from('consorcio_pagamentos').insert(
          participantesAtuais.map(p => ({ mes_id: novoMes.id, participante_id: p.id }))
        );
      }
      criados++;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  mostrarToast(criados > 0 ? `${criados} mês(es) anteriores gerados — feche-os em ordem.` : 'Nenhum mês pendente para gerar.', 'sucesso');
  await recarregarDetalheConsorcio();
  await carregarConsorcios();
});

// ---- Relatório do consórcio (reaproveita cabeçalho/estilo A4 do Controle Individual) ----
async function gerarRelatorioConsorcio() {
  const empresa = await buscarDadosEmpresaRelatorio();
  const c = window._consorcioAtualCache;
  if (!c) return;

  const linhasHistorico = (c.consorcio_meses || [])
    .filter(m => m.fechado)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => {
      const sorteadoPart = (c.consorcio_participantes || []).find(p => p.id === m.participante_sorteado_id);
      const nomeSorteado = sorteadoPart && sorteadoPart.clientes ? sorteadoPart.clientes.nome : '—';
      const pagos = (m.consorcio_pagamentos || []).filter(p => p.pago).length;
      const totalPart = (m.consorcio_pagamentos || []).length;
      const mesFmt = new Date(m.mes + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const dataSorteioFmt = m.data_sorteio ? new Date(m.data_sorteio + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      return `<tr><td>${mesFmt}</td><td>${nomeSorteado}</td><td>${dataSorteioFmt}</td><td>${pagos}/${totalPart}</td></tr>`;
    }).join('');

  const linhasParticipantes = (c.consorcio_participantes || []).map(p => `
    <tr><td>${p.clientes ? p.clientes.nome : '—'}</td><td>${p.sorteado ? 'Já sorteado' : 'Concorre'}</td>
    <td>${p.mes_sorteado ? new Date(p.mes_sorteado + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—'}</td></tr>
  `).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Consórcio — ${c.nome}</title><style>${estiloRelatorio}</style></head>
    <body>
      ${cabecalhoRelatorio(empresa, `Consórcio: ${c.nome} · ${formatarMoeda(c.valor_parcela)}/mês · ${(c.consorcio_participantes || []).length} participantes`)}
      <div class="bloco-pedido">
        <h3>Participantes</h3>
        <table><thead><tr><th>Nome</th><th>Situação</th><th>Mês sorteado</th></tr></thead><tbody>${linhasParticipantes}</tbody></table>
      </div>
      <div class="bloco-pedido">
        <h3>Histórico de sorteios</h3>
        <table><thead><tr><th>Mês</th><th>Sorteado</th><th>Data sorteio</th><th>Pagamentos</th></tr></thead>
        <tbody>${linhasHistorico || '<tr><td colspan="4" style="color:#8C8778;">Nenhum mês fechado ainda</td></tr>'}</tbody></table>
      </div>
    </body></html>`;
  abrirJanelaRelatorio(html);
}
