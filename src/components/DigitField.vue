<script setup>
// Fundo animado de dígitos, o mesmo do login do Gente & Gestão (src/digitField.js copiado de lá).
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { createDigitField } from '../digitField.js';

const props = defineProps({
  media: { type: String, default: '(min-width: 768px)' },
  adaptive: { type: Boolean, default: false },
});

const canvas = ref(null);
let campo = null;

onMounted(() => {
  campo = createDigitField(canvas.value, { media: props.media, adaptive: props.adaptive });
  campo.start();
});
onBeforeUnmount(() => campo?.destroy());
</script>

<template>
  <canvas ref="canvas" class="digit-field" aria-hidden="true"></canvas>
</template>
