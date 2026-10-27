import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './', // permite abrir a pasta dist/ em qualquer caminho
  // usePolling: no Windows o monitor padrão às vezes perde alterações e a tela não atualiza
  server: { port: 5173, open: true, watch: { usePolling: true, interval: 300 } },
});
