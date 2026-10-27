// Tema claro/escuro, usado pela barra lateral e pela tela de login.
import { ref } from 'vue';

// mesma chave do painel Gente & Gestão: o tema escolhido vale para os dois
export const isDark = ref(document.documentElement.classList.contains('dark'));
export function alternarTema() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle('dark', isDark.value);
  try { localStorage.setItem('gg-theme', isDark.value ? 'dark' : 'light'); } catch {}
}
