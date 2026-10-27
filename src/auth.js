// Sessão de login. Fica no sessionStorage, como no Gente & Gestão: fechar a aba encerra a sessão.
import { reactive } from 'vue';

const CHAVE = 'vagas-auth';
const vazia = () => ({ token: '', usuario: null, expira: 0 });

function ler() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE));
    return s?.token && s.expira > Date.now() ? s : vazia();
  } catch { return vazia(); }
}

export const sessao = reactive(ler());
export const logado = () => !!sessao.token && sessao.expira > Date.now();
export const ehAdmin = () => sessao.usuario?.perfil === 'admin';

let timer;
function agendarFim() {
  clearTimeout(timer);
  if (sessao.token) timer = setTimeout(() => sair('expirou'), Math.max(0, sessao.expira - Date.now()));
}
agendarFim();

export async function entrar(usuario, senha) {
  const r = await fetch(import.meta.env.VITE_API_URL + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, senha }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.erro || `Erro ${r.status}`);
  Object.assign(sessao, { token: json.token, usuario: json.user, expira: Date.now() + json.expiresIn * 1000 });
  try { sessionStorage.setItem(CHAVE, JSON.stringify(sessao)); } catch {}
  agendarFim();
}

// motivo: 'saiu' (botão Sair) ou 'expirou' (token vencido ou recusado pela API)
export function sair(motivo = 'saiu') {
  clearTimeout(timer);
  Object.assign(sessao, vazia(), { motivo });
  try { sessionStorage.removeItem(CHAVE); } catch {}
}
