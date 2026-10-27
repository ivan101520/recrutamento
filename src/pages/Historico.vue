<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { vagas, nomeVaga, totalVagas, periodo, PERIODO_PADRAO, atualizarVaga, excluirVaga, atualizarVagas, buscarDuplicadas, vazio, avisar, CAMPOS, SECOES, erroDatas, paraSalvar, rotuloStatus } from '../store.js';
import { n, hoje, brl, data, calc, diasAbertos, foraSla, normalizar } from '../utils.js';
import Modal from '../components/Modal.vue';
import PeriodoFiltro from '../components/PeriodoFiltro.vue';
import SecaoCampos from '../components/SecaoCampos.vue';

// colunas de cada seção na tabela, na mesma ordem do lançamento
const COLUNAS = {
  vaga: ['Cargo', 'Posições', 'SLA'],
  local: ['Filial / Setor', 'Recrutadora'],
  etapas: ['Datas', 'Status'],
  motivo: ['Motivo'],
  remuneracao: ['Remuneração', 'Periculosidade', 'Premiação', 'Assiduidade', 'Alimentação', 'Adicional', 'Total'],
  obs: ['Observações'],
};
// campos da vaga na ordem das colunas de Remuneração (a última, Total, é calculada)
const VALORES = ['remuneracao', 'periculosidade', 'premiacao', 'assiduidade', 'alimentacao', 'adicional'];
const NUMERICAS = new Set(['Posições', 'Total']);

/* ---------- edição por seção ---------- */
const editando = ref(null); // { id, secao, titulo, cargo, codigo }
const rascunho = reactive(vazio());
const formSecao = ref(null);
const erroSecao = ref('');
const confirmouDuplicada = ref(false);

function abrirSecao(v, s) {
  Object.keys(rascunho).forEach(k => delete rascunho[k]);
  Object.assign(rascunho, vazio(), v);
  editando.value = { id: v.id, secao: s.key, titulo: s.titulo, cargo: v.cargo, codigo: v.codigo, filial: v.filial, status: v.status };
  erroSecao.value = '';
  confirmouDuplicada.value = false;
}

async function salvarSecao() {
  // datas antes da validação do navegador: o min do campo Fechada daria a mensagem genérica de obrigatório
  erroSecao.value = erroDatas(rascunho);
  if (erroSecao.value) return;
  if (!formSecao.value.checkValidity()) {
    formSecao.value.reportValidity();
    erroSecao.value = 'Preencha os campos obrigatórios desta seção.';
    return;
  }
  // só pergunta quando o código mudou: vagas antigas repetem "S/N" e travariam toda edição da seção
  if (editando.value.secao === 'vaga' && rascunho.codigo !== editando.value.codigo && !confirmouDuplicada.value) {
    let dup;
    try { dup = await buscarDuplicadas(rascunho); }
    catch (e) { erroSecao.value = `Não foi possível conferir o código. ${e.message}`; return; }
    if (dup.length) {
      confirmouDuplicada.value = true;
      erroSecao.value = `Já existe outra vaga com o código ${rascunho.codigo}. Clique em "Salvar mesmo assim" para confirmar.`;
      return;
    }
  }
  const salvo = paraSalvar(rascunho);
  if (!(await atualizarVaga(salvo))) return;
  avisar(`Vaga ${nomeVaga(salvo)} atualizada.`);
  editando.value = null;
}

// atributos de cada célula: clicar (ou Enter) em qualquer coluna da seção abre o modal dela
const realce = ref({ id: null, secao: null });
function cel(v, s, primeira = false) {
  const ativa = realce.value.id === v.id && realce.value.secao === s.key;
  return {
    class: ['cel', { ini: primeira, realce: ativa }],
    role: primeira ? 'button' : undefined,
    tabindex: primeira ? 0 : -1,
    'aria-label': primeira ? `Editar ${s.titulo} de ${v.cargo}` : undefined,
    title: `Clique para editar ${s.titulo}`,
    onClick: () => abrirSecao(v, s),
    onKeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSecao(v, s); } },
    onMouseenter: () => (realce.value = { id: v.id, secao: s.key }),
    onMouseleave: () => (realce.value = { id: null, secao: null }),
  };
}
const SEC = Object.fromEntries(SECOES.map(s => [s.key, s]));

