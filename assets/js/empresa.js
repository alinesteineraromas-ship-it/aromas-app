// Empresa é um registro único (dados da Aline)
let dadosEmpresaAtual = null;

async function carregarEmpresa() {
  const { data, error } = await supabaseClient.from('empresa').select('*').limit(1).maybeSingle();
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return; }
  if (data) {
    dadosEmpresaAtual = data;
    document.getElementById('empresa-id').value = data.id;
    document.getElementById('empresa-razao').value = data.razao_social || '';
    document.getElementById('empresa-fantasia').value = data.nome_fantasia || '';
    document.getElementById('empresa-cnpj').value = data.cnpj || '';
    document.getElementById('empresa-telefone').value = data.telefone || '';
    document.getElementById('empresa-email').value = data.email || '';
    document.getElementById('empresa-endereco').value = data.endereco || '';
    aplicarLogoEmpresa(data.logo_url);
  }
}

function aplicarLogoEmpresa(url) {
  const preview = document.getElementById('empresa-logo-preview');
  const sidebarLogo = document.getElementById('sidebar-logo');
  if (url) {
    preview.src = url; preview.style.display = 'block';
    sidebarLogo.src = url; sidebarLogo.style.display = 'inline-block';
  } else {
    preview.style.display = 'none';
    sidebarLogo.style.display = 'none';
  }
}

async function enviarLogoEmpresa(arquivo) {
  const nomeArquivo = `logo_${Date.now()}_${arquivo.name}`;
  const { error } = await supabaseClient.storage.from('empresa').upload(nomeArquivo, arquivo);
  if (error) { mostrarToast(traduzErroBanco(error), 'erro'); return null; }
  const { data } = supabaseClient.storage.from('empresa').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

document.getElementById('form-empresa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button[type="submit"]');
  travarBotao(botao, 'Salvando...');

  const arquivoLogo = document.getElementById('empresa-logo').files[0];
  let logoUrl = null;
  if (arquivoLogo) {
    logoUrl = await enviarLogoEmpresa(arquivoLogo);
    if (logoUrl && dadosEmpresaAtual && dadosEmpresaAtual.logo_url) {
      const caminhoAntigo = dadosEmpresaAtual.logo_url.split('/empresa/')[1];
      if (caminhoAntigo) await supabaseClient.storage.from('empresa').remove([caminhoAntigo]);
    }
  }

  const id = document.getElementById('empresa-id').value;
  const payload = {
    razao_social: document.getElementById('empresa-razao').value.trim(),
    nome_fantasia: document.getElementById('empresa-fantasia').value.trim() || null,
    cnpj: document.getElementById('empresa-cnpj').value.trim() || null,
    telefone: document.getElementById('empresa-telefone').value.trim() || null,
    email: document.getElementById('empresa-email').value.trim() || null,
    endereco: document.getElementById('empresa-endereco').value.trim() || null,
    atualizado_em: new Date().toISOString()
  };
  if (logoUrl) payload.logo_url = logoUrl;

  let erro;
  if (id) {
    ({ error: erro } = await supabaseClient.from('empresa').update(payload).eq('id', id));
  } else {
    const resultado = await supabaseClient.from('empresa').insert(payload).select().single();
    erro = resultado.error;
    if (resultado.data) document.getElementById('empresa-id').value = resultado.data.id;
  }

  destravarBotao(botao);

  if (erro) { mostrarToast(traduzErroBanco(erro), 'erro'); return; }
  if (logoUrl) aplicarLogoEmpresa(logoUrl);
  dadosEmpresaAtual = { ...(dadosEmpresaAtual || {}), ...payload, logo_url: logoUrl || (dadosEmpresaAtual && dadosEmpresaAtual.logo_url) };
  mostrarToast('Dados da empresa salvos.', 'sucesso');
});
