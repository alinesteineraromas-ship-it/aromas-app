// Controla login, sessão e recuperação de senha — autocadastro removido de propósito (item de segurança)
const telaLogin = document.getElementById('tela-login');
const appShell = document.getElementById('app-shell');
const formLogin = document.getElementById('form-login');
const erroLogin = document.getElementById('erro-login');
const btnEntrar = document.getElementById('btn-entrar');

const cardLogin = document.querySelector('#tela-login .login-card:not(#card-recuperar-senha):not(#card-nova-senha)');
const cardRecuperar = document.getElementById('card-recuperar-senha');
const cardNovaSenha = document.getElementById('card-nova-senha');

function mostrarErroLogin(msg) {
  erroLogin.textContent = msg;
  erroLogin.classList.add('ativo');
}
function limparErroLogin() {
  erroLogin.classList.remove('ativo');
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErroLogin();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;

  btnEntrar.disabled = true;
  btnEntrar.textContent = 'Entrando...';

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    entrarNoApp();
  } catch (err) {
    mostrarErroLogin(traduzErro(err.message));
  } finally {
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'Entrar';
  }
});

function traduzErro(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  return msg;
}

document.getElementById('btn-sair').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

function entrarNoApp() {
  telaLogin.style.display = 'none';
  appShell.style.display = 'flex';
  carregarEmpresa();
  irParaPagina('dashboard');
}

// ---- Alternar entre login / recuperar senha ----
document.getElementById('abrir-recuperar-senha').addEventListener('click', () => {
  cardLogin.style.display = 'none';
  cardRecuperar.style.display = 'block';
  document.getElementById('erro-recuperar').classList.remove('ativo');
  document.getElementById('sucesso-recuperar').classList.remove('ativo');
});

document.getElementById('voltar-login').addEventListener('click', () => {
  cardRecuperar.style.display = 'none';
  cardLogin.style.display = 'block';
});

// ---- Pedir link de redefinição por e-mail ----
document.getElementById('form-recuperar-senha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = document.getElementById('erro-recuperar');
  const sucessoEl = document.getElementById('sucesso-recuperar');
  erroEl.classList.remove('ativo');
  sucessoEl.classList.remove('ativo');

  const email = document.getElementById('recuperar-email').value.trim();
  const botao = document.getElementById('btn-enviar-recuperacao');
  botao.disabled = true;
  botao.textContent = 'Enviando...';

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    sucessoEl.textContent = 'Link enviado! Confira seu e-mail (inclusive a caixa de spam) e clique no link para criar a nova senha.';
    sucessoEl.classList.add('ativo');
  } catch (err) {
    erroEl.textContent = 'Não foi possível enviar o link. Confira o e-mail digitado e tente novamente.';
    erroEl.classList.add('ativo');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Enviar link de redefinição';
  }
});

// ---- Definir a nova senha (chega aqui pelo link do e-mail) ----
document.getElementById('form-nova-senha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const erroEl = document.getElementById('erro-nova-senha');
  erroEl.classList.remove('ativo');

  const novaSenha = document.getElementById('nova-senha').value;
  const confirmar = document.getElementById('confirmar-nova-senha').value;

  if (novaSenha !== confirmar) {
    erroEl.textContent = 'As senhas não coincidem.';
    erroEl.classList.add('ativo');
    return;
  }

  const botao = document.getElementById('btn-salvar-nova-senha');
  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });
    if (error) throw error;
    mostrarToast('Senha alterada com sucesso — já pode entrar.', 'sucesso');
    await supabaseClient.auth.signOut();
    cardNovaSenha.style.display = 'none';
    cardLogin.style.display = 'block';
    history.replaceState(null, '', window.location.pathname);
  } catch (err) {
    erroEl.textContent = 'Não foi possível salvar a nova senha. Peça um novo link e tente de novo.';
    erroEl.classList.add('ativo');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar nova senha';
  }
});

// Verifica se já existe sessão ativa, ou se chegamos aqui pelo link de redefinição de senha
(async () => {
  // O Supabase adiciona #access_token=...&type=recovery na URL ao clicar no link do e-mail
  if (window.location.hash.includes('type=recovery')) {
    cardLogin.style.display = 'none';
    cardRecuperar.style.display = 'none';
    cardNovaSenha.style.display = 'block';
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    entrarNoApp();
  }
})();