/* ---------- filtros ---------- */
const busca = ref('');
const filtro = ref('todas');

// o período fica no store.js: a API só devolve as vagas dele (trocar o período busca de novo)
const periodoEhPadrao = computed(() =>
  ['modo', 'de', 'ate'].every(k => periodo.value[k] === PERIODO_PADRAO[k]));

// vaga fechada conta pela data de fechamento; as demais, pela data de início. No modo mês usa só AAAA-MM
const dataDoPeriodo = v => (v.status === 'fechada' && v.fechada) || v.iniciada || '';
function noPeriodo(v) {
  const { modo, de, ate } = periodo.value;
  const d = modo === 'mes' ? dataDoPeriodo(v).slice(0, 7) : dataDoPeriodo(v);
  return (!de || d >= de) && (!ate || d <= ate);
}
const doPeriodo = computed(() => vagas.value.filter(noPeriodo));

/* ---------- atenção: vagas abertas iniciadas antes do mês atual ---------- */
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesAtual = hoje().slice(0, 7);
const mesPassado = (() => {
  const [a, m] = mesAtual.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
})();
const ehAberta = v => v.status === 'aberta';
const ehAntiga = v => ehAberta(v) && !!v.iniciada && v.iniciada.slice(0, 7) < mesAtual;

// usa todas as vagas, não só as do período: é um alerta do estado atual (mas segue a busca e as listas)
const atencao = computed(() => {
  const antigas = vagas.value.filter(v => ehAntiga(v) && passaListas(v, termo.value));
  const doMesPassado = antigas.filter(v => v.iniciada.slice(0, 7) === mesPassado).length;
  return { total: antigas.length, doMesPassado, anteriores: antigas.length - doMesPassado };
});
const atencaoDetalhe = computed(() => {
  const { doMesPassado, anteriores } = atencao.value;
  const nomeMes = MESES_LONGOS[+mesPassado.slice(5) - 1];
  const partes = [];
  if (doMesPassado) partes.push(`${doMesPassado} de ${nomeMes}`);
  if (anteriores) partes.push(`${anteriores} de meses anteriores`);
  return partes.join(' e ');
});

const KPIS = [
  { key: 'abertas', rotulo: 'Vagas abertas', filtro: 'abertas' },
  { key: 'posicoes', rotulo: 'Posições em aberto', filtro: 'abertas' },
  { key: 'foraSla', rotulo: 'Fora do SLA', filtro: 'fora', alerta: true },
  { key: 'fechadas', rotulo: 'Fechadas', filtro: 'fechadas' },
  { key: 'antigas', rotulo: 'Abertas de meses anteriores', filtro: 'antigas', atencao: true },
];
const kpisVisiveis = computed(() => KPIS.filter(k => !k.atencao || atencao.value.total));
const kpiAtivo = ref(null);

function clicarKpi(k) {
  const desmarcar = kpiAtivo.value === k.key;
  kpiAtivo.value = desmarcar ? null : k.key;
  filtro.value = desmarcar ? 'todas' : k.filtro;
  // o alerta conta todas as vagas; limpa o período para a tabela mostrar todas elas
  if (k.atencao && !desmarcar) periodo.value = { ...periodo.value, de: '', ate: '' };
}
// mantém o destaque do KPI coerente quando o status é trocado pela lista de seleção
watch(filtro, f => {
  if (KPIS.find(k => k.key === kpiAtivo.value)?.filtro !== f) kpiAtivo.value = KPIS.find(k => k.filtro === f)?.key ?? null;
});

// filtros de lista: campo da vaga -> texto da opção "todas"
const FILTROS_LISTA = [
  { campo: 'situacao', rotulo: 'situação', todas: 'Todas as situações' },
  { campo: 'motivo', rotulo: 'motivo', todas: 'Todos os motivos' },
  { campo: 'estado', rotulo: 'estado', todas: 'Todos os estados' },
];
const escolhidos = reactive({ situacao: '', motivo: '', estado: '' });

