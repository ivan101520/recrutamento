<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({ open: Boolean, title: String, subtitle: String });
const emit = defineEmits(['close']);
const el = ref(null);

const sincronizar = aberto => {
  if (!el.value) return;
  if (aberto && !el.value.open) el.value.showModal();
  if (!aberto && el.value.open) el.value.close();
};
watch(() => props.open, sincronizar);
onMounted(() => sincronizar(props.open));
</script>

<template>
  <!-- @click.self: clique no fundo escuro (fora da caixa) fecha -->
  <dialog ref="el" class="modal" :aria-label="title" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="modal-box">
      <header class="modal-head">
        <span v-if="$slots.icone" class="modal-icone" aria-hidden="true"><slot name="icone" /></span>
        <div class="modal-titulos">
          <h2>{{ title }}</h2>
          <p v-if="subtitle" class="modal-sub">{{ subtitle }}</p>
          <div v-if="$slots.meta" class="modal-meta"><slot name="meta" /></div>
        </div>
        <button type="button" class="modal-x" aria-label="Fechar" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div class="modal-corpo"><slot /></div>

      <footer class="modal-rodape">
        <span class="modal-nota"><slot name="nota" /></span>
        <div class="modal-actions"><slot name="actions" /></div>
      </footer>
    </div>
  </dialog>
</template>
