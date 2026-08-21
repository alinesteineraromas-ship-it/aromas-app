let listaCompras = [];
let itensCompraAtual = [];

async function carregarCompras() {
  mostrarCarregando('tabela-compras', 6);
  const { data, error } = await supabaseClient
    .from('compras')
    .select('*, fornecedores(nome), compra_itens(id)')
    .order('data_entrada', { ascending: false });
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaCompras = data;
  renderizarCompras();
}

function renderizarCompras() {
  const tbody = document.getElementById('tabela-compras');
  const vazio = document.getElementById('vazio-compras');
  tbody.innerHTML = '';
  vazio.style.display = listaCompras.length === 0 ? 'block' : 'none';

  listaCompras.forEach(c => {
    const tr = document.createElement('tr');
    const dataFmt = new Date(c.data_entrada + 'T00:00:00').toLocaleDateString('pt-BR');
    const qtdItens = (c.compra_itens || []).length;
    tr.innerHTML = `
      <td>${dataFmt}</td>
      <td>${c.fornecedores ? c.fornecedores.nome : '—'}</td>
      <td>${c.numero_nf || '—'}</td>
      <td>${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'}</td>
      <td>${formatarMoeda(c.valor_total)}</td>
      <td><div class="acoes-linha"><button onclick="excluirCompra('${c.id}')">Excluir</button></div></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('btn-nova-compra').addEventListener('click', () => {
  document.getElementById('form-compra').reset();
  document.getElementById('compra-data').value = new Date().toISOString().slice(0, 10);
  const select = document.getElementById('compra-fornecedor');
  select.innerHTML = '<option value="">Nenhum</option>';
  listaFornecedores.forEach(f => select.innerHTML += `<option value="${f.id}">${f.nome}</option>`);
  itensCompraAtual = [];
  adicionarLinhaItemCompra();
  document.getElementById('modal-compra').classList.add('ativo');
});

document.getElementById('btn-add-item-compra').addEventListener('click', adicionarLinhaItemCompra);

function adicionarLinhaItemCompra() {
  itensCompraAtual.push({ produto_id: '', quantidade: 1, valor_unitario: 0 });
  renderizarItensCompra();
}

function removerLinhaItemCompra(idx) {
  itensCompraAtual.splice(idx, 1);
  renderizarItensCompra();
}

function atualizarItemCompra(idx, campo, valor) {
  itensCompraAtual[idx][campo] = valor;
  if (campo === 'produto_id') {
    const prod = listaProdutos.find(p => p.id === valor);
    if (prod) itensCompraAtual[idx].valor_unitario = prod.valor_custo || 0;
  }
  renderizarItensCompra();
}

function renderizarItensCompra() {
  const container = document.getElementById('lista-itens-compra');
  container.innerHTML = '';
  let total = 0;

  itensCompraAtual.forEach((item, idx) => {
    total += (item.quantidade || 0) * (item.valor_unitario || 0);
    const opcoes = listaProdutos.map(p => `<option value="${p.id}" ${p.id === item.produto_id ? 'selected' : ''}>${p.nome}</option>`).join('');

    const linha = document.createElement('div');
    linha.style.cssText = 'display:grid; grid-template-columns: 2fr 70px 90px 30px; gap:8px; margin-bottom:8px; align-items:center;';
    linha.innerHTML = `
      <select style="padding:9px; border:1px solid var(--borda); border-radius:6px; font-family:'Jost',sans-serif; font-size:13px;" onchange="atualizarItemCompra(${idx}, 'produto_id', this.value)">
        <option value="">Produto...</option>${opcoes}
      </select>
      <input type="number" min="0.01" step="0.01" value="${item.quantidade}" style="padding:9px; border:1px solid var(--borda); border-radius:6px; font-size:13px;" onchange="atualizarItemCompra(${idx}, 'quantidade', parseFloat(this.value)||0)">
      <input type="number" min="0" step="0.01" value="${item.valor_unitario}" style="padding:9px; border:1px solid var(--borda); border-radius:6px; font-size:13px;" onchange="atualizarItemCompra(${idx}, 'valor_unitario', parseFloat(this.value)||0)">
      <button type="button" onclick="removerLinhaItemCompra(${idx})" style="border:none; background:none; color:var(--erro); cursor:pointer; font-size:16px;">×</button>
    `;
    container.appendChild(linha);
  });

  document.getElementById('compra-total-preview').textContent = formatarMoeda(total);
}

document.getElementById('form-compra').addEventListener('submit', async (e) => {
  e.preventDefault();
  const itensValidos = itensCompraAtual.filter(i => i.produto_id && i.quantidade > 0);
  if (itensValidos.length === 0) { mostrarToast('Adicione ao menos um item válido.', 'erro'); return; }

  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const payloadCompra = {
    fornecedor_id: document.getElementById('compra-fornecedor').value || null,
    data_entrada: document.getElementById('compra-data').value,
    numero_nf: document.getElementById('compra-nf').value.trim() || null,
    observacao: document.getElementById('compra-observacao').value.trim() || null
  };

  const resultado = await supabaseClient.from('compras').insert(payloadCompra).select().single();
  if (resultado.error) { destravarBotao(botao); mostrarToast(traduzErroBanco(resultado.error), 'erro'); return; }

  const itensParaInserir = itensValidos.map(i => ({
    compra_id: resultado.data.id, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario
  }));
  const { error: erroItens } = await supabaseClient.from('compra_itens').insert(itensParaInserir);

  destravarBotao(botao);
  if (erroItens) { mostrarToast(traduzErroBanco(erroItens), 'erro'); return; }

  document.getElementById('modal-compra').classList.remove('ativo');
  mostrarToast('Compra registrada — estoque atualizado.', 'sucesso');
  await carregarProdutos();
  await carregarCompras();
});

async function excluirCompra(id) {
  if (!(await confirmarAcao('Excluir esta compra? O estoque adicionado por ela será revertido.'))) return;
  const { error } = await supabaseClient.from('compras').delete().eq('id', id);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  mostrarToast('Compra excluída.', 'sucesso');
  await carregarProdutos();
  carregarCompras();
}