const temFiltro = computed(() => filtro.value !== 'todas' || busca.value || Object.values(escolhidos).some(Boolean) || !periodoEhPadrao.value);
function limparFiltros() {
  busca.value = '';
  Object.keys(escolhidos).forEach(k => { escolhidos[k] = ''; });
  filtro.value = 'todas';
  periodo.value = { ...PERIODO_PADRAO };
}

// todos os filtros da tabela; "ignorar" pula um filtro de lista (para montar as opções dele mesmo)
function passa(v, q, ignorar) {
  if (filtro.value === 'abertas' && !ehAberta(v)) return false;
  if (filtro.value === 'fechadas' && v.status !== 'fechada') return false;
  if (filtro.value === 'congeladas' && v.status !== 'congelada') return false;
  if (filtro.value === 'canceladas' && v.status !== 'cancelada') return false;
  if (filtro.value === 'fora' && (!ehAberta(v) || !foraSla(v))) return false;
  if (filtro.value === 'antigas' && !ehAntiga(v)) return false;
  return passaListas(v, q, ignorar);
}
// busca e listas (Situação, Motivo, Estado), sem o card do topo: é o que os KPIs seguem
function passaListas(v, q, ignorar) {
  if (FILTROS_LISTA.some(({ campo }) => campo !== ignorar && escolhidos[campo] && normalizar(v[campo]) !== normalizar(escolhidos[campo]))) return false;
  if (!q) return true;
  return [v.codigo, v.cargo, v.filial, v.setor, v.recrutadora, v.solicitante]
    .some(s => normalizar(s).includes(q));
}
const termo = computed(() => normalizar(busca.value.trim()));
const lista = computed(() => doPeriodo.value.filter(v => passa(v, termo.value)));
const paraKpis = computed(() => doPeriodo.value.filter(v => passaListas(v, termo.value)));

// filtros dinâmicos: cada lista mostra só os valores das vagas que passam pelos OUTROS filtros
// (o valor já escolhido fica na lista, para não sumir enquanto se digita na busca)
const opcoesFiltro = computed(() => Object.fromEntries(FILTROS_LISTA.map(({ campo }) => {
  const valores = new Set(doPeriodo.value.filter(v => passa(v, termo.value, campo)).map(v => v[campo]).filter(Boolean));
  if (escolhidos[campo]) valores.add(escolhidos[campo]);
  return [campo, [...valores].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
})));

/* ---------- virtualização: só as linhas visíveis (mais uma margem) ficam na página ---------- */
const TOTAL_COLUNAS = Object.values(COLUNAS).flat().length + 1; // + coluna de ações
// larguras fixas (px), na ordem das colunas: com só parte das linhas desenhada, a largura automática "pularia" ao rolar
const LARGURAS = [180, 70, 85, 120, 125, 100, 105, 150, 100, 105, 95, 95, 100, 90, 120, 120, 48];
const LARGURA_TABELA = LARGURAS.reduce((s, l) => s + l, 0);
const MARGEM = 800; // px desenhados acima e abaixo da área visível, para a rolagem não mostrar buracos
const wrapEl = ref(null);
const tbodyEl = ref(null);
const topo = ref(0);
const alturaVisivel = ref(800);
const alturas = new Map(); // id -> altura medida da linha (linhas variam: algumas têm Subst./Nova)
const medidas = ref(0); // muda quando novas alturas são medidas
let media = 64;
const altura = v => alturas.get(String(v.id)) ?? media;

let raf = 0;
function rolou() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    topo.value = wrapEl.value?.scrollTop ?? 0;
    alturaVisivel.value = wrapEl.value?.clientHeight || 800;
  });
}

const janela = computed(() => {
  medidas.value; // recalcula quando as alturas mudam
  const l = lista.value;
  const ini = topo.value - MARGEM;
  const fim = topo.value + alturaVisivel.value + MARGEM;
  let a = 0, y = 0;
  while (a < l.length && y + altura(l[a]) < ini) y += altura(l[a++]);
  const antes = y;
  let b = a;
  while (b < l.length && y < fim) y += altura(l[b++]);
  let depois = 0;
  for (let i = b; i < l.length; i++) depois += altura(l[i]);
  return { linhas: l.slice(a, b), antes, depois };
});

