// Controle Individual (clientes) — tudo no sistema parte daqui
let listaClientes = [];

const tabelaClientes = document.getElementById('tabela-clientes');
const vazioClientes = document.getElementById('vazio-clientes');
const modalCliente = document.getElementById('modal-cliente');
const formCliente = document.getElementById('form-cliente');
const erroModal = document.getElementById('erro-modal');
const modalTitulo = document.getElementById('modal-titulo');

async function carregarClientes() {
  mostrarCarregando('tabela-clientes', 6);
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('*')
    .order('nome', { ascending: true });

  if (error) {
    mostrarToast(traduzErroBanco(error), 'erro');
    return;
  }
  listaClientes = data;
  renderizarClientes(listaClientes);
}

function renderizarClientes(lista) {
  tabelaClientes.innerHTML = '';
  vazioClientes.style.display = lista.length === 0 ? 'block' : 'none';

  lista.forEach(c => {
    const tr = document.createElement('tr');
    const dataCadastro = new Date(c.criado_em).toLocaleDateString('pt-BR');
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.nome)}</strong></td>
      <td>${escapeHtml(c.documento || '—')}</td>
      <td>${escapeHtml(c.telefone || '—')}</td>
      <td><span class="selo ${c.status}">${c.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
      <td>${dataCadastro}</td>
      <td>
        <div class="acoes-linha">
          <button onclick="abrirEdicao('${c.id}')">Editar</button>
          <button onclick="excluirCliente('${c.id}')">Excluir</button>
        </div>
      </td>
    `;
    tabelaClientes.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Busca em tempo real (nome, documento, telefone)
document.getElementById('busca-cliente').addEventListener('input', (e) => {
  const termo = e.target.value.toLowerCase().trim();
  const filtrado = listaClientes.filter(c =>
    c.nome.toLowerCase().includes(termo) ||
    (c.documento || '').toLowerCase().includes(termo) ||
    (c.telefone || '').toLowerCase().includes(termo)
  );
  renderizarClientes(filtrado);
});

// Abrir modal — novo cliente
document.getElementById('btn-novo-cliente').addEventListener('click', () => {
  formCliente.reset();
  document.getElementById('cliente-id').value = '';
  modalTitulo.textContent = 'Novo cliente';
  erroModal.classList.remove('ativo');
  modalCliente.classList.add('ativo');
});

// Abrir modal — editar cliente existente
function abrirEdicao(id) {
  const c = listaClientes.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cliente-id').value = c.id;
  document.getElementById('cliente-nome').value = c.nome || '';
  document.getElementById('cliente-documento').value = c.documento || '';
  document.getElementById('cliente-telefone').value = c.telefone || '';
  document.getElementById('cliente-email').value = c.email || '';
  document.getElementById('cliente-endereco').value = c.endereco || '';
  document.getElementById('cliente-status').value = c.status || 'ativo';
  document.getElementById('cliente-observacao').value = c.observacao || '';
  modalTitulo.textContent = 'Editar cliente';
  erroModal.classList.remove('ativo');
  modalCliente.classList.add('ativo');
}

document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modalCliente.classList.remove('ativo');
});

// Salvar (criar ou atualizar)
formCliente.addEventListener('submit', async (e) => {
  e.preventDefault();
  erroModal.classList.remove('ativo');
  const botao = formCliente.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const id = document.getElementById('cliente-id').value;
  const payload = {
    nome: document.getElementById('cliente-nome').value.trim(),
    documento: document.getElementById('cliente-documento').value.trim() || null,
    telefone: document.getElementById('cliente-telefone').value.trim() || null,
    email: document.getElementById('cliente-email').value.trim() || null,
    endereco: document.getElementById('cliente-endereco').value.trim() || null,
    status: document.getElementById('cliente-status').value,
    observacao: document.getElementById('cliente-observacao').value.trim() || null,
    atualizado_em: new Date().toISOString()
  };

  let erro;
  if (id) {
    ({ error: erro } = await supabaseClient.from('clientes').update(payload).eq('id', id));
  } else {
    ({ error: erro } = await supabaseClient.from('clientes').insert(payload));
  }

  destravarBotao(botao);

  if (erro) {
    erroModal.textContent = traduzErroBanco(erro);
    erroModal.classList.add('ativo');
    return;
  }

  modalCliente.classList.remove('ativo');
  mostrarToast(id ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'sucesso');
  carregarClientes();
});

async function excluirCliente(id) {
  const c = listaClientes.find(x => x.id === id);
  if (!(await confirmarAcao(`Excluir o cliente "${c.nome}"? Essa ação não pode ser desfeita.`))) return;

  const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
  if (error) {
    mostrarToast(traduzErroBanco(error), 'erro');
    return;
  }
  mostrarToast('Cliente excluído.', 'sucesso');
  carregarClientes();
}

function exportarClientesCSV() {
  exportarCSV(listaClientes, [
    { rotulo: 'Nome', valor: 'nome' },
    { rotulo: 'Documento', valor: 'documento' },
    { rotulo: 'Telefone', valor: 'telefone' },
    { rotulo: 'E-mail', valor: 'email' },
    { rotulo: 'Endereço', valor: 'endereco' },
    { rotulo: 'Status', valor: 'status' },
    { rotulo: 'Cadastro', valor: c => new Date(c.criado_em).toLocaleDateString('pt-BR') }
  ], 'clientes');
}
