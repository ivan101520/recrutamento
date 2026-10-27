<script setup>
// Campo de texto com sugestões: digita, a lista filtra (ignora acentos e maiúsculas) e escolhe com clique ou setas + Enter.
// Só aceita um valor da lista (ou o valor que já veio preenchido, para não travar a edição de registros antigos).
import { computed, ref, useId, watch, watchEffect } from 'vue';
import { normalizar } from '../utils.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  opcoes: { type: Array, required: true },
  required: Boolean,
  placeholder: String,
  mensagem: { type: String, default: 'Escolha uma opção da lista.' },
});
const emit = defineEmits(['update:modelValue']);

const id = useId();
const input = ref(null);
const aberto = ref(false);
const ativo = ref(-1);
const original = props.modelValue;

const filtradas = computed(() => {
  const q = normalizar(props.modelValue);
  return q ? props.opcoes.filter(o => normalizar(o).includes(q)) : props.opcoes;
});
const mostrar = computed(() => aberto.value && filtradas.value.length > 0);

watchEffect(() => {
  const v = props.modelValue;
  input.value?.setCustomValidity(v && v !== original && !props.opcoes.includes(v) ? props.mensagem : '');
});
watch(ativo, i => document.getElementById(`${id}-${i}`)?.scrollIntoView({ block: 'nearest' }), { flush: 'post' });

function digitou(e) {
  emit('update:modelValue', e.target.value);
  aberto.value = true;
  ativo.value = 0;
}
function escolher(o) {
  emit('update:modelValue', o);
  aberto.value = false;
}
function tecla(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = filtradas.value.length;
    if (!aberto.value) { aberto.value = true; ativo.value = 0; return; }
    if (n) ativo.value = (ativo.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
  } else if (e.key === 'Enter' && mostrar.value && ativo.value >= 0) {
    // não usar preventDefault aqui: o Enter segue para o próximo campo (main.js) já com a opção escolhida
    escolher(filtradas.value[ativo.value]);
  } else if (e.key === 'Escape' && aberto.value) {
    e.preventDefault();
    aberto.value = false;
  }
}
function saiu() {
  aberto.value = false;
  if (props.modelValue !== props.modelValue.trim()) emit('update:modelValue', props.modelValue.trim());
}
</script>

<template>
  <div class="campo-busca">
    <input
      ref="input" :value="modelValue" :required="required" :placeholder="placeholder"
      role="combobox" aria-autocomplete="list" autocomplete="off"
      :aria-expanded="mostrar" :aria-controls="id" :aria-activedescendant="mostrar && ativo >= 0 ? `${id}-${ativo}` : undefined"
      @input="digitou" @keydown="tecla" @focus="aberto = true; ativo = -1" @click="aberto = true" @blur="saiu"
    >
    <ul v-show="mostrar" :id="id" role="listbox" class="campo-busca-lista">
      <li
        v-for="(o, i) in filtradas" :id="`${id}-${i}`" :key="o" role="option"
        :aria-selected="i === ativo" :class="{ ativo: i === ativo }"
        @mousedown.prevent="escolher(o)" @mousemove="ativo = i"
      >{{ o }}</li>
    </ul>
  </div>
</template>