// mede as linhas desenhadas para os espaçadores ficarem do tamanho certo
function medir() {
  let mudou = false;
  for (const tr of tbodyEl.value?.querySelectorAll('tr[data-id]') ?? []) {
    const h = tr.offsetHeight;
    if (h && Math.abs((alturas.get(tr.dataset.id) ?? 0) - h) > 1) { alturas.set(tr.dataset.id, h); mudou = true; }
  }
  if (!mudou) return;
  media = [...alturas.values()].reduce((s, h) => s + h, 0) / alturas.size;
  medidas.value++;
}
watch(janela, () => requestAnimationFrame(medir), { flush: 'post' });
watch(lista, rolou); // filtro novo pode encurtar a lista e mudar a rolagem

let observador;
watch(wrapEl, el => {
  observador?.disconnect();
  if (el) { observador = new ResizeObserver(rolou); observador.observe(el); }
});
onUnmounted(() => { observador?.disconnect(); cancelAnimationFrame(raf); });

/* ---------- atualização automática: busca as vagas a cada 30 s, só com a aba do navegador visível ---------- */
// não baixar o intervalo sem rever a cota do Google Sheets (60 leituras/min para a conta de serviço inteira)
const INTERVALO_MS = 30_000;
let relogio = 0;
function ligarRelogio() {
  clearInterval(relogio);
  if (document.visibilityState === 'visible') relogio = setInterval(atualizarVagas, INTERVALO_MS);
}
function mudouVisibilidade() {
  if (document.visibilityState === 'visible') atualizarVagas(); // voltou para a aba: atualiza na hora
  ligarRelogio();
}
onMounted(() => {
  ligarRelogio();
  document.addEventListener('visibilitychange', mudouVisibilidade);
});
onUnmounted(() => {
  clearInterval(relogio);
  document.removeEventListener('visibilitychange', mudouVisibilidade);
});

const kpi = computed(() => {
  const abertas = paraKpis.value.filter(ehAberta);
  return {
    abertas: abertas.length,
    posicoes: abertas.reduce((s, v) => s + n(v.posicoes), 0),
    foraSla: abertas.filter(foraSla).length,
    fechadas: paraKpis.value.filter(v => v.status === 'fechada').length,
    antigas: atencao.value.total,
  };
});

const slaPct = v => n(v.sla) ? Math.min(100, (diasAbertos(v) / n(v.sla)) * 100) : 0;
const parada = v => v.status === 'congelada' || v.status === 'cancelada';
const slaClasse = v => parada(v) ? 'parado' : foraSla(v) ? 'late' : slaPct(v) >= 80 ? 'near' : 'ok';
const slaTexto = v => parada(v) ? `SLA parado (${rotuloStatus(v.status).toLowerCase()})` : `${diasAbertos(v)} de ${n(v.sla) || '—'} dias`;

const excluindo = ref(null);
async function confirmarExclusao() {
  const v = excluindo.value;
  if (!(await excluirVaga(v))) return;
  avisar(`Vaga ${v.codigo || v.cargo} excluída.`);
  excluindo.value = null;
}

