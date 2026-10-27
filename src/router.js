import { createRouter, createWebHashHistory } from 'vue-router';
import Lancamento from './pages/Lancamento.vue';
import Historico from './pages/Historico.vue';
import Ajustes from './pages/Ajustes.vue';
import Login from './pages/Login.vue';
import Usuarios from './pages/Usuarios.vue';
import { logado, ehAdmin } from './auth.js';

// páginas exibidas no menu, na ordem das abas
export const PAGINAS = [
  { path: '/lancamento', titulo: 'Lançamento', component: Lancamento },
  { path: '/historico', titulo: 'Histórico', component: Historico },
  { path: '/ajustes', titulo: 'Ajustes', component: Ajustes },
  { path: '/usuarios', titulo: 'Usuários', component: Usuarios, admin: true },
];

const router = createRouter({
  // hash (#/historico) funciona em qualquer hospedagem estática, sem configurar o servidor
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login, meta: { publica: true } },
    ...PAGINAS.map(({ path, titulo, component, admin }) => ({ path, component, meta: { titulo, admin } })),
    { path: '/:pathMatch(.*)*', redirect: '/historico' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// sem login só abre a tela de login; logado, a tela de login volta para o app
router.beforeEach(to => {
  if (to.meta.publica) return logado() ? '/historico' : true;
  if (!logado()) return { path: '/login', query: { redirect: to.fullPath } };
  if (to.meta.admin && !ehAdmin()) return '/historico'; // a API também recusa: isto só esconde a tela
});

export default router;
