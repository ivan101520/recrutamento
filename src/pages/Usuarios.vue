<script setup>
// Mesmas funções da aba Usuários do Gente & Gestão: listar, cadastrar (+), editar nome/perfil/senha e excluir.
import { onMounted, reactive, ref } from 'vue';
import { api, avisar } from '../store.js';
import { sessao } from '../auth.js';
import Modal from '../components/Modal.vue';

const PERFIS = { admin: 'Administrador', analista: 'Analista' };

const lista = ref([]);
const carregandoLista = ref(true);
const ehVoce = u => String(sessao.usuario?.id) === String(u.id);
const inicial = u => String(u.nome || u.usuario || '?').trim().charAt(0).toUpperCase();
const dataHora = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

async function carregarLista() {
  carregandoLista.value = true;
  try {
    lista.value = (await api('/usuarios')).usuarios.sort((a, b) => a.usuario.localeCompare(b.usuario));
  } catch (e) {
    avisar(`Não foi possível carregar os usuários. ${e.message}`);
  } finally {
    carregandoLista.value = false;
  }
}
onMounted(carregarLista);

/* ---------- novo usuário ---------- */
const criando = ref(false);
const novo = reactive({ usuario: '', nome: '', perfil: 'analista', senha: '' });
const erroNovo = ref('');
const ocupadoNovo = ref(false);

function abrirNovo() {
  Object.assign(novo, { usuario: '', nome: '', perfil: 'analista', senha: '' });
  erroNovo.value = '';
  criando.value = true;
}

async function cadastrar() {
  erroNovo.value = '';
  const usuario = novo.usuario.trim().toLowerCase();
  const nome = novo.nome.trim();
  if (!usuario || !nome || !novo.senha) return (erroNovo.value = 'Preencha todos os campos.');
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return (erroNovo.value = 'O usuário deve ter de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.');
  if (novo.senha.length < 6) return (erroNovo.value = 'A senha deve ter no mínimo 6 caracteres.');
  ocupadoNovo.value = true;
  try {
    await api('/usuarios', 'POST', { usuario, nome, perfil: novo.perfil, senha: novo.senha });
    criando.value = false;
    avisar(`Usuário "${usuario}" criado.`);
    carregarLista();
  } catch (e) {
    erroNovo.value = e.message;
  } finally {
    ocupadoNovo.value = false;
  }
}

/* ---------- editar / excluir ---------- */
const editando = ref(null);
const edicao = reactive({ nome: '', perfil: 'analista', senha: '' });
const erroEdicao = ref('');
const ocupadoEdicao = ref(false);
const excluindo = ref(null);

function abrirEdicao(u) {
  editando.value = u;
  Object.assign(edicao, { nome: u.nome || '', perfil: u.perfil, senha: '' });
  erroEdicao.value = '';
}

async function salvarEdicao() {
  const u = editando.value;
  const nome = edicao.nome.trim();
  if (!nome) return (erroEdicao.value = 'Informe o nome.');
  if (edicao.senha && edicao.senha.length < 6) return (erroEdicao.value = 'A nova senha deve ter no mínimo 6 caracteres.');
  const mud = {};
  if (nome !== (u.nome || '')) mud.nome = nome;
  if (edicao.perfil !== u.perfil) mud.perfil = edicao.perfil;
  if (edicao.senha) mud.senha = edicao.senha;
  if (!Object.keys(mud).length) return (editando.value = null);

  ocupadoEdicao.value = true;
  erroEdicao.value = '';
  try {
    await api(`/usuarios/${encodeURIComponent(u.id)}`, 'PATCH', mud);
    editando.value = null;
    avisar(mud.senha
      ? `Usuário "${u.usuario}" atualizado. A nova senha já vale, e as sessões abertas dele foram encerradas.`
      : `Usuário "${u.usuario}" atualizado.`);
    carregarLista();
  } catch (e) {
    erroEdicao.value = e.message || 'Não foi possível salvar as alterações.';
  } finally {
    ocupadoEdicao.value = false;
  }
}

async function confirmarExclusao() {
  const u = excluindo.value;
  try {
    await api(`/usuarios/${encodeURIComponent(u.id)}`, 'DELETE');
    excluindo.value = null;
    editando.value = null;
    avisar('Usuário excluído.');
    carregarLista();
  } catch (e) {
    excluindo.value = null;
    avisar(e.message || 'Não foi possível excluir o usuário.');
  }
}
</script>

