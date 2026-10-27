<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { form, nomeVaga, criarVaga, buscarDuplicadas, vazio, avisar, SECOES, erroDatas, paraSalvar, rotuloStatus } from '../store.js';
import { n, brl, data, calc } from '../utils.js';
import Modal from '../components/Modal.vue';
import SecaoCampos from '../components/SecaoCampos.vue';

const router = useRouter();
const formEl = ref(null);
const erro = ref('');
const perguntarDuplicada = ref(false);
const salvando = ref(false); // evita lançar duas vezes enquanto a planilha responde

const totais = computed(() => calc(form));
const duplicadas = ref([]); // preenchida ao salvar, com a resposta da API
const prazoSla = computed(() => {
  if (!form.iniciada || !n(form.sla)) return '';
  const d = new Date(form.iniciada + 'T12:00');
  d.setDate(d.getDate() + n(form.sla));
  return d.toLocaleDateString('sv');
});

function novo() {
  Object.assign(form, vazio());
  erro.value = '';
}

async function salvar(confirmouDuplicada = false) {
  if (salvando.value) return;
  erro.value = '';
  perguntarDuplicada.value = false;
  // datas antes da validação do navegador: o min do campo Fechada daria a mensagem genérica de obrigatório
  erro.value = erroDatas(form);
  if (erro.value) return;
  if (!formEl.value.checkValidity()) {
    formEl.value.reportValidity();
    erro.value = 'Preencha os campos obrigatórios: cargo, posições, filial (escolhida da lista), estado e data de início.';
    return;
  }
  salvando.value = true;
  try {
    // confere o código na planilha inteira: a lista da tela só tem o período do Histórico
    if (!confirmouDuplicada) {
      duplicadas.value = await buscarDuplicadas(form);
      if (duplicadas.value.length) {
        perguntarDuplicada.value = true;
        return;
      }
    }
    const registro = { ...paraSalvar(form), id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) };
    if (!(await criarVaga(registro))) return;
    avisar(`Vaga ${nomeVaga(registro)} lançada.`);
    novo();
    router.push('/historico');
  } catch (e) {
    erro.value = `Não foi possível conferir o código Pandapé. ${e.message}`;
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <main class="wrap">
    <header class="page-head">
      <div>
        <h1>Nova vaga</h1>
        <p>Preencha os dados da requisição. Campos com * são obrigatórios.</p>
      </div>
    </header>

    <div class="form-layout">
      <form ref="formEl" class="sheet" novalidate @submit.prevent="salvar()">
        <fieldset v-for="s in SECOES" :key="s.key">
          <legend>{{ s.titulo }}</legend>
          <SecaoCampos :secao="s.key" :v="form" />
        </fieldset>

        <p v-if="erro" class="hint danger" role="alert">{{ erro }}</p>
        <div class="actions">
          <button type="button" class="ghost" @click="novo">Limpar</button>
          <button type="submit" class="primary" :disabled="salvando">{{ salvando ? 'Salvando…' : 'Lançar vaga' }}</button>
        </div>
      </form>

      <aside class="summary sheet" aria-label="Resumo da vaga">
        <p class="eyebrow">Resumo</p>
        <h2>{{ form.cargo || 'Cargo não informado' }}</h2>
        <p class="muted">{{ [form.filial, form.setor, form.estado].filter(Boolean).join(', ') || 'Local não informado' }}</p>
        <dl>
          <div><dt>Posições</dt><dd>{{ form.posicoes || 0 }}</dd></div>
          <div><dt>Contrato</dt><dd>{{ form.contrato }}</dd></div>
          <div><dt>Prazo do SLA</dt><dd>{{ prazoSla ? data(prazoSla) : '—' }}</dd></div>
        </dl>
        <div class="money">
          <div><span>Mensal</span><strong>{{ brl(totais.mensal) }}</strong></div>
          <div><span>Anual</span><strong>{{ brl(totais.anual) }}</strong></div>
          <small>Por posição. Anual = mensal × 12.</small>
        </div>
      </aside>
    </div>

    <Modal :open="perguntarDuplicada" title="Vaga duplicada" subtitle="Este Cód. Pandapé já foi usado" @close="perguntarDuplicada = false">
      <template #icone>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" /></svg>
      </template>
      <p>
        Já {{ duplicadas.length === 1 ? 'existe 1 vaga' : `existem ${duplicadas.length} vagas` }}
        com o Cód. Pandapé <strong>{{ form.codigo }}</strong>. Deseja lançar outra mesmo assim?
      </p>
      <ul class="modal-list">
        <li v-for="d in duplicadas" :key="d.id">
          <strong>{{ d.cargo }}</strong>
          <small>{{ [d.filial, d.estado].filter(Boolean).join(', ') }}, iniciada em {{ data(d.iniciada) }}{{ d.status === 'fechada' ? `, fechada em ${data(d.fechada)}` : `, ${rotuloStatus(d.status).toLowerCase()}` }}</small>
        </li>
      </ul>
      <template #actions>
        <button type="button" class="ghost" @click="perguntarDuplicada = false">Cancelar</button>
        <button type="button" class="primary" @click="salvar(true)">Lançar outra vaga</button>
      </template>
    </Modal>
  </main>
</template>
