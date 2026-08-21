let listaFornecedores = [];

async function carregarFornecedores() {
  mostrarCarregando('tabela-fornecedores', 4);
  const { data, error } = await supabaseClient
    .from('fornecedores')
    .select('*')
    .order('nome');
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  listaFornecedores = data;
  renderizarFornecedores(listaFornecedores);
}

function renderizarFornecedores(lista) {
  const tbody = document.getElementById('tabela-fornecedores');
  const vazio = document.getElementById('vazio-fornecedores');
  tbody.innerHTML = '';
  vazio.style.display = lista.length === 0 ? 'block' : 'none';

  lista.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${f.nome}</strong></td>
      <td>${f.contato || '—'}</td>
      <td>${f.telefone || '—'}</td>
      <td><div class="acoes-linha">
        <button onclick="abrirEdicaoFornecedor('${f.id}')">Editar</button>
        <button onclick="excluirFornecedor('${f.id}')">Excluir</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('busca-fornecedor').addEventListener('input', (e) => {
  const termo = e.target.value.toLowerCase();
  renderizarFornecedores(listaFornecedores.filter(f => f.nome.toLowerCase().includes(termo)));
});

document.getElementById('btn-novo-fornecedor').addEventListener('click', () => {
  document.getElementById('form-fornecedor').reset();
  document.getElementById('fornecedor-id').value = '';
  document.getElementById('modal-fornecedor-titulo').textContent = 'Novo fornecedor';
  document.getElementById('modal-fornecedor').classList.add('ativo');
});

function abrirEdicaoFornecedor(id) {
  const f = listaFornecedores.find(x => x.id === id);
  if (!f) return;
  document.getElementById('fornecedor-id').value = f.id;
  document.getElementById('fornecedor-nome').value = f.nome || '';
  document.getElementById('fornecedor-contato').value = f.contato || '';
  document.getElementById('fornecedor-telefone').value = f.telefone || '';
  document.getElementById('fornecedor-email').value = f.email || '';
  document.getElementById('modal-fornecedor-titulo').textContent = 'Editar fornecedor';
  document.getElementById('modal-fornecedor').classList.add('ativo');
}

document.getElementById('form-fornecedor').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');
  const id = document.getElementById('fornecedor-id').value;
  const payload = {
    nome: document.getElementById('fornecedor-nome').value.trim(),
    contato: document.getElementById('fornecedor-contato').value.trim() || null,
    telefone: document.getElementById('fornecedor-telefone').value.trim() || null,
    email: document.getElementById('fornecedor-email').value.trim() || null
  };

  const { error } = id
    ? await supabaseClient.from('fornecedores').update(payload).eq('id', id)
    : await supabaseClient.from('fornecedores').insert(payload);

  destravarBotao(botao);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  document.getElementById('modal-fornecedor').classList.remove('ativo');
  mostrarToast('Fornecedor salvo.', 'sucesso');
  carregarFornecedores();
});

async function excluirFornecedor(id) {
  if (!(await confirmarAcao('Excluir este fornecedor?'))) return;
  const { error } = await supabaseClient.from('fornecedores').delete().eq('id', id);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  mostrarToast('Fornecedor excluído.', 'sucesso');
  carregarFornecedores();
}

function popularSelectFornecedores(idSelect) {
  const select = document.getElementById(idSelect);
  if (!select) return;
  select.innerHTML = '<option value="">Nenhum</option>';
  listaFornecedores.forEach(f => select.innerHTML += `<option value="${f.id}">${f.nome}</option>`);
}
