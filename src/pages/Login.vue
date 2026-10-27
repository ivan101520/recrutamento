<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { entrar, sessao } from '../auth.js';
import { isDark, alternarTema } from '../tema.js';
import DigitField from '../components/DigitField.vue';

const router = useRouter();
const route = useRoute();
const usuario = ref('');
const senha = ref('');
const ocupado = ref(false);
const erro = ref(sessao.motivo === 'expirou' ? 'Sua sessão expirou. Entre novamente.' : '');

async function enviar() {
  const u = usuario.value.trim();
  if (!u || !senha.value) {
    erro.value = !u && !senha.value ? 'Informe o usuário e a senha para entrar.' : !u ? 'Informe o usuário.' : 'Informe a senha.';
    return;
  }
  ocupado.value = true;
  erro.value = '';
  try {
    await entrar(u, senha.value);
    // só aceita voltar para uma página do próprio app
    const destino = String(route.query.redirect || '');
    router.replace(destino.startsWith('/') && !destino.startsWith('//') ? destino : '/lancamento');
  } catch (e) {
    erro.value = e.message;
    senha.value = '';
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <div class="login">
    <aside class="login-marca" aria-hidden="true">
      <DigitField />
      <div class="login-logo">
        <img src="/logo.png" alt="">
        <div class="gg-lines"><span></span><span></span><span></span></div>
      </div>
    </aside>

    <div class="login-lado">
      <DigitField adaptive media="(max-width: 767px)" />
      <button type="button" class="login-tema" :aria-label="isDark ? 'Modo claro' : 'Modo noturno'" :title="isDark ? 'Modo claro' : 'Modo noturno'" @click="alternarTema">
        <svg v-if="isDark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      </button>

      <main class="login-form">
        <header>
          <div class="login-logo-mobile">
            <img v-if="isDark" src="/logo.png" alt="Gente &amp; Gestão">
            <img v-else src="/logo-on-light.png" alt="Gente &amp; Gestão">
          </div>
          <h1>Entrar</h1>
          <p>Vagas · Gente &amp; Gestão do Grupo Modena &amp; Araújo</p>
        </header>

        <form data-enter="enviar" novalidate @submit.prevent="enviar">
          <label>Usuário
            <input v-model="usuario" type="text" placeholder="Digite seu usuário" autocomplete="username" autocapitalize="none" spellcheck="false">
          </label>
          <label>Senha
            <input v-model="senha" type="password" placeholder="••••••••" autocomplete="current-password">
          </label>
          <p v-if="erro" class="hint danger" role="alert">{{ erro }}</p>
          <button type="submit" class="primary" :disabled="ocupado">{{ ocupado ? 'Entrando...' : 'Entrar' }}</button>
        </form>
      </main>

      <footer class="login-rodape">Desenvolvido por <strong>IBDS</strong></footer>
    </div>
  </div>
</template>
