// Estado compartilhado entre as páginas. Os dados ficam na planilha do Google, via Worker (pasta worker/).
import { reactive, ref, watch } from 'vue';
import { hoje, migrar, normalizar } from './utils.js';
import { sessao, logado, sair } from './auth.js';

const API = import.meta.env.VITE_API_URL;

export const STATUS = [
  { key: 'aberta', rotulo: 'Aberta' },
  { key: 'fechada', rotulo: 'Fechada' },
  { key: 'congelada', rotulo: 'Congelada' },
  { key: 'cancelada', rotulo: 'Cancelada' },
];
export const rotuloStatus = s => STATUS.find(x => x.key === s)?.rotulo ?? 'Aberta';

export const CONTRATOS =['CLT', 'Temporário', 'Estágio', 'Jovem Aprendiz', 'Intermitente', 'PJ'];

export const LISTAS = [
  { key: 'estados', titulo: 'Estados' },
  { key: 'filiais', titulo: 'Filial' },
  { key: 'setores', titulo: 'Setor' },
  { key: 'horarios', titulo: 'Horário' },
  { key: 'situacoes', titulo: 'Situação' },
  { key: 'motivos', titulo: 'Motivo de contratação' },
];

const OPCOES_PADRAO = {
  estados: ['RO', 'AM', 'PA'],
  filiais: [],
  setores: [],
  horarios: [],
  situacoes: ['AGUARDANDO ENTREVISTA', 'ENTREVISTA AGENDADA', 'ENTREVISTA REALIZADA', 'APROVADO', 'REPROVADO'],
  motivos: ['SUBSTITUIÇÃO', 'AUMENTO DE QUADRO', 'NOVA VAGA', 'DEMANDA SAZONAL'],
};

// colunas do CSV exportado: [campo, título]
export const CAMPOS = [
  ['codigo', 'Cód. Pandapé'], ['cargo', 'Cargo'], ['horario', 'Horário'], ['contrato', 'Tipo de contrato'],
  ['posicoes', 'Total de posições'], ['filial', 'Filial'], ['setor', 'Setor'], ['estado', 'Estado'],
  ['solicitante', 'Solicitante'], ['recrutadora', 'Recrutadora'], ['iniciada', 'Iniciada'], ['fechada', 'Fechada'],
  ['admissao', 'Admissão'], ['status', 'Status'], ['situacao', 'Situação'], ['motivo', 'Motivo de Contratação'],
  ['substituicao', 'Substituição'], ['novaContratacao', 'Nova Contratação'], ['observacoes', 'Observações'],
  ['sla', 'SLA'], ['remuneracao', 'Remuneração'], ['periculosidade', 'Periculosidade'], ['premiacao', 'Premiação'],
  ['assiduidade', 'Assiduidade'], ['alimentacao', 'Alimentação'], ['adicional', 'Adicional'],
  ['mensal', 'Mensal'], ['anual', 'Anual'],
];

export function vazio() {
  return {
    id: null, codigo: '', cargo: '', horario: '', contrato: 'CLT', posicoes: 1, sla: 30,
    filial: '', setor: '', estado: '', solicitante: '', recrutadora: '',
    iniciada: hoje(), status: 'aberta', situacao: '', fechada: '', admissao: '',
    motivo: '', substituicao: '', novaContratacao: '',
    remuneracao: 0, periculosidade: 0, premiacao: 0, assiduidade: 0, alimentacao: 0, adicional: 0,
    observacoes: '',
  };
}

// período do filtro do Histórico: a API só devolve as vagas desse período (mais todas as abertas, para o alerta)
// padrão: mês atual e os 2 anteriores (dia 1 evita pular mês em datas como 31/05 - 2 meses)
function ultimos3Meses() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 2, 1);
  const chave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { modo: 'mes', de: chave(inicio), ate: chave(agora) };
}
export const PERIODO_PADRAO = ultimos3Meses();
export const periodo = ref({ ...PERIODO_PADRAO });

export const vagas = ref([]);
export const totalVagas = ref(0); // da planilha inteira, não só do período
export const recrutadoras = ref([]); // sugestões do campo Recrutadora, da planilha inteira
export const opcoes = reactive(structuredClone(OPCOES_PADRAO));
export const carregando = ref(false); // carregar() liga ao abrir já logado; sem login, nada carrega
// o formulário fica aqui para não perder o que foi digitado ao trocar de página
export const form = reactive(vazio());
export const toast = ref('');

