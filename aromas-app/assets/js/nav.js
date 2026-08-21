// Alterna entre as páginas do sistema pelo menu lateral
const paginas = {
  dashboard: { titulo: 'Dashboard', sub: 'Visão geral do negócio', el: 'pagina-dashboard' },
  clientes: { titulo: 'Clientes', sub: 'Cadastro central de clientes — tudo do sistema parte daqui', el: 'pagina-clientes' },
  empresa: { titulo: 'Empresa', sub: 'Dados gerais do seu negócio', el: 'pagina-empresa' },
  categorias: { titulo: 'Categorias', sub: 'Financeiras e de produtos', el: 'pagina-categorias' },
  fornecedores: { titulo: 'Fornecedores', sub: 'Quem fornece seus produtos', el: 'pagina-fornecedores' },
  produtos: { titulo: 'Produtos', sub: 'Catálogo com custo, venda e estoque', el: 'pagina-produtos' },
  estoque: { titulo: 'Estoque', sub: 'Entradas, ajustes e precificação', el: 'pagina-estoque' },
  compras: { titulo: 'Compras', sub: 'Entrada de produtos por nota fiscal — soma ao estoque sozinho', el: 'pagina-compras' },
  pedidos: { titulo: 'Controle Individual', sub: 'Registros de venda por cliente — itens, embrulho, envio e pagamento', el: 'pagina-pedidos' },
  financeiro: { titulo: 'Financeiro', sub: 'Contas a pagar, receber, DRE e fluxo', el: 'pagina-financeiro' },
  consorcio: { titulo: 'Consórcio', sub: 'Grupos de pagamento com sorteio mensal — não gera lançamento no Financeiro', el: 'pagina-consorcio' },
};

const listaIdsPaginas = ['pagina-clientes','pagina-empresa','pagina-categorias','pagina-fornecedores',
  'pagina-produtos','pagina-estoque','pagina-compras','pagina-pedidos','pagina-financeiro','pagina-consorcio','pagina-dashboard','pagina-em-breve'];

async function irParaPagina(chave) {
  const info = paginas[chave];
  if (!info) return;

  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('ativo', i.dataset.pagina === chave));
  document.getElementById('titulo-pagina').textContent = info.titulo;
  document.getElementById('subtitulo-pagina').textContent = info.sub;
  listaIdsPaginas.forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById(info.el).style.display = 'block';

  if (chave === 'empresa') carregarEmpresa();
  if (chave === 'categorias') carregarCategorias();
  if (chave === 'fornecedores') await carregarFornecedores();
  if (chave === 'produtos') {
    await carregarCategorias();
    await carregarFornecedores();
    await carregarProdutos();
    popularSelectCategorias('produto-categoria');
    popularSelectFornecedores('produto-fornecedor');
  }
  if (chave === 'estoque') {
    await carregarProdutos();
    await carregarClientes();
    await carregarMovimentos();
  }
  if (chave === 'compras') {
    await carregarProdutos();
    await carregarFornecedores();
    await carregarCompras();
  }
  if (chave === 'pedidos') {
    await carregarProdutos();
    await carregarClientes();
    await carregarPedidos();
  }
  if (chave === 'financeiro') {
    await carregarCategorias();
    await carregarFornecedores();
    await carregarClientes();
    popularSelectFornecedoresPagar();
    await carregarFinanceiro();
  }
  if (chave === 'dashboard') {
    await carregarDashboard();
  }
  if (chave === 'consorcio') {
    await carregarClientes();
    await carregarConsorcios();
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    irParaPagina(item.dataset.pagina);
    fecharMenuMobile();
  });
});

const btnMenuMobile = document.getElementById('btn-menu-mobile');
const overlayMenuMobile = document.getElementById('overlay-menu-mobile');
const sidebarEl = document.querySelector('.sidebar');

function abrirMenuMobile() {
  sidebarEl.classList.add('aberta');
  overlayMenuMobile.classList.add('ativo');
}
function fecharMenuMobile() {
  sidebarEl.classList.remove('aberta');
  overlayMenuMobile.classList.remove('ativo');
}
if (btnMenuMobile) btnMenuMobile.addEventListener('click', abrirMenuMobile);
if (overlayMenuMobile) overlayMenuMobile.addEventListener('click', fecharMenuMobile);
