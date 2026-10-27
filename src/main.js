import { createApp } from 'vue';
import App from './App.vue';
import router from './router.js';
import './assets/styles.css';

// Converte para maiúsculas em todos os campos de texto de qualquer página.
// Roda na captura do evento, antes do v-model ler o valor, então o que é salvo já vem em maiúsculas.
document.addEventListener('input', e => {
  const el = e.target;
  if (e.isComposing || !el.matches('input:not([type]), input[type="text"], input[type="search"], textarea')) return;
  if (el.autocomplete === 'username' || el.hasAttribute('data-minusculas')) return; // nome de usuário fica como digitado
  const maiusculo = el.value.toUpperCase();
  if (maiusculo === el.value) return;
  const { selectionStart: ini, selectionEnd: fim } = el;
  el.value = maiusculo;
  el.setSelectionRange(ini, fim); // mantém o cursor no lugar ao editar no meio do texto
}, true);

// Enter passa para o próximo campo do formulário; no último, vai para o botão de salvar.
// No campo de texto longo (textarea), Shift+Enter quebra a linha.
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || !el.form) return;
  if (!el.matches('input, select, textarea') || (el.tagName === 'TEXTAREA' && e.shiftKey)) return;
  const campos = [...el.form.querySelectorAll('input, select, textarea')]
    .filter(c => !c.disabled && c.type !== 'hidden' && c.offsetParent !== null);
  const proximo = campos[campos.indexOf(el) + 1];
  if (proximo) {
    e.preventDefault();
    proximo.focus();
    return;
  }
  // formulário de um campo só (ex.: Ajustes) ou marcado com data-enter="enviar" (login): Enter no último campo envia
  if (campos.length === 1 || el.form.dataset.enter === 'enviar') return;
  const botao = el.form.querySelector('[type="submit"]') || (el.form.id && document.querySelector(`[type="submit"][form="${el.form.id}"]`));
  if (botao) {
    e.preventDefault();
    botao.focus();
  }
});

createApp(App).use(router).mount('#app');
