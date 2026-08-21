let listaMovimentos = [];

async function carregarMovimentos() {
  mostrarCarregando('tabela-estoque', 6);
  const { data, error } = await supabaseClient
    .from('estoque_movimentos')
    .select('*, produtos(nome), clientes(nome)')
    .order('data', { ascending: false })
    .limit(200);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaMovimentos = data;
  renderizarMovimentos();
}

function renderizarMovimentos() {
  const tbody = document.getElementById('tabela-estoque');
  const vazio = document.getElementById('vazio-estoque');
  tbody.innerHTML = '';
  vazio.style.display = listaMovimentos.length === 0 ? 'block' : 'none';

  const rotulos = { entrada: 'Entrada', ajuste: 'Ajuste', saida: 'Saída (pedido)' };

  listaMovimentos.forEach(m => {
    const tr = document.createElement('tr');
    const dataFmt = new Date(m.data).toLocaleDateString('pt-BR');
    tr.innerHTML = `
      <td>${dataFmt}</td>
      <td>${m.produtos ? m.produtos.nome : '—'}</td>
      <td>${rotulos[m.tipo] || m.tipo}</td>
      <td>${m.quantidade > 0 ? '+' : ''}${m.quantidade}</td>
      <td>${m.valor_unitario ? formatarMoeda(m.valor_unitario) : '—'}</td>
      <td>${m.clientes ? m.clientes.nome : '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function popularSelectProdutos(idSelect) {
  const select = document.getElementById(idSelect);
  select.innerHTML = '<option value="">Selecione...</option>';
  listaProdutos.forEach(p => select.innerHTML += `<option value="${p.id}">${p.nome}</option>`);
}

function popularSelectClientes(idSelect, comOpcaoNenhum) {
  const select = document.getElementById(idSelect);
  select.innerHTML = comOpcaoNenhum ? '<option value="">Nenhum</option>' : '<option value="">Selecione...</option>';
  listaClientes.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
}

document.getElementById('btn-novo-movimento').addEventListener('click', () => {
  document.getElementById('form-movimento').reset();
  popularSelectProdutos('movimento-produto');
  popularSelectClientes('movimento-cliente', true);
  document.getElementById('modal-movimento').classList.add('ativo');
});

document.getElementById('form-movimento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Registrando...');
  const payload = {
    produto_id: document.getElementById('movimento-produto').value,
    tipo: document.getElementById('movimento-tipo').value,
    quantidade: parseFloat(document.getElementById('movimento-quantidade').value),
    valor_unitario: parseFloat(document.getElementById('movimento-valor').value) || null,
    cliente_id: document.getElementById('movimento-cliente').value || null,
    observacao: document.getElementById('movimento-observacao').value.trim() || null
  };

  const { error } = await supabaseClient.from('estoque_movimentos').insert(payload);
  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }

  document.getElementById('modal-movimento').classList.remove('ativo');
  mostrarToast('Movimento registrado.', 'sucesso');
  await carregarProdutos();
  await carregarMovimentos();
});
