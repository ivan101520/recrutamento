// Estado compartilhado entre as páginas. Os dados ficam na planilha do Google, via Worker (pasta worker/).
import { reactive, ref, watch } from 'vue';
import { hoje, migrar } from './utils.js';
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

export const vagas = ref([]);
export const opcoes = reactive(structuredClone(OPCOES_PADRAO));
export const carregando = ref(true);
// o formulário fica aqui para não perder o que foi digitado ao trocar de página
export const form = reactive(vazio());
export const toast = ref('');

export function avisar(msg) {
  toast.value = msg;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (toast.value = ''), 3200);
}

async function api(caminho, metodo = 'GET', corpo) {
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

// cada função grava na planilha primeiro e só muda a tela se deu certo; devolve false em caso de erro
async function tentar(acao, msgErro) {
  try { await acao(); return true; }
  catch (e) { console.error(e); avisar(`${msgErro} ${e.message}`); return false; }
}
export const criarVaga = v => tentar(async () => {
  await api('/vagas', 'POST', v);
  vagas.value = [v, ...vagas.value];
}, 'Não foi possível lançar a vaga.');
export const atualizarVaga = v => tentar(async () => {
  await api(`/vagas/${encodeURIComponent(v.id)}`, 'PUT', v);
  vagas.value = vagas.value.map(x => (x.id === v.id ? v : x));
}, 'Não foi possível salvar a vaga.');
export const excluirVaga = v => tentar(async () => {
  await api(`/vagas/${encodeURIComponent(v.id)}`, 'DELETE');
  vagas.value = vagas.value.filter(x => x.id !== v.id);
}, 'Não foi possível excluir a vaga.');

// textos da planilha aparecem em maiúsculas, como o que é digitado no app (main.js).
// Ficam de fora: id e status (chaves internas) e contrato (precisa bater com a lista CONTRATOS).
const SEM_MAIUSCULAS = new Set(['id', 'status', 'contrato', 'atualizadoEm']);
const maiusculas = v => Object.fromEntries(Object.entries(v).map(([k, x]) =>
  [k, typeof x === 'string' && !SEM_MAIUSCULAS.has(k) ? x.toUpperCase() : x]));

// carregar só lê a planilha, nunca grava; gravações acontecem apenas por ação da pessoa (lançar, editar, excluir, Ajustes)
let opcoesLidas = JSON.stringify(opcoes);
export async function carregar() {
  carregando.value = true;
  try {
    const dados = await api('/dados');
    vagas.value = dados.vagas.map(v => migrar(maiusculas(v)));
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
export const ehSubstituicao = v => (v.motivo || '').toLowerCase() === 'substituição';

export const duplicadasDe = v =>
  v.codigo ? vagas.value.filter(x => x.codigo === v.codigo && x.id !== v.id) : [];

export function erroDatas(v) {
  if (v.status !== 'fechada') return '';
  if (!v.fechada) return 'Informe a data de fechamento.';
  return v.fechada < v.iniciada ? 'A data de fechamento não pode ser anterior à data de início.' : '';
}

// prepara a vaga para salvar: substituição só com motivo substituição; data de fechamento só com status fechada
export const paraSalvar = v => ({
  ...v,
  substituicao: ehSubstituicao(v) ? v.substituicao : '',
  fechada: v.status === 'fechada' ? v.fechada : '',
  atualizadoEm: new Date().toISOString(),
});

// mantém visível o valor de uma vaga antiga mesmo se a opção foi removida em Ajustes
export const opts = (lista, atual) =>
  atual && !opcoes[lista].includes(atual) ? [atual, ...opcoes[lista]] : opcoes[lista];
