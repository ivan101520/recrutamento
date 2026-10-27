<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { vagas, atualizarVaga, excluirVaga, vazio, avisar, CAMPOS, SECOES, duplicadasDe, erroDatas, paraSalvar, rotuloStatus } from '../store.js';
import { n, hoje, brl, data, calc, diasAbertos, foraSla } from '../utils.js';
import Modal from '../components/Modal.vue';
import PeriodoFiltro from '../components/PeriodoFiltro.vue';
import SecaoCampos from '../components/SecaoCampos.vue';

// colunas de cada seção na tabela, na mesma ordem do lançamento
const COLUNAS = {
  vaga: ['Cargo', 'Posições', 'SLA'],
  local: ['Filial / Setor', 'Recrutadora'],
  etapas: ['Datas', 'Status'],
  motivo: ['Motivo'],
  remuneracao: ['Mensal'],
  obs: ['Observações'],
};
const NUMERICAS = new Set(['Posições', 'Mensal']);

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
  if (editando.value.secao === 'vaga' && duplicadasDe(rascunho).length && !confirmouDuplicada.value) {
    confirmouDuplicada.value = true;
    erroSecao.value = `Já existe outra vaga com o código ${rascunho.codigo}. Clique em "Salvar mesmo assim" para confirmar.`;
    return;
  }
  const salvo = paraSalvar(rascunho);
  if (!(await atualizarVaga(salvo))) return;
  avisar(`Vaga ${salvo.codigo || salvo.cargo} atualizada.`);
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

// padrão: mês atual e os 2 anteriores (dia 1 evita pular mês em datas como 31/05 - 2 meses)
function ultimos3Meses() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 2, 1);
  const chave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { modo: 'mes', de: chave(inicio), ate: chave(agora) };
}
const PERIODO_PADRAO = ultimos3Meses();
const periodo = ref({ ...PERIODO_PADRAO });
const periodoEhPadrao = computed(() =>
  ['modo', 'de', 'ate'].every(k => periodo.value[k] === PERIODO_PADRAO[k]));

// compara pela data de início; no modo mês usa só AAAA-MM
function noPeriodo(v) {
  const { modo, de, ate } = periodo.value;
  const d = modo === 'mes' ? (v.iniciada || '').slice(0, 7) : (v.iniciada || '');
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

// usa todas as vagas, não só as do período: é um alerta do estado atual
const atencao = computed(() => {
  const antigas = vagas.value.filter(ehAntiga);
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

const temFiltro = computed(() => filtro.value !== 'todas' || busca.value || !periodoEhPadrao.value);
function limparFiltros() {
  busca.value = '';
  filtro.value = 'todas';
  periodo.value = { ...PERIODO_PADRAO };
}

const lista = computed(() => {
  const q = busca.value.trim().toLowerCase();
  return doPeriodo.value.filter(v => {
    if (filtro.value === 'abertas' && !ehAberta(v)) return false;
    if (filtro.value === 'fechadas' && v.status !== 'fechada') return false;
    if (filtro.value === 'congeladas' && v.status !== 'congelada') return false;
    if (filtro.value === 'canceladas' && v.status !== 'cancelada') return false;
    if (filtro.value === 'fora' && (!ehAberta(v) || !foraSla(v))) return false;
    if (filtro.value === 'antigas' && !ehAntiga(v)) return false;
    if (!q) return true;
    return [v.codigo, v.cargo, v.filial, v.setor, v.recrutadora, v.solicitante]
      .some(s => (s || '').toLowerCase().includes(q));
  });
});

/* ---------- virtualização: só as linhas visíveis (mais uma margem) ficam na página ---------- */
const TOTAL_COLUNAS = Object.values(COLUNAS).flat().length + 1; // + coluna de ações
// larguras fixas (px), na ordem das colunas: com só parte das linhas desenhada, a largura automática "pularia" ao rolar
const LARGURAS = [180, 70, 85, 120, 125, 100, 105, 150, 125, 120, 48];
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

const kpi = computed(() => {
  const abertas = doPeriodo.value.filter(ehAberta);
  return {
    abertas: abertas.length,
    posicoes: abertas.reduce((s, v) => s + n(v.posicoes), 0),
    foraSla: abertas.filter(foraSla).length,
    fechadas: doPeriodo.value.filter(v => v.status === 'fechada').length,
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
      <span class="badge">{{ vagas.length === 1 ? '1 vaga' : `${vagas.length} vagas` }}</span>
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
        <select v-model="filtro" aria-label="Filtrar por status">
          <option value="todas">Todas</option>
          <option value="abertas">Abertas</option>
          <option value="fora">Fora do SLA</option>
          <option value="fechadas">Fechadas</option>
          <option value="congeladas">Congeladas</option>
          <option value="canceladas">Canceladas</option>
          <option value="antigas">Abertas de meses anteriores</option>
        </select>
        <button v-if="temFiltro" type="button" class="link" title="Volta para os últimos 3 meses, sem busca e com todos os status" @click="limparFiltros">Limpar filtros</button>
        <button class="ghost push" :disabled="!lista.length" @click="exportar">Exportar CSV</button>
      </div>

      <div v-if="!vagas.length" class="empty">
        <p>Nenhuma vaga lançada ainda.</p>
        <RouterLink class="primary" to="/lancamento">Lançar primeira vaga</RouterLink>
      </div>
      <p v-else-if="!lista.length" class="empty">Nenhuma vaga encontrada com esses filtros.</p>

      <div v-else ref="wrapEl" class="table-wrap" @scroll.passive="rolou">
        <table class="tabela-secoes">
          <colgroup><col v-for="(l, i) in LARGURAS" :key="i" :style="{ width: l + 'px' }"></colgroup>
          <thead>
            <tr class="grupo">
              <th v-for="s in SECOES" :key="s.key" :colspan="COLUNAS[s.key].length" class="ini">
                <span :title="s.titulo">{{ s.curto || s.titulo }}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
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
              <td v-bind="cel(v, SEC.remuneracao, true)" class="num">{{ brl(calc(v).mensal) }}<small>Anual {{ brl(calc(v).anual) }}</small></td>
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
