<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast, carregando, carregar, avisar, vagas } from './store.js';
import { PAGINAS } from './router.js';
import { sessao, sair, ehAdmin } from './auth.js';
import { isDark, alternarTema } from './tema.js';
import TelaCarregando from './components/TelaCarregando.vue';

const route = useRoute();

// primeira carga (ao abrir ou logo após o login): tela na hora, até os dados aparecerem;
// no Recarregar só mostra se passar de 250 ms, para não piscar em respostas rápidas
const mostrarCarregando = ref(false);
let timerCarregando;
watch(carregando, on => {
  clearTimeout(timerCarregando);
  if (!on) mostrarCarregando.value = false;
  else if (!vagas.value.length) mostrarCarregando.value = true;
  else timerCarregando = setTimeout(() => { mostrarCarregando.value = true; }, 250);
}, { immediate: true });
const router = useRouter();

// sessão encerrada (botão Sair, expirou ou a API recusou o token): volta para o login
watch(() => sessao.token, token => {
  if (!token && !route.meta.publica) router.replace({ path: '/login', query: sessao.motivo === 'expirou' ? { redirect: route.fullPath } : {} });
});

const ICONES = {
  '/lancamento': ['M12 5v14M5 12h14'],
  '/historico': ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2'],
  '/ajustes': ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'],
  '/usuarios': ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'],
};

async function recarregar() {
  if (await carregar()) avisar('Dados atualizados da planilha.');
}

// começa recolhida; só abre se a pessoa já tiver expandido antes
const lerColapsada = () => { try { return localStorage.getItem('vagas-sidebar') !== 'aberta'; } catch { return true; } };
const colapsada = ref(lerColapsada());
function alternarSidebar() {
  colapsada.value = !colapsada.value;
  try { localStorage.setItem('vagas-sidebar', colapsada.value ? 'recolhida' : 'aberta'); } catch {}
}
</script>

<template>
  <RouterView v-if="route.meta.publica" />
  <div v-else class="shell" :class="{ colapsada }">
    <aside class="sidebar" aria-label="Painel de controle">
      <div class="sidebar-topo">
        <RouterLink to="/historico" class="logo" aria-label="Vagas, início">
          <img src="/logo.png" alt="Grupo Modena &amp; Araújo">
        </RouterLink>
        <button
          type="button" class="recolher-btn"
          :aria-label="colapsada ? 'Expandir menu' : 'Recolher menu'" :title="colapsada ? 'Expandir menu' : 'Recolher menu'"
          :aria-expanded="!colapsada" @click="alternarSidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline v-if="colapsada" points="9 18 15 12 9 6" />
            <polyline v-else points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <nav class="nav" aria-label="Páginas">
        <p class="nav-title">Vagas</p>
        <RouterLink v-for="p in PAGINAS.filter(x => !x.admin || ehAdmin())" :key="p.path" :to="p.path" active-class="on" :title="colapsada ? p.titulo : undefined" :aria-label="p.titulo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-for="d in ICONES[p.path]" :key="d" :d="d" />
          </svg>
          <span>{{ p.titulo }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <button type="button" class="theme-btn" :class="{ girando: carregando }" :disabled="carregando" aria-label="Recarregar dados da planilha" :title="colapsada ? 'Recarregar' : undefined" @click="recarregar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
          </svg>
          <span>{{ carregando ? 'Carregando…' : 'Recarregar' }}</span>
        </button>
        <button type="button" class="theme-btn" :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo noturno'" :title="colapsada ? (isDark ? 'Modo claro' : 'Modo noturno') : undefined" @click="alternarTema">
          <svg v-if="isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
          <span>{{ isDark ? 'Modo claro' : 'Modo noturno' }}</span>
        </button>
        <button type="button" class="theme-btn" :aria-label="`Sair (${sessao.usuario?.nome || ''})`" :title="colapsada ? `Sair (${sessao.usuario?.nome || ''})` : sessao.usuario?.nome" @click="sair()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span>Sair</span>
        </button>
      </div>
    </aside>

    <div class="content">
      <RouterView />
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
  <!-- fora do v-if para cobrir também a tela de login enquanto os dados carregam -->
  <TelaCarregando :show="mostrarCarregando" />
</template>
