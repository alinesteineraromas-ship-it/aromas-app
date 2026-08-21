let listaCategorias = [];

async function carregarCategorias() {
  mostrarCarregando('tabela-categorias-produto', 2);
  mostrarCarregando('tabela-categorias-financeira', 2);
  const { data, error } = await supabaseClient.from('categorias').select('*').order('nome');
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaCategorias = data;
  renderizarCategorias();
}

function renderizarCategorias() {
  renderizarListaCategoria('produto', 'tabela-categorias-produto', 'vazio-categorias-produto');
  renderizarListaCategoria('financeira', 'tabela-categorias-financeira', 'vazio-categorias-financeira');
}

function renderizarListaCategoria(tipo, idTbody, idVazio) {
  const itens = listaCategorias.filter(c => c.tipo === tipo);
  const tbody = document.getElementById(idTbody);
  const vazio = document.getElementById(idVazio);
  tbody.innerHTML = '';
  vazio.style.display = itens.length === 0 ? 'block' : 'none';

  itens.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.nome}</strong></td>
      <td><div class="acoes-linha"><button onclick="excluirCategoria('${c.id}')">Excluir</button></div></td>
    `;
    tbody.appendChild(tr);
  });
}

function popularSelectCategorias(idSelect) {
  const select = document.getElementById(idSelect);
  if (!select) return;
  select.innerHTML = '<option value="">Nenhuma</option>';
  listaCategorias
    .filter(c => c.tipo === 'produto')
    .forEach(c => select.innerHTML += `<option value="${c.id}">${c.nome}</option>`);
}

document.getElementById('btn-nova-categoria').addEventListener('click', () => {
  document.getElementById('form-categoria').reset();
  document.getElementById('categoria-id').value = '';
  document.getElementById('modal-categoria').classList.add('ativo');
});

document.getElementById('form-categoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');
  const payload = {
    nome: document.getElementById('categoria-nome').value.trim(),
    tipo: document.getElementById('categoria-tipo').value
  };
  const { error } = await supabaseClient.from('categorias').insert(payload);
  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  document.getElementById('modal-categoria').classList.remove('ativo');
  mostrarToast('Categoria salva.', 'sucesso');
  carregarCategorias();
});

async function excluirCategoria(id) {
  if (!(await confirmarAcao('Excluir esta categoria?'))) return;
  const { error } = await supabaseClient.from('categorias').delete().eq('id', id);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  mostrarToast('Categoria excluída.', 'sucesso');
  carregarCategorias();
}
