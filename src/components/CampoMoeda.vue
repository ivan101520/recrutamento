<script setup>
// Máscara de moeda estilo caixa: os dígitos entram pela direita (7 → 0,07; 737 → 7,37; 162100 → 1.621,00)
const valor = defineModel({ type: [Number, String], default: 0 });

const formatar = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function digitar(e) {
  const digitos = e.target.value.replace(/\D/g, '').slice(-11); // até 999.999.999,99
  valor.value = Number(digitos || 0) / 100;
  e.target.value = formatar(valor.value); // reescreve mesmo se o número não mudou (ex.: letra digitada)
}
</script>

<template>
  <input :value="formatar(valor)" type="text" inputmode="numeric" autocomplete="off" @input="digitar" @focus="$event.target.select()">
</template>