export function avisar(msg) {
  toast.value = msg;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (toast.value = ''), 3200);
}

export async function api(caminho, metodo = 'GET', corpo) {
  if (!API) throw new Error('Endereço da API não configurado (VITE_API_URL no arquivo .env.local).');
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: `Bearer ${sessao.token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 401) {
    sair('expirou'); // a tela volta para o login (App.vue)
    throw new Error('Sua sessão expirou. Entre novamente.');
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.erro || `Erro ${r.status}`);
  return json;
}

const consultaDados = () => {
  const { modo, de, ate } = periodo.value;
  return `/dados?${new URLSearchParams({ modo, de: de || '', ate: ate || '' })}`;
};

// cada função grava na planilha primeiro e só muda a tela se deu certo; devolve false em caso de erro
// muda a cada gravação feita por aqui: uma atualização automática que já estava a caminho é descartada,
// senão ela traria a lista de antes da gravação e "desfaria" a mudança na tela por 30 s
let versaoLocal = 0;
async function tentar(acao, msgErro) {
  versaoLocal++;
  try { await acao(); return true; }
  catch (e) { console.error(e); avisar(`${msgErro} ${e.message}`); return false; }
}
export const criarVaga = v => tentar(async () => {
  await api('/vagas', 'POST', v);
  vagas.value = [v, ...vagas.value];
  totalVagas.value++;
  if (v.recrutadora && !recrutadoras.value.includes(v.recrutadora)) recrutadoras.value = [...recrutadoras.value, v.recrutadora].sort();
}, 'Não foi possível lançar a vaga.');
export const atualizarVaga = v => tentar(async () => {
  await api(`/vagas/${encodeURIComponent(v.id)}`, 'PUT', v);
  vagas.value = vagas.value.map(x => (x.id === v.id ? v : x));
}, 'Não foi possível salvar a vaga.');
export const excluirVaga = v => tentar(async () => {
  await api(`/vagas/${encodeURIComponent(v.id)}`, 'DELETE');
  vagas.value = vagas.value.filter(x => x.id !== v.id);
  totalVagas.value--;
}, 'Não foi possível excluir a vaga.');

// vagas com o mesmo Cód. Pandapé na planilha inteira (a lista da tela só tem o período filtrado)
export async function buscarDuplicadas(v) {
  if (!v.codigo) return [];
  const { duplicadas } = await api(`/duplicadas?${new URLSearchParams({ codigo: v.codigo, id: v.id || '' })}`);
  return duplicadas.map(d => migrar(maiusculas(d)));
}

// textos da planilha aparecem em maiúsculas, como o que é digitado no app (main.js).
// Ficam de fora: id e status (chaves internas) e contrato (precisa bater com a lista CONTRATOS).
const SEM_MAIUSCULAS = new Set(['id', 'status', 'contrato', 'atualizadoEm']);
const maiusculas = v => Object.fromEntries(Object.entries(v).map(([k, x]) =>
  [k, typeof x === 'string' && !SEM_MAIUSCULAS.has(k) ? x.toUpperCase() : x]));

// só a resposta do pedido mais recente vale: trocar o período com outra busca a caminho não mistura as listas
let pedido = 0;
function aplicarVagas(dados) {
  vagas.value = dados.vagas.map(v => migrar(maiusculas(v)));
  totalVagas.value = dados.total ?? dados.vagas.length;
  recrutadoras.value = dados.recrutadoras ?? [];
}

// atualização automática do Histórico e troca de período: só as vagas, sem aviso na tela
// (se falhar, a próxima rodada tenta de novo)
export async function atualizarVagas() {
  if (!logado()) return;
  const meu = ++pedido;
  const versao = versaoLocal;
  try {
    const dados = await api(consultaDados());
    if (meu === pedido && versao === versaoLocal) aplicarVagas(dados);
  } catch (e) {
    console.warn('Atualização do Histórico falhou; tenta de novo na próxima rodada.', e);
  }
}
watch(periodo, atualizarVagas, { deep: true });

// carregar só lê a planilha, nunca grava; gravações acontecem apenas por ação da pessoa (lançar, editar, excluir, Ajustes)
let opcoesLidas = JSON.stringify(opcoes);
export async function carregar() {
  carregando.value = true;
  const meu = ++pedido;
  try {
    const dados = await api(consultaDados());
    if (meu === pedido) aplicarVagas(dados);
    // aba Opcoes vazia: usa as opções padrão só na tela; "Loja" e "LOJA" viram uma opção só
    const lidas = Object.fromEntries(Object.entries(dados.opcoes).map(([k, l]) => [k, [...new Set(l.map(o => o.toUpperCase()))]]));
    Object.assign(opcoes, structuredClone(OPCOES_PADRAO), lidas);
    opcoesLidas = JSON.stringify(opcoes);
    return true;
  } catch (e) {
    console.error(e);
    avisar(`Não foi possível carregar os dados da planilha. ${e.message}`);
    return false;
  } finally {
    carregando.value = false;
  }
}
// carrega ao abrir já logado e a cada login; ao sair, limpa os dados da tela
if (logado()) carregar();
watch(() => sessao.token, token => {
  if (token) return carregar();
  vagas.value = [];
  totalVagas.value = 0;
  recrutadoras.value = [];
  periodo.value = { ...PERIODO_PADRAO };
  Object.assign(opcoes, structuredClone(OPCOES_PADRAO));
  opcoesLidas = JSON.stringify(opcoes);
  Object.assign(form, vazio());
});

// mudança feita em Ajustes regrava as opções (agrupando cliques seguidos); o que veio da planilha não é regravado
let t;
watch(opcoes, o => {
  clearTimeout(t);
  t = setTimeout(() => {
    const atual = JSON.stringify(o);
    if (atual === opcoesLidas) return;
    opcoesLidas = atual;
    tentar(() => api('/opcoes', 'PUT', o), 'Não foi possível salvar os Ajustes.');
  }, 600);
}, { deep: true });

// seções do lançamento; o Histórico usa as mesmas para agrupar colunas e abrir o modal de edição
export const SECOES = [
  { key: 'vaga', titulo: 'Vaga', descricao: 'Cargo, horário, contrato e prazo',
    icone: ['M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16', 'M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z'] },
  { key: 'local', titulo: 'Local e responsáveis', descricao: 'Onde é a vaga e quem acompanha',
    icone: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'] },
  { key: 'etapas', titulo: 'Etapas', descricao: 'Datas e situação do processo',
    icone: ['M8 2v4M16 2v4M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm9 16 2 2 4-4'] },
  { key: 'motivo', titulo: 'Motivo', descricao: 'Por que a vaga foi aberta',
    icone: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'] },
  { key: 'remuneracao', titulo: 'Remuneração e benefícios', curto: 'Remuneração', descricao: 'Valores mensais por posição',
    icone: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'] },
  { key: 'obs', titulo: 'Observações', descricao: 'Informações adicionais',
    icone: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6M8 13h8M8 17h5'] },
];

// depende do texto da opção "Substituição" em Ajustes
export const ehSubstituicao = v => normalizar(v.motivo) === 'substituicao';
// nome para avisos: cargo + código só quando o código tem número (a planilha usa "S/N" nas vagas sem código)
export const nomeVaga = v => /\d/.test(v.codigo || '') ? `${v.cargo} (${v.codigo})` : v.cargo;

export const duplicadasDe = v =>
  v.codigo ? vagas.value.filter(x => x.codigo === v.codigo && x.id !== v.id) : [];

export function erroDatas(v) {
  if (v.status !== 'fechada') return '';
  if (!v.fechada) return 'Informe a data de fechamento.';
  return v.fechada < v.iniciada ? 'A data de fechamento não pode ser anterior à data de início.' : '';
}

// prepara a vaga para salvar: substituição só com motivo substituição; fechamento e admissão só com status fechada
export const paraSalvar = v => ({
  ...v,
  substituicao: ehSubstituicao(v) ? v.substituicao : '',
  fechada: v.status === 'fechada' ? v.fechada : '',
  admissao: v.status === 'fechada' ? v.admissao : '',
  atualizadoEm: new Date().toISOString(),
});

// mantém visível o valor de uma vaga antiga mesmo se a opção foi removida em Ajustes
export const opts = (lista, atual) =>
  atual && !opcoes[lista].includes(atual) ? [atual, ...opcoes[lista]] : opcoes[lista];
