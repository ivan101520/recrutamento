<script setup>
import { reactive } from 'vue';
import { opcoes, LISTAS, avisar } from '../store.js';
import { normalizar } from '../utils.js';

const novaOpcao = reactive({});
const busca = reactive({});

const filtradas = lista => {
  const q = normalizar((busca[lista] || '').trim());
  return q ? opcoes[lista].filter(o => normalizar(o).includes(q)) : opcoes[lista];
};

function adicionar(lista) {
  const valor = (novaOpcao[lista] || '').trim();
  if (!valor) return;
  if (opcoes[lista].some(o => normalizar(o) === normalizar(valor))) return avisar(`"${valor}" já está na lista.`);
  opcoes[lista].push(valor);
  novaOpcao[lista] = '';
}

function remover(lista, valor) {
  opcoes[lista].splice(opcoes[lista].indexOf(valor), 1);
  avisar(`"${valor}" removido.`);
}
</script>

<template>
  <main class="wrap">
    <header class="page-head">
      <div>
        <h1>Ajustes</h1>
        <p>Personalize as opções das listas do lançamento. Remover uma opção não altera as vagas já lançadas.</p>
      </div>
    </header>
    <div class="ajustes">
      <section v-for="l in LISTAS" :key="l.key" class="sheet lista">
        <h2>{{ l.titulo }} <span class="badge">{{ opcoes[l.key].length }}</span></h2>

        <form class="add" @submit.prevent="adicionar(l.key)">
          <input v-model="novaOpcao[l.key]" :placeholder="'Nova opção em ' + l.titulo.toLowerCase()" :aria-label="'Nova opção em ' + l.titulo">
          <button class="primary" type="submit">Adicionar</button>
        </form>

        <div class="lista-busca">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input v-model="busca[l.key]" type="search" :placeholder="'Buscar em ' + l.titulo.toLowerCase()" :aria-label="'Buscar em ' + l.titulo" :disabled="!opcoes[l.key].length">
        </div>

        <div class="lista-itens">
          <p v-if="!opcoes[l.key].length" class="lista-vazia">Nenhuma opção cadastrada.</p>
          <p v-else-if="!filtradas(l.key).length" class="lista-vazia">Nada encontrado para "{{ busca[l.key] }}".</p>
          <ul v-else>
            <li v-for="o in filtradas(l.key)" :key="o">
              <span>{{ o }}</span>
              <button class="link danger" :aria-label="'Remover ' + o" @click="remover(l.key, o)">Remover</button>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </main>
</template>
