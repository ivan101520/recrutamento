<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { data, hoje } from '../utils.js';

// { modo: 'data' | 'mes', de: 'AAAA-MM-DD' | 'AAAA-MM', ate: idem }
const periodo = defineModel({ type: Object, required: true });

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const pad = n => String(n).padStart(2, '0');
const fmt = (s, modo) => modo === 'mes' ? `${MESES[+s.slice(5, 7) - 1]}/${s.slice(0, 4)}` : data(s);

const aberto = ref(false);
const paraDireita = ref(false);
const raiz = ref(null);
const rascunho = reactive({ modo: 'data', de: '', ate: '' });
const visao = reactive({ ano: 2026, mes: 0 }); // mes de 0 a 11
const hover = ref('');

const rotulo = computed(() => {
  const { modo, de, ate } = periodo.value;
  if (!de) return 'Todo o período';
  return de === ate ? fmt(de, modo) : `${fmt(de, modo)} – ${fmt(ate, modo)}`;
});

const hojeKey = computed(() => rascunho.modo === 'mes' ? hoje().slice(0, 7) : hoje());
const titulo = computed(() => rascunho.modo === 'mes' ? String(visao.ano) : `${MESES_LONGOS[visao.mes]} ${visao.ano}`);

const dias = computed(() => {
  const vazios = new Date(visao.ano, visao.mes, 1).getDay();
  const total = new Date(visao.ano, visao.mes + 1, 0).getDate();
  return [
    ...Array(vazios).fill(null),
    ...Array.from({ length: total }, (_, i) => `${visao.ano}-${pad(visao.mes + 1)}-${pad(i + 1)}`),
  ];
});
const meses = computed(() => MESES.map((rotulo, i) => ({ rotulo, key: `${visao.ano}-${pad(i + 1)}` })));

// enquanto falta o fim, o intervalo acompanha o mouse para mostrar o que será marcado
const outraPonta = computed(() => rascunho.ate || (rascunho.de && hover.value) || rascunho.de);
const ini = computed(() => (outraPonta.value < rascunho.de ? outraPonta.value : rascunho.de));
const fim = computed(() => (outraPonta.value < rascunho.de ? rascunho.de : outraPonta.value));
const classes = k => ({
  ponta: !!ini.value && (k === ini.value || k === fim.value),
  inicio: k === ini.value,
  fim: k === fim.value,
  entre: !!ini.value && k > ini.value && k < fim.value,
  hoje: k === hojeKey.value,
});

const instrucao = computed(() => {
  const { modo, de, ate } = rascunho;
  const unidade = modo === 'mes' ? 'mês' : 'dia';
  if (!de) return `Clique no ${unidade} de início.`;
  if (!ate) return `Início em ${fmt(de, modo)}. Clique no ${unidade} final, ou aplique para filtrar só esse ${unidade}.`;
  return de === ate ? fmt(de, modo) : `${fmt(de, modo)} até ${fmt(ate, modo)}`;
});

function posicionar() {
  const base = rascunho.de || hoje();
  visao.ano = +base.slice(0, 4);
  visao.mes = rascunho.modo === 'mes' ? 0 : +base.slice(5, 7) - 1;
}

function escolher(k) {
  if (!rascunho.de || rascunho.ate) {
    rascunho.de = k;
    rascunho.ate = '';
  } else if (k < rascunho.de) {
    rascunho.ate = rascunho.de;
    rascunho.de = k;
  } else {
    rascunho.ate = k;
  }
}

function navegar(passo) {
  if (rascunho.modo === 'mes') return void (visao.ano += passo);
  const d = new Date(visao.ano, visao.mes + passo, 1);
  visao.ano = d.getFullYear();
  visao.mes = d.getMonth();
}

function alternar() {
  if (!aberto.value) {
    Object.assign(rascunho, periodo.value);
    hover.value = '';
    posicionar();
    // 336 = largura do painel + margem; se não couber à direita do botão, abre alinhado pela direita
    paraDireita.value = raiz.value.getBoundingClientRect().left + 336 > window.innerWidth;
  }
  aberto.value = !aberto.value;
}

function trocarModo(modo) {
  if (rascunho.modo === modo) return;
  Object.assign(rascunho, { modo, de: '', ate: '' });
  posicionar();
}

function aplicar() {
  periodo.value = { ...rascunho, ate: rascunho.ate || rascunho.de };
  aberto.value = false;
}

function limpar() {
  periodo.value = { modo: rascunho.modo, de: '', ate: '' };
  aberto.value = false;
}

const clicouFora = e => { if (aberto.value && !raiz.value.contains(e.target)) aberto.value = false; };
const teclou = e => { if (e.key === 'Escape' && aberto.value) aberto.value = false; };
onMounted(() => {
  document.addEventListener('pointerdown', clicouFora);
  document.addEventListener('keydown', teclou);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', clicouFora);
  document.removeEventListener('keydown', teclou);
});
</script>

<template>
  <div ref="raiz" class="periodo">
    <button type="button" class="filtro-btn" :class="{ ativo: periodo.de }" aria-haspopup="dialog" :aria-expanded="aberto" @click="alternar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <span>{{ rotulo }}</span>
      <svg class="seta" :class="{ girada: aberto }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <div v-if="aberto" class="periodo-painel" :class="{ direita: paraDireita }" role="dialog" aria-label="Filtrar por período">
      <div class="segmento" role="group" aria-label="Tipo de período">
        <button type="button" :aria-pressed="rascunho.modo === 'data'" @click="trocarModo('data')">Por data</button>
        <button type="button" :aria-pressed="rascunho.modo === 'mes'" @click="trocarModo('mes')">Por mês</button>
      </div>

      <div class="cal-nav">
        <button type="button" class="cal-seta" :aria-label="rascunho.modo === 'mes' ? 'Ano anterior' : 'Mês anterior'" @click="navegar(-1)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <strong aria-live="polite">{{ titulo }}</strong>
        <button type="button" class="cal-seta" :aria-label="rascunho.modo === 'mes' ? 'Próximo ano' : 'Próximo mês'" @click="navegar(1)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div v-if="rascunho.modo === 'data'" class="cal-grid dias" @mouseleave="hover = ''">
        <span v-for="(s, i) in SEMANA" :key="'s' + i" class="cal-semana" aria-hidden="true">{{ s }}</span>
        <template v-for="(k, i) in dias" :key="k || 'v' + i">
          <span v-if="!k"></span>
          <button
            v-else type="button" class="cal-cel" :class="classes(k)"
            :aria-label="data(k)" :aria-pressed="k === rascunho.de || k === rascunho.ate"
            @click="escolher(k)" @mouseenter="hover = k" @focus="hover = k"
          >{{ +k.slice(8) }}</button>
        </template>
      </div>

      <div v-else class="cal-grid meses" @mouseleave="hover = ''">
        <button
          v-for="m in meses" :key="m.key" type="button" class="cal-cel" :class="classes(m.key)"
          :aria-label="fmt(m.key, 'mes')" :aria-pressed="m.key === rascunho.de || m.key === rascunho.ate"
          @click="escolher(m.key)" @mouseenter="hover = m.key" @focus="hover = m.key"
        >{{ m.rotulo }}</button>
      </div>

      <p class="periodo-nota" aria-live="polite">{{ instrucao }}</p>
      <p class="periodo-nota fraca">Filtra pela data em que a vaga foi iniciada.</p>

      <div class="periodo-acoes">
        <button type="button" class="ghost" @click="limpar">Limpar</button>
        <button type="button" class="primary" :disabled="!rascunho.de" @click="aplicar">Aplicar</button>
      </div>
    </div>
  </div>
</template>
