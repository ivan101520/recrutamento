<script setup>
// Tela de carregamento igual à do Gente & Gestão: fundo de dígitos + régua com ponto dourado.
import DigitField from './DigitField.vue';

defineProps({ show: Boolean, label: { type: String, default: 'Carregando informações...' } });
</script>

<template>
  <Teleport to="body">
    <Transition name="carregando-fade">
      <div v-if="show" class="tela-carregando" role="status" aria-live="polite">
        <DigitField media="all" />
        <div class="carregando-col">
          <div class="gg-rule" aria-hidden="true"><span class="gg-dot"></span></div>
          <p>{{ label }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
