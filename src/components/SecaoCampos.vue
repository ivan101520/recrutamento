<script setup>
import { computed } from 'vue';
import CampoBusca from './CampoBusca.vue';
import { opcoes, recrutadoras, CONTRATOS, STATUS, opts, ehSubstituicao, duplicadasDe } from '../store.js';
import { brl, calc } from '../utils.js';

// v: objeto reativo da vaga (o formulário de lançamento ou o rascunho do modal); os campos são editados direto nele
const props = defineProps({ secao: { type: String, required: true }, v: { type: Object, required: true } });

const duplicadas = computed(() => duplicadasDe(props.v));
const substituicao = computed(() => ehSubstituicao(props.v));
const totais = computed(() => calc(props.v));
const MOEDAS = [
  { campo: 'remuneracao', rotulo: 'Remuneração' },
  { campo: 'periculosidade', rotulo: 'Periculosidade' },
  { campo: 'premiacao', rotulo: 'Premiação' },
  { campo: 'assiduidade', rotulo: 'Assiduidade' },
  { campo: 'alimentacao', rotulo: 'Alimentação' },
  { campo: 'adicional', rotulo: 'Adicional' },
];
</script>

<template>
  <template v-if="secao === 'vaga'">
    <div class="grid">
      <label>Cód. Pandapé<input v-model.trim="v.codigo" placeholder="Ex.: 104582"></label>
      <label class="span2 cargo">Cargo *<input v-model.trim="v.cargo" required placeholder="Ex.: Auxiliar de logística"></label>
      <label>Horário
        <select v-model="v.horario"><option value="">—</option><option v-for="o in opts('horarios', v.horario)" :key="o">{{ o }}</option></select>
      </label>
      <label>Tipo de contrato
        <select v-model="v.contrato"><option v-for="c in CONTRATOS" :key="c">{{ c }}</option></select>
      </label>
      <label>Total de posições *<input v-model.number="v.posicoes" type="number" min="1" required></label>
      <label>SLA (dias)<input v-model.number="v.sla" type="number" min="1"></label>
    </div>
    <p v-if="duplicadas.length" class="hint warn">Já existe outra vaga com o código {{ v.codigo }}.</p>
    <p v-if="!opcoes.horarios.length" class="hint warn">Nenhum horário cadastrado. <RouterLink to="/ajustes">Cadastre em Ajustes</RouterLink>.</p>
  </template>

  <template v-else-if="secao === 'local'">
    <div class="grid">
      <label>Filial *
        <CampoBusca v-model="v.filial" :opcoes="opcoes.filiais" required placeholder="Digite para buscar" mensagem="Escolha uma filial da lista." />
      </label>
      <label>Setor
        <select v-model="v.setor"><option value="">—</option><option v-for="o in opts('setores', v.setor)" :key="o">{{ o }}</option></select>
      </label>
      <label>Estado *
        <select v-model="v.estado" required><option value="">Selecione</option><option v-for="o in opts('estados', v.estado)" :key="o">{{ o }}</option></select>
      </label>
      <label>Solicitante<input v-model.trim="v.solicitante"></label>
      <label>Recrutadora<input v-model.trim="v.recrutadora" list="recrutadoras"></label>
      <datalist id="recrutadoras"><option v-for="r in recrutadoras" :key="r" :value="r"></option></datalist>
    </div>
    <p v-if="!opcoes.filiais.length" class="hint warn">Nenhuma filial cadastrada. <RouterLink to="/ajustes">Cadastre em Ajustes</RouterLink>.</p>
  </template>

  <template v-else-if="secao === 'etapas'">
    <div class="grid">
      <label>Iniciada *<input v-model="v.iniciada" type="date" required></label>
      <label>Status da vaga
        <select v-model="v.status"><option v-for="s in STATUS" :key="s.key" :value="s.key">{{ s.rotulo }}</option></select>
      </label>
      <label v-if="v.status === 'fechada'">Fechada em *<input v-model="v.fechada" type="date" :min="v.iniciada" required></label>
      <label>Situação
        <select v-model="v.situacao"><option value="">—</option><option v-for="o in opts('situacoes', v.situacao)" :key="o">{{ o }}</option></select>
      </label>
      <label>Admissão<input v-model="v.admissao" type="date" :min="v.iniciada"></label>
    </div>
  </template>

  <template v-else-if="secao === 'motivo'">
    <div class="grid">
      <label class="span2">Motivo de contratação
        <select v-model="v.motivo"><option value="">—</option><option v-for="o in opts('motivos', v.motivo)" :key="o">{{ o }}</option></select>
      </label>
      <label v-if="substituicao" class="span2">Substituição<input v-model.trim="v.substituicao" placeholder="Nome de quem será substituído"></label>
      <label class="span2">Nova contratação<input v-model.trim="v.novaContratacao" placeholder="Nome da nova contratação"></label>
    </div>
  </template>

  <template v-else-if="secao === 'remuneracao'">
    <div class="grid">
      <label v-for="c in MOEDAS" :key="c.campo">{{ c.rotulo }}
        <span class="campo-moeda"><span aria-hidden="true">R$</span><input v-model.number="v[c.campo]" type="number" min="0" step="0.01"></span>
      </label>
    </div>
    <div class="totais-secao">
      <div><span>Mensal</span><strong>{{ brl(totais.mensal) }}</strong></div>
      <div><span>Anual</span><strong>{{ brl(totais.anual) }}</strong></div>
    </div>
  </template>

  <template v-else-if="secao === 'obs'">
    <textarea v-model="v.observacoes" rows="4" placeholder="Informações adicionais sobre a vaga" aria-label="Observações"></textarea>
  </template>
</template>
