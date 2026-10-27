import { createRouter, createWebHashHistory } from 'vue-router';
import Lancamento from './pages/Lancamento.vue';
import Historico from './pages/Historico.vue';
import Ajustes from './pages/Ajustes.vue';
import Login from './pages/Login.vue';
import { logado } from './auth.js';

// páginas exibidas no menu, na ordem das abas
export const PAGINAS = [
  { path: '/lancamento', titulo: 'Lançamento', component: Lancamento },
  { path: '/historico', titulo: 'Histórico', component: Historico },
  { path: '/ajustes', titulo: 'Ajustes', component: Ajustes },
];

const router = createRouter({
  // hash (#/historico) funciona em qualquer hospedagem estática, sem configurar o servidor
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login, meta: { publica: true } },
    ...PAGINAS.map(({ path, titulo, component }) => ({ path, component, meta: { titulo } })),
    { path: '/:pathMatch(.*)*', redirect: '/lancamento' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// sem login só abre a tela de login; logado, a tela de login volta para o app
router.beforeEach(to => {
  if (to.meta.publica) return logado() ? '/lancamento' : true;
  if (!logado()) return { path: '/login', query: { redirect: to.fullPath } };
});

export default router;