<template>
  <main class="wrap">
    <header class="page-head">
      <div class="usuarios-titulo">
        <h1>Usuários</h1>
        <button type="button" class="usuarios-mais" title="Novo usuário" aria-label="Novo usuário" @click="abrirNovo">+</button>
      </div>
      <span class="badge">{{ lista.length === 1 ? '1 usuário' : `${lista.length} usuários` }}</span>
    </header>

    <p v-if="carregandoLista" class="empty">Carregando usuários...</p>

    <ul v-else-if="lista.length" class="usuarios-cards">
      <li v-for="u in lista" :key="u.id">
        <button type="button" class="usuario-card" :aria-label="`Editar usuário ${u.usuario}`" @click="abrirEdicao(u)">
          <span class="usuario-avatar" :class="{ admin: u.perfil === 'admin' }" aria-hidden="true">{{ inicial(u) }}</span>
          <span class="usuario-info">
            <span class="usuario-nome">
              <strong>{{ u.nome || u.usuario }}</strong>
              <span v-if="ehVoce(u)" class="usuario-voce">Você</span>
              <span v-if="!u.ativo" class="pill st-cancelada">Inativo</span>
            </span>
            <span class="usuario-login">@{{ u.usuario }}</span>
            <span class="usuario-meta">
              <i :class="{ admin: u.perfil === 'admin' }" aria-hidden="true"></i>
              {{ PERFIS[u.perfil] || u.perfil }}
              <span aria-hidden="true">|</span>
              {{ dataHora(u.criado_em) }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <div v-else class="empty">
      <p><strong>Nenhum usuário cadastrado</strong></p>
      <p>Use o botão “+” para cadastrar o primeiro usuário.</p>
    </div>

    <!-- editar -->
    <Modal :open="!!editando" title="Editar usuário" @close="editando = null">
      <form v-if="editando" id="form-editar-usuario" class="modal-form-usuario" novalidate @submit.prevent="salvarEdicao">
        <div class="usuario-login-box"><span>Login</span><span class="badge">{{ editando.usuario }}</span></div>
        <label>Nome<input v-model="edicao.nome" placeholder="Nome de exibição"></label>
        <label>Perfil
          <select v-model="edicao.perfil" :disabled="ehVoce(editando)">
            <option value="admin">Administrador</option>
            <option value="analista">Analista</option>
          </select>
          <small v-if="ehVoce(editando)" class="dica">Você não pode alterar o próprio perfil.</small>
        </label>
        <label v-if="!ehVoce(editando)">Nova senha
          <input v-model="edicao.senha" type="password" placeholder="Deixe em branco para manter a atual" autocomplete="new-password">
          <small class="dica">Mínimo 6 caracteres. Não precisa da senha atual do usuário.</small>
        </label>
        <p v-if="erroEdicao" class="hint danger" role="alert">{{ erroEdicao }}</p>
      </form>
      <template #nota>
        <button v-if="editando && !ehVoce(editando)" type="button" class="link danger" @click="excluindo = editando">Excluir usuário</button>
      </template>
      <template #actions>
        <button type="button" class="ghost" @click="editando = null">Cancelar</button>
        <button type="submit" form="form-editar-usuario" class="primary" :disabled="ocupadoEdicao">{{ ocupadoEdicao ? 'Salvando...' : 'Salvar' }}</button>
      </template>
    </Modal>

    <!-- novo -->
    <Modal :open="criando" title="Novo usuário" @close="criando = false">
      <form id="form-novo-usuario" class="modal-form-usuario" novalidate @submit.prevent="cadastrar">
        <label>Usuário<input v-model="novo.usuario" data-minusculas autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Ex.: ivan"></label>
        <label>Nome<input v-model="novo.nome" placeholder="Nome de exibição"></label>
        <label>Perfil
          <select v-model="novo.perfil">
            <option value="admin">Administrador</option>
            <option value="analista">Analista</option>
          </select>
        </label>
        <label>Senha<input v-model="novo.senha" type="password" placeholder="Mínimo 6 caracteres" autocomplete="new-password"></label>
        <p v-if="erroNovo" class="hint danger" role="alert">{{ erroNovo }}</p>
      </form>
      <template #actions>
        <button type="button" class="ghost" @click="criando = false">Cancelar</button>
        <button type="submit" form="form-novo-usuario" class="primary" :disabled="ocupadoNovo">{{ ocupadoNovo ? 'Cadastrando...' : 'Cadastrar' }}</button>
      </template>
    </Modal>

    <!-- confirmar exclusão -->
    <Modal :open="!!excluindo" class="perigo" title="Excluir usuário?" subtitle="Essa ação não pode ser desfeita." @close="excluindo = null">
      <p v-if="excluindo">O usuário "<strong>{{ excluindo.usuario }}</strong>" ({{ excluindo.nome }}) será removido e perderá o acesso.</p>
      <template #actions>
        <button type="button" class="ghost" @click="excluindo = null">Cancelar</button>
        <button type="button" class="btn-perigo" @click="confirmarExclusao">Excluir</button>
      </template>
    </Modal>
  </main>
</template>
