let listaProdutos = [];

async function carregarProdutos() {
  mostrarCarregando('tabela-produtos', 8);
  const { data, error } = await supabaseClient
    .from('produtos')
    .select('*, categorias(nome), fornecedores(nome)')
    .order('nome');
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaProdutos = data;
  renderizarProdutos(listaProdutos);
}

function formatarMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderizarProdutos(lista) {
  const tbody = document.getElementById('tabela-produtos');
  const vazio = document.getElementById('vazio-produtos');
  tbody.innerHTML = '';
  vazio.style.display = lista.length === 0 ? 'block' : 'none';

  lista.forEach(p => {
    const tr = document.createElement('tr');
    const validade = p.validade ? new Date(p.validade + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const img = p.imagem_url
      ? `<img src="${p.imagem_url}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;">`
      : `<div style="width:36px;height:36px;border-radius:6px;background:var(--marrom-claro);"></div>`;
    tr.innerHTML = `
      <td>${img}</td>
      <td><strong>${p.nome}</strong></td>
      <td>${p.unidade || '—'}</td>
      <td>${formatarMoeda(p.valor_custo)}</td>
      <td>${formatarMoeda(p.valor_venda)}</td>
      <td>${p.quantidade ?? 0}</td>
      <td>${validade}</td>
      <td><div class="acoes-linha">
        <button onclick="abrirEdicaoProduto('${p.id}')">Editar</button>
        <button onclick="excluirProduto('${p.id}')">Excluir</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('busca-produto').addEventListener('input', (e) => {
  const termo = e.target.value.toLowerCase();
  renderizarProdutos(listaProdutos.filter(p => p.nome.toLowerCase().includes(termo)));
});

document.getElementById('btn-novo-produto').addEventListener('click', () => {
  document.getElementById('form-produto').reset();
  document.getElementById('produto-id').value = '';
  document.getElementById('produto-imagem-preview').style.display = 'none';
  document.getElementById('modal-produto-titulo').textContent = 'Novo produto';
  document.getElementById('modal-produto').classList.add('ativo');
});

function abrirEdicaoProduto(id) {
  const p = listaProdutos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('produto-id').value = p.id;
  document.getElementById('produto-nome').value = p.nome || '';
  document.getElementById('produto-unidade').value = p.unidade || '';
  document.getElementById('produto-quantidade').value = p.quantidade || 0;
  document.getElementById('produto-custo').value = p.valor_custo || 0;
  document.getElementById('produto-venda').value = p.valor_venda || 0;
  document.getElementById('produto-validade').value = p.validade || '';
  document.getElementById('produto-categoria').value = p.categoria_id || '';
  document.getElementById('produto-fornecedor').value = p.fornecedor_id || '';
  document.getElementById('produto-observacao').value = p.observacao || '';
  const preview = document.getElementById('produto-imagem-preview');
  if (p.imagem_url) { preview.src = p.imagem_url; preview.style.display = 'block'; }
  else preview.style.display = 'none';
  document.getElementById('modal-produto-titulo').textContent = 'Editar produto';
  document.getElementById('modal-produto').classList.add('ativo');
}

async function enviarImagemProduto(arquivo) {
  const nomeArquivo = `${Date.now()}_${arquivo.name}`;
  const { error } = await supabaseClient.storage.from('produtos').upload(nomeArquivo, arquivo);
  if (error) { console.error(error); return null; }
  const { data } = supabaseClient.storage.from('produtos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

function caminhoDaUrlPublica(url) {
  if (!url) return null;
  const partes = url.split('/produtos/');
  return partes[1] || null;
}

async function removerImagemProduto(url) {
  const caminho = caminhoDaUrlPublica(url);
  if (!caminho) return;
  await supabaseClient.storage.from('produtos').remove([caminho]);
}

document.getElementById('form-produto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const id = document.getElementById('produto-id').value;
  const arquivoImagem = document.getElementById('produto-imagem').files[0];
  const produtoExistente = id ? listaProdutos.find(p => p.id === id) : null;

  let imagemUrl = null;
  if (arquivoImagem) {
    imagemUrl = await enviarImagemProduto(arquivoImagem);
    // Troquei a foto — a antiga fica órfã no Storage se eu não remover
    if (imagemUrl && produtoExistente && produtoExistente.imagem_url) {
      await removerImagemProduto(produtoExistente.imagem_url);
    }
  }

  const payload = {
    nome: document.getElementById('produto-nome').value.trim(),
    unidade: document.getElementById('produto-unidade').value.trim() || null,
    quantidade: parseFloat(document.getElementById('produto-quantidade').value) || 0,
    valor_custo: parseFloat(document.getElementById('produto-custo').value) || 0,
    valor_venda: parseFloat(document.getElementById('produto-venda').value) || 0,
    validade: document.getElementById('produto-validade').value || null,
    categoria_id: document.getElementById('produto-categoria').value || null,
    fornecedor_id: document.getElementById('produto-fornecedor').value || null,
    observacao: document.getElementById('produto-observacao').value.trim() || null,
    atualizado_em: new Date().toISOString()
  };
  if (imagemUrl) payload.imagem_url = imagemUrl;

  const { error } = id
    ? await supabaseClient.from('produtos').update(payload).eq('id', id)
    : await supabaseClient.from('produtos').insert(payload);

  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  document.getElementById('modal-produto').classList.remove('ativo');
  mostrarToast('Produto salvo.', 'sucesso');
  carregarProdutos();
});

async function excluirProduto(id) {
  if (!(await confirmarAcao('Excluir este produto?'))) return;
  const produto = listaProdutos.find(p => p.id === id);
  const { error } = await supabaseClient.from('produtos').delete().eq('id', id);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  if (produto && produto.imagem_url) await removerImagemProduto(produto.imagem_url);
  mostrarToast('Produto excluído.', 'sucesso');
  carregarProdutos();
}


// ---- Aba "Mais movimentados" ----
function alternarAbaProdutos(aba) {
  document.getElementById('aba-produtos-lista').style.display = aba === 'lista' ? 'block' : 'none';
  document.getElementById('aba-produtos-movimentados').style.display = aba === 'movimentados' ? 'block' : 'none';
  document.querySelectorAll('#pagina-produtos .sub-aba').forEach(b => b.classList.toggle('ativo', b.dataset.aba === aba));
  if (aba === 'movimentados') carregarProdutosMovimentados();
}

async function carregarProdutosMovimentados() {
  mostrarCarregando('tabela-produtos-movimentados', 5);
  const { data, error } = await supabaseClient
    .from('estoque_movimentos')
    .select('produto_id, tipo, quantidade, produtos(nome, quantidade)');
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }

  const porProduto = {};
  data.forEach(m => {
    const nome = m.produtos ? m.produtos.nome : 'Produto removido';
    porProduto[nome] = porProduto[nome] || { entradas: 0, saidas: 0, saldo: m.produtos ? m.produtos.quantidade : 0 };
    if (m.tipo === 'entrada' || (m.tipo === 'ajuste' && m.quantidade > 0)) porProduto[nome].entradas += Math.abs(Number(m.quantidade));
    if (m.tipo === 'saida' || (m.tipo === 'ajuste' && m.quantidade < 0)) porProduto[nome].saidas += Math.abs(Number(m.quantidade));
  });

  const entradas = Object.entries(porProduto).sort((a, b) => (b[1].entradas + b[1].saidas) - (a[1].entradas + a[1].saidas));
  const tbody = document.getElementById('tabela-produtos-movimentados');
  const vazio = document.getElementById('vazio-produtos-movimentados');
  tbody.innerHTML = '';
  vazio.style.display = entradas.length === 0 ? 'block' : 'none';

  entradas.forEach(([nome, d]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${nome}</strong></td>
      <td style="color:var(--verde-oliva-escuro);">+${d.entradas}</td>
      <td style="color:var(--erro);">-${d.saidas}</td>
      <td>${d.entradas + d.saidas}</td>
      <td>${d.saldo}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportarProdutosCSV() {
  exportarCSV(listaProdutos, [
    { rotulo: 'Nome', valor: 'nome' },
    { rotulo: 'Unidade', valor: 'unidade' },
    { rotulo: 'Custo', valor: p => Number(p.valor_custo).toFixed(2) },
    { rotulo: 'Venda', valor: p => Number(p.valor_venda).toFixed(2) },
    { rotulo: 'Quantidade', valor: 'quantidade' },
    { rotulo: 'Validade', valor: p => p.validade ? new Date(p.validade + 'T00:00:00').toLocaleDateString('pt-BR') : '' },
    { rotulo: 'Categoria', valor: p => p.categorias ? p.categorias.nome : '' },
    { rotulo: 'Fornecedor', valor: p => p.fornecedores ? p.fornecedores.nome : '' }
  ], 'produtos');
}
