// Traduz erros técnicos do banco em mensagens que fazem sentido pra você
function traduzErroBanco(error) {
  if (!error) return 'Algo deu errado. Tente novamente.';
  const msg = error.message || '';
  const codigo = error.code || '';

  if (codigo === '23503' || msg.includes('foreign key')) {
    return 'Não é possível excluir — este registro está sendo usado em outro lugar do sistema (pedido, produto, movimento etc).';
  }
  if (codigo === '23505' || msg.includes('duplicate key')) {
    return 'Já existe um registro igual a este.';
  }
  if (codigo === '23514' || msg.includes('violates check constraint')) {
    return 'Um dos campos preenchidos não é válido. Confira os valores.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Sem conexão com o banco. Verifique sua internet e tente de novo.';
  }
  if (msg.includes('JWT') || msg.includes('session')) {
    return 'Sua sessão expirou. Saia e entre novamente.';
  }
  return 'Não foi possível concluir. Tente novamente em instantes.';
}

// Mostra uma linha "carregando" numa tabela enquanto os dados chegam
function mostrarCarregando(idTbody, colunas) {
  const tbody = document.getElementById(idTbody);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colunas}" style="text-align:center; padding:32px; color:var(--texto-suave);">Carregando...</td></tr>`;
}

// Toast simples de feedback no canto da tela (sucesso/erro), sem travar a interface
function mostrarToast(texto, tipo) {
  let toast = document.getElementById('toast-flutuante');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-flutuante';
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:200;
      padding:13px 20px; border-radius:8px; font-family:'Jost',sans-serif; font-size:14px;
      box-shadow:0 8px 24px rgba(0,0,0,0.15); transition:opacity 0.25s, transform 0.25s;
      opacity:0; transform:translateY(8px);
    `;
    document.body.appendChild(toast);
  }
  const cores = {
    sucesso: { bg: '#5C6B54', cor: '#fff' },
    erro: { bg: '#A85A47', cor: '#fff' }
  };
  const c = cores[tipo] || cores.sucesso;
  toast.style.background = c.bg;
  toast.style.color = c.cor;
  toast.textContent = texto;
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, 3200);
}

// Trava/destrava um botão de formulário mostrando texto de progresso
function travarBotao(botao, textoProgresso) {
  botao.dataset.textoOriginal = botao.textContent;
  botao.textContent = textoProgresso;
  botao.disabled = true;
}
function destravarBotao(botao) {
  botao.textContent = botao.dataset.textoOriginal || botao.textContent;
  botao.disabled = false;
}

// Exporta uma lista de objetos para CSV e baixa o arquivo
function exportarCSV(dados, colunas, nomeArquivo) {
  if (!dados || dados.length === 0) {
    mostrarToast('Nada para exportar ainda.', 'erro');
    return;
  }
  const cabecalho = colunas.map(c => `"${c.rotulo}"`).join(';');
  const linhas = dados.map(item =>
    colunas.map(c => {
      let valor = typeof c.valor === 'function' ? c.valor(item) : item[c.valor];
      if (valor === null || valor === undefined) valor = '';
      return `"${String(valor).replace(/"/g, '""')}"`;
    }).join(';')
  );
  const csv = '\uFEFF' + [cabecalho, ...linhas].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${nomeArquivo}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  mostrarToast('CSV exportado.', 'sucesso');
}

// Modal de confirmação estilizado — substitui o confirm() feio do navegador.
// Uso: if (!(await confirmarAcao('Excluir este item?'))) return;
function confirmarAcao(mensagem, textoBotao) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-confirmar');
    const btnSim = document.getElementById('btn-confirmar-sim');
    const btnNao = document.getElementById('btn-confirmar-nao');
    document.getElementById('confirmar-mensagem').textContent = mensagem;
    btnSim.textContent = textoBotao || 'Confirmar';
    modal.classList.add('ativo');

    function limpar(valor) {
      modal.classList.remove('ativo');
      btnSim.removeEventListener('click', onSim);
      btnNao.removeEventListener('click', onNao);
      document.removeEventListener('keydown', onTecla);
      modal.removeEventListener('click', onCliqueForaDele);
      resolve(valor);
    }
    function onSim() { limpar(true); }
    function onNao() { limpar(false); }
    function onTecla(e) { if (e.key === 'Escape') limpar(false); }
    function onCliqueForaDele(e) { if (e.target === modal) limpar(false); }

    btnSim.addEventListener('click', onSim);
    btnNao.addEventListener('click', onNao);
    document.addEventListener('keydown', onTecla);
    modal.addEventListener('click', onCliqueForaDele);
  });
}

// Fecha qualquer modal clicando fora dele ou pressionando ESC
// (modal-confirmar fica de fora — ele resolve sua própria Promise via clique/ESC internos)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-fundo') && e.target.classList.contains('ativo') && e.target.id !== 'modal-confirmar') {
    e.target.classList.remove('ativo');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-fundo.ativo').forEach(m => {
      if (m.id !== 'modal-confirmar') m.classList.remove('ativo');
    });
  }
});