function exportar() {
  const fmt = x => typeof x === 'number' ? String(x).replace('.', ',') : x;
  const esc = x => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const linhas = lista.value.map(v => {
    const row = { ...v, ...calc(v) };
    return CAMPOS.map(([k]) => esc(fmt(row[k]))).join(';');
  });
  const csv = '﻿' + [CAMPOS.map(([, l]) => esc(l)).join(';'), ...linhas].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `vagas-${hoje()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <main class="wrap historico">
    <header class="page-head">
      <h1>Histórico de lançamentos</h1>
      <span class="badge">{{ totalVagas === 1 ? '1 vaga' : `${totalVagas} vagas` }}</span>
    </header>

    <section class="kpis" aria-label="Indicadores. Clique para filtrar a tabela">
      <button
        v-for="k in kpisVisiveis" :key="k.key" type="button" class="kpi"
        :class="{ sel: kpiAtivo === k.key, alert: k.alerta && kpi[k.key], atencao: k.atencao }"
        :aria-pressed="kpiAtivo === k.key"
        :title="kpiAtivo === k.key ? 'Clique para remover o filtro' : 'Clique para filtrar a tabela'"
        @click="clicarKpi(k)"
      >
        <span>
          <svg v-if="k.atencao" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg>
          {{ k.rotulo }}
        </span>
        <strong>{{ kpi[k.key] }}</strong>
        <small v-if="k.atencao">{{ atencaoDetalhe }}</small>
      </button>
    </section>

    <section class="sheet table-card">
      <div class="toolbar">
        <input v-model="busca" type="search" placeholder="Buscar código, cargo, filial, recrutadora…" aria-label="Buscar">
        <PeriodoFiltro v-model="periodo" />
        <select v-for="f in FILTROS_LISTA" :key="f.campo" v-model="escolhidos[f.campo]" :aria-label="'Filtrar por ' + f.rotulo">
          <option value="">{{ f.todas }}</option>
          <option v-for="o in opcoesFiltro[f.campo]" :key="o" :value="o">{{ o }}</option>
        </select>
        <button v-if="temFiltro" type="button" class="link" title="Volta para os últimos 3 meses, sem busca, sem situação, motivo ou estado e sem filtro dos indicadores" @click="limparFiltros">Limpar filtros</button>
        <button class="ghost push" :disabled="!lista.length" @click="exportar">Exportar CSV</button>
      </div>

      <div v-if="!totalVagas" class="empty">
        <p>Nenhuma vaga lançada ainda.</p>
        <RouterLink class="primary" to="/lancamento">Lançar primeira vaga</RouterLink>
      </div>
      <p v-else-if="!lista.length" class="empty">Nenhuma vaga encontrada com esses filtros.</p>

      <div v-else ref="wrapEl" class="table-wrap" @scroll.passive="rolou">
        <table class="tabela-secoes" :style="{ minWidth: LARGURA_TABELA + 'px' }">
          <colgroup><col v-for="(l, i) in LARGURAS" :key="i" :style="{ width: l + 'px' }"></colgroup>
          <thead>
            <tr class="grupo">
              <th v-for="s in SECOES" :key="s.key" :colspan="COLUNAS[s.key].length" class="ini">
                <span :title="s.titulo">{{ s.curto || s.titulo }}</span>
              </th>
              <th class="ini" rowspan="2"><span class="sr">Ações</span></th>
            </tr>
            <tr>
              <template v-for="s in SECOES" :key="s.key">
                <th v-for="(c, i) in COLUNAS[s.key]" :key="c" :class="{ ini: i === 0, num: NUMERICAS.has(c) }">{{ c }}</th>
              </template>
            </tr>
          </thead>
          <tbody ref="tbodyEl">
            <tr v-if="janela.antes" class="espaco" aria-hidden="true" :style="{ height: janela.antes + 'px' }"><td :colspan="TOTAL_COLUNAS"></td></tr>
            <tr v-for="v in janela.linhas" :key="v.id" :data-id="v.id">
              <!-- Vaga -->
              <td v-bind="cel(v, SEC.vaga, true)" class="cargo-cel">
                <strong>{{ v.cargo }}</strong>
                <small>{{ [v.codigo ? 'Cód. ' + v.codigo : 'Sem código', v.contrato, v.horario].filter(Boolean).join(', ') }}</small>
              </td>
              <td v-bind="cel(v, SEC.vaga)" class="num">{{ v.posicoes }}</td>
              <td v-bind="cel(v, SEC.vaga)">
                <div class="sla" :class="slaClasse(v)"><i :style="{ width: slaPct(v) + '%' }"></i></div>
                <small>{{ slaTexto(v) }}</small>
              </td>
              <!-- Local e responsáveis -->
              <td v-bind="cel(v, SEC.local, true)">{{ v.filial }}<small>{{ [v.setor, v.estado].filter(Boolean).join(', ') }}</small></td>
              <td v-bind="cel(v, SEC.local)">{{ v.recrutadora || '—' }}<small v-if="v.solicitante">Solic.: {{ v.solicitante }}</small></td>
              <!-- Etapas -->
              <td v-bind="cel(v, SEC.etapas, true)" class="datas-cel">
                <span title="Iniciada">{{ data(v.iniciada) }}</span>
                <small>{{ v.admissao ? 'Admissão ' + data(v.admissao) : 'Sem admissão' }}</small>
              </td>
              <td v-bind="cel(v, SEC.etapas)">
                <span class="pill" :class="'st-' + v.status">{{ rotuloStatus(v.status) }}</span>
                <small v-if="v.status === 'fechada'">em {{ data(v.fechada) }}</small>
                <small v-if="v.situacao">{{ v.situacao }}</small>
              </td>
              <!-- Motivo -->
              <td v-bind="cel(v, SEC.motivo, true)">
                {{ v.motivo || '—' }}
                <small v-if="v.substituicao">Subst.: {{ v.substituicao }}</small>
                <small v-if="v.novaContratacao">Nova: {{ v.novaContratacao }}</small>
              </td>
              <!-- Remuneração -->
              <td v-for="(campo, i) in VALORES" :key="campo" v-bind="cel(v, SEC.remuneracao, i === 0)" class="num" :class="{ zero: !n(v[campo]) }">{{ n(v[campo]) ? brl(v[campo]) : '—' }}</td>
              <td v-bind="cel(v, SEC.remuneracao)" class="num"><strong>{{ brl(calc(v).mensal) }}</strong><small>Anual {{ brl(calc(v).anual) }}</small></td>
              <!-- Observações -->
              <td v-bind="cel(v, SEC.obs, true)" class="obs">{{ v.observacoes || '—' }}</td>
              <td class="row-actions ini">
                <button
                  type="button" class="acao-icone perigo" :class="{ ativo: excluindo?.id === v.id }"
                  :title="'Excluir ' + v.cargo" :aria-label="'Excluir ' + v.cargo" @click="excluindo = v"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></svg>
                </button>
              </td>
            </tr>
            <tr v-if="janela.depois" class="espaco" aria-hidden="true" :style="{ height: janela.depois + 'px' }"><td :colspan="TOTAL_COLUNAS"></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <Modal
      :open="!!editando" class="largo"
      :title="editando ? editando.titulo : ''" :subtitle="editando ? SEC[editando.secao].descricao : ''"
      @close="editando = null"
    >
      <template #icone>
        <svg v-if="editando" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path v-for="d in SEC[editando.secao].icone" :key="d" :d="d" />
        </svg>
      </template>
      <template v-if="editando" #meta>
        <span class="vaga-chip">
          <strong>{{ editando.cargo }}</strong>
          <span v-if="editando.codigo">Cód. {{ editando.codigo }}</span>
          <span>{{ editando.filial }}</span>
        </span>
        <span class="pill" :class="'st-' + editando.status">{{ rotuloStatus(editando.status) }}</span>
      </template>

      <form v-if="editando" id="form-secao" ref="formSecao" class="modal-form" novalidate @submit.prevent="salvarSecao">
        <SecaoCampos :secao="editando.secao" :v="rascunho" />
      </form>
      <p v-if="erroSecao" class="hint danger" role="alert">{{ erroSecao }}</p>

      <template #nota>Campos com * são obrigatórios.</template>
      <template #actions>
        <button type="button" class="ghost" @click="editando = null">Cancelar</button>
        <button type="submit" form="form-secao" class="primary">{{ confirmouDuplicada ? 'Salvar mesmo assim' : 'Salvar' }}</button>
      </template>
    </Modal>

    <Modal :open="!!excluindo" class="perigo" title="Excluir vaga" subtitle="Essa ação não pode ser desfeita." @close="excluindo = null">
      <template #icone>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></svg>
      </template>
      <template v-if="excluindo">
        <p>A vaga abaixo e todos os dados dela serão apagados do histórico.</p>
        <div class="excluir-resumo">
          <strong>{{ excluindo.cargo }}</strong>
          <span>{{ [excluindo.codigo ? 'Cód. ' + excluindo.codigo : 'Sem código', excluindo.filial, excluindo.estado].filter(Boolean).join(', ') }}</span>
          <span>Iniciada em {{ data(excluindo.iniciada) }}<span class="pill" :class="'st-' + excluindo.status">{{ rotuloStatus(excluindo.status) }}</span></span>
        </div>
      </template>
      <template #actions>
        <button type="button" class="ghost" @click="excluindo = null">Cancelar</button>
        <button type="button" class="btn-perigo" @click="confirmarExclusao">Excluir vaga</button>
      </template>
    </Modal>
  </main>
</template>
