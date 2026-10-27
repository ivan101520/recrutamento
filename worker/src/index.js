// API do sistema de vagas: usa uma planilha do Google Sheets como banco.
// Abas da planilha: "Vagas" (uma vaga por linha, cabeçalho na linha 1) e "Opcoes" (uma coluna por lista de Ajustes).
// Segredos (wrangler secret put): GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID, JWT_SECRET. Variável: ALLOWED_ORIGINS.
// Login: aba "Usuarios" (ver bloco de login abaixo); senha_hash é gerado com scripts/hash-senha.mjs.

const COLUNAS = [
  'id', 'codigo', 'cargo', 'horario', 'contrato', 'posicoes', 'sla',
  'filial', 'setor', 'estado', 'solicitante', 'recrutadora',
  'iniciada', 'status', 'situacao', 'fechada', 'admissao',
  'motivo', 'substituicao', 'novaContratacao',
  'remuneracao', 'periculosidade', 'premiacao', 'assiduidade', 'alimentacao', 'adicional',
  'observacoes', 'atualizadoEm',
];
const LISTAS = ['estados', 'filiais', 'setores', 'horarios', 'situacoes', 'motivos'];
const ABA_VAGAS = 'Vagas';
const ABA_OPCOES = 'Opcoes';

/* ---------- token do Google (conta de serviço, JWT assinado com RS256) ---------- */
let tokenCache = { valor: '', expira: 0 };

const b64url = dados => btoa(typeof dados === 'string' ? dados : String.fromCharCode(...new Uint8Array(dados)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function tokenGoogle(env) {
  if (tokenCache.expira > Date.now() + 60_000) return tokenCache.valor;
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora, exp: agora + 3600,
  }));
  // a chave pode chegar com "\n" literais se foi copiada de dentro do JSON
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----|\s/g, '');
  const chave = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${cabecalho}.${corpo}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${corpo}.${b64url(assinatura)}`,
    }),
  });
  if (!r.ok) throw new Error(`Google recusou o login: ${await r.text()}`);
  const { access_token, expires_in } = await r.json();
  tokenCache = { valor: access_token, expira: Date.now() + expires_in * 1000 };
  return access_token;
}

/* ---------- chamadas à API do Sheets ---------- */
async function sheets(env, caminho, opcoes = {}) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${await tokenGoogle(env)}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error(`Erro no Google Sheets (${r.status}): ${await r.text()}`);
  return r.json();
}

const enc = encodeURIComponent;
// RAW: o texto vai como texto (um "=" no início não vira fórmula, "0123" não perde o zero)
const gravar = (env, faixa, values) =>
  sheets(env, `/values/${enc(faixa)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values }) });

async function linhaDaVaga(env, id) {
  const { values = [] } = await sheets(env, `/values/${enc(`${ABA_VAGAS}!A:A`)}`);
  const i = values.findIndex(([v]) => String(v) === id); // ids antigos da planilha são números
  if (i < 1) throw Object.assign(new Error('Vaga não encontrada na planilha.'), { status: 404 });
  return i + 1; // linhas da planilha começam em 1
}

/* ---------- conversão vaga <-> linha ---------- */
const NUMEROS = new Set(['posicoes', 'sla', 'remuneracao', 'periculosidade', 'premiacao', 'assiduidade', 'alimentacao', 'adicional']);

const DATAS = new Set(['iniciada', 'fechada', 'admissao']);
const DIA = 864e5;
const EPOCA_SHEETS = Date.UTC(1899, 11, 30); // dia 0 das datas do Google Sheets

// data da planilha (número de série ou "dd/mm/aaaa") -> "aaaa-mm-dd", que é o que o app usa
export function lerData(x) {
  if (typeof x === 'number') return new Date(EPOCA_SHEETS + Math.round(x) * DIA).toISOString().slice(0, 10);
  const s = String(x ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    let [, d, mes, a] = m;
    if (+mes > 12) [d, mes] = [mes, d]; // digitada no formato americano (mm/dd)
    return `${a.length === 2 ? '20' + a : a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // texto que não é data (ex.: "Congelada" digitado na coluna de data) vira vazio para não quebrar os cálculos
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
// grava como número de série: a planilha mostra como data e as linhas antigas já estão assim
const gravarData = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? Math.round((Date.parse(s) - EPOCA_SHEETS) / DIA) : '';

// valor da planilha -> número: aceita "R$ 1,621.00", "R$ 1.621,00", "R$ -" e números
export function lerNumero(x) {
  if (typeof x === 'number') return x;
  let s = String(x ?? '').replace(/[^\d.,-]/g, '');
  const ultimo = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  // o último separador seguido de 1 ou 2 dígitos é o decimal; os outros são de milhar
  if (ultimo >= 0 && /^[.,]\d{1,2}$/.test(s.slice(ultimo))) s = s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1);
  else s = s.replace(/[.,]/g, '');
  return Number(s) || 0;
}

// validação na entrada: só campos conhecidos, tipos certos e tamanho limitado
function paraLinha(v) {
  if (!v || typeof v.id !== 'string' || !v.id || v.id.length > 64) throw Object.assign(new Error('Vaga sem id válido.'), { status: 400 });
  return COLUNAS.map(c =>
    NUMEROS.has(c) ? Number(v[c]) || 0 : DATAS.has(c) ? gravarData(v[c]) : String(v[c] ?? '').slice(0, 5000));
}

function paraVaga(cabecalho, linha) {
  const v = {};
  cabecalho.forEach((c, i) => {
    if (!c) return;
    const x = linha[i] ?? '';
    v[c] = NUMEROS.has(c) ? (x === '' ? '' : lerNumero(x)) : DATAS.has(c) ? lerData(x) : String(x);
  });
  return v;
}

/* ---------- login: aba "Usuarios" (id, usuario, nome, perfil, ativo, senha_hash) ---------- */
// mesmo formato de senha e de token do Gente & Gestão (PBKDF2-SHA256 e JWT HS256 de 6 horas)
const ABA_USUARIOS = 'Usuarios';
const SESSAO_SEGUNDOS = 6 * 60 * 60;
const ITERACOES = 100000;
const te = new TextEncoder();
const bytesB64 = b => btoa(String.fromCharCode(...b));
const b64Bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64urlBytes = s => b64Bytes(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
const erro = (status, msg) => Object.assign(new Error(msg), { status });

async function derivar(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey('raw', te.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' }, chave, 256));
}

export async function hashSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$sha256$${ITERACOES}$${bytesB64(sal)}$${bytesB64(await derivar(senha, sal, ITERACOES))}`;
}

async function conferirSenha(senha, guardado) {
  const p = String(guardado || '').split('$');
  if (p.length !== 5 || p[0] !== 'pbkdf2' || p[1] !== 'sha256' || !(+p[2] > 0)) return false;
  const esperado = b64Bytes(p[4]);
  const atual = await derivar(senha, b64Bytes(p[3]), +p[2]);
  let dif = atual.length ^ esperado.length; // comparação em tempo constante
  for (let i = 0; i < atual.length; i++) dif |= atual[i] ^ esperado[i];
  return dif === 0;
}

// vai dentro do token: muda quando a senha muda, e as sessões antigas caem. Não usar o hash aqui: o token é legível no navegador.
const versaoSenha = h => String(h ?? '').split('$')[3]?.slice(0, 12) ?? '';
const estaAtivo = u => ['true', 'verdadeiro', 'sim', '1', 'x'].includes(String(u.ativo).trim().toLowerCase());

// shortcut: usuários ficam 60 s em memória; desativar alguém leva até 1 minuto para valer.
let cacheUsuarios = { lista: [], ate: 0 };
async function usuarios(env, fresco = false) {
  if (!fresco && cacheUsuarios.ate > Date.now()) return cacheUsuarios.lista;
  const { values = [] } = await sheets(env, `/values/${enc(ABA_USUARIOS)}`).catch(e => {
    if (/Unable to parse range/i.test(e.message)) throw erro(500, `Crie a aba "${ABA_USUARIOS}" na planilha, com as colunas: id, usuario, nome, perfil, ativo, senha_hash.`);
    throw e;
  });
  const [cab = [], ...linhas] = values;
  const lista = linhas
    .map(l => Object.fromEntries(cab.map((c, i) => [String(c).trim(), String(l[i] ?? '').trim()])))
    .filter(u => u.id && u.usuario);
  cacheUsuarios = { lista, ate: Date.now() + 60_000 };
  return lista;
}

const chavesHmac = new Map();
function chaveHmac(segredo) {
  if (!chavesHmac.has(segredo)) {
    chavesHmac.set(segredo, crypto.subtle.importKey('raw', te.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  }
  return chavesHmac.get(segredo);
}

async function assinarToken(dados, segredo) {
  const agora = Math.floor(Date.now() / 1000);
  const conteudo = `${b64url(te.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))}.${b64url(te.encode(JSON.stringify({ ...dados, iat: agora, exp: agora + SESSAO_SEGUNDOS })))}`;
  return `${conteudo}.${b64url(await crypto.subtle.sign('HMAC', await chaveHmac(segredo), te.encode(conteudo)))}`;
}

async function lerToken(token, segredo) {
  const p = token.split('.');
  if (p.length !== 3) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await chaveHmac(segredo), b64urlBytes(p[2]), te.encode(`${p[0]}.${p[1]}`)))) return null;
    const dados = JSON.parse(new TextDecoder().decode(b64urlBytes(p[1])));
    return dados.exp > Date.now() / 1000 ? dados : null;
  } catch {
    return null;
  }
}

async function entrar(req, env) {
  if (env.LOGIN_LIMITER) {
    const { success } = await env.LOGIN_LIMITER.limit({ key: `login:${req.headers.get('CF-Connecting-IP') || '?'}` });
    if (!success) throw erro(429, 'Muitas tentativas de login. Aguarde 1 minuto e tente novamente.');
  }
  const corpo = await req.json().catch(() => ({}));
  const login = String(corpo.usuario ?? '').trim().toLowerCase().slice(0, 100);
  const senha = String(corpo.senha ?? '').slice(0, 200);
  if (!login || !senha) throw erro(400, 'Informe usuário e senha.');

  const u = (await usuarios(env, true)).find(x => x.usuario.toLowerCase() === login);
  if (!u || !estaAtivo(u) || !(await conferirSenha(senha, u.senha_hash))) throw erro(401, 'Usuário ou senha inválidos.');

  const perfil = { id: u.id, usuario: u.usuario, nome: u.nome || u.usuario, perfil: u.perfil || 'analista' };
  const token = await assinarToken({ sub: u.id, ...perfil, pv: versaoSenha(u.senha_hash) }, env.JWT_SECRET);
  return { token, expiresIn: SESSAO_SEGUNDOS, user: perfil };
}

// toda rota de dados passa por aqui: token válido, usuário ainda ativo e com a mesma senha
async function autenticar(req, env) {
  const cab = req.headers.get('Authorization') || '';
  const dados = cab.startsWith('Bearer ') ? await lerToken(cab.slice(7), env.JWT_SECRET) : null;
  if (!dados) throw erro(401, 'Não autenticado.');
  const u = (await usuarios(env)).find(x => x.id === String(dados.sub));
  if (!u || !estaAtivo(u) || versaoSenha(u.senha_hash) !== dados.pv) throw erro(401, 'Não autenticado.');
  return u;
}

/* ---------- rotas ---------- */
async function rotear(req, env) {
  const url = new URL(req.url);
  const [, recurso, id] = url.pathname.split('/');

  if (req.method === 'GET' && !recurso) return { ok: true, api: 'vagas', rotas: ['POST /login', 'GET /dados', 'POST /vagas', 'PUT /vagas/:id', 'DELETE /vagas/:id', 'PUT /opcoes'] };
  if (!env.JWT_SECRET) throw erro(500, 'Servidor não configurado (JWT_SECRET).');
  if (req.method === 'POST' && recurso === 'login') return entrar(req, env);
  await autenticar(req, env);

  if (req.method === 'GET' && recurso === 'dados') {
    const { valueRanges } = await sheets(env,
      `/values:batchGet?ranges=${enc(ABA_VAGAS)}&ranges=${enc(ABA_OPCOES)}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`);
    const [cabecalho = [], ...linhas] = valueRanges[0].values || [];
    const vagas = linhas.filter(l => l[0]).map(l => paraVaga(cabecalho, l));
    const [cabOpcoes = [], ...linhasOpcoes] = valueRanges[1].values || [];
    const opcoes = {};
    cabOpcoes.forEach((lista, i) => {
      if (LISTAS.includes(lista)) opcoes[lista] = linhasOpcoes.map(l => l[i]).filter(x => x !== undefined && x !== '').map(String);
    });
    return { vagas: vagas.reverse(), opcoes }; // mais recentes primeiro, como no app
  }

  // aceita uma vaga ou uma lista (usado para enviar as vagas antigas do navegador de uma vez)
  if (req.method === 'POST' && recurso === 'vagas') {
    const corpo = await req.json();
    const linhas = (Array.isArray(corpo) ? corpo : [corpo]).map(paraLinha);
    await gravar(env, `${ABA_VAGAS}!1:1`, [COLUNAS]); // garante o cabeçalho
    await sheets(env, `/values/${enc(ABA_VAGAS)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: linhas }) });
    return { ok: true };
  }

  if (req.method === 'PUT' && recurso === 'vagas' && id) {
    const vaga = await req.json();
    if (vaga.id !== id) throw Object.assign(new Error('Id da URL diferente do id da vaga.'), { status: 400 });
    const linha = await linhaDaVaga(env, id);
    await gravar(env, `${ABA_VAGAS}!${linha}:${linha}`, [paraLinha(vaga)]);
    return { ok: true };
  }

  if (req.method === 'DELETE' && recurso === 'vagas' && id) {
    const linha = await linhaDaVaga(env, id);
    const { sheets: abas } = await sheets(env, '?fields=sheets.properties');
    const sheetId = abas.find(a => a.properties.title === ABA_VAGAS).properties.sheetId;
    await sheets(env, ':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: linha - 1, endIndex: linha } } }] }),
    });
    return { ok: true };
  }

  // shortcut: regrava a aba Opcoes inteira; se duas pessoas editarem Ajustes ao mesmo tempo, vale a última.
  if (req.method === 'PUT' && recurso === 'opcoes') {
    const opcoes = await req.json();
    const colunas = LISTAS.map(l => (Array.isArray(opcoes[l]) ? opcoes[l] : []).map(x => String(x).slice(0, 200)));
    const altura = Math.max(0, ...colunas.map(c => c.length));
    const linhas = [LISTAS, ...Array.from({ length: altura }, (_, i) => colunas.map(c => c[i] ?? ''))];
    await sheets(env, `/values/${enc(ABA_OPCOES)}:clear`, { method: 'POST' });
    await gravar(env, `${ABA_OPCOES}!A1`, linhas);
    return { ok: true };
  }

  throw Object.assign(new Error('Rota não encontrada.'), { status: 404 });
}

export default {
  async fetch(req, env) {
    const origem = req.headers.get('Origin') || '';
    const permitidas = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    const cors = permitidas.includes(origem) ? {
      'Access-Control-Allow-Origin': origem,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origem && !cors['Access-Control-Allow-Origin']) return Response.json({ erro: 'Origem não permitida.' }, { status: 403 });

    try {
      return Response.json(await rotear(req, env), { headers: cors });
    } catch (e) {
      if (!e.status) console.error(e); // só loga erros inesperados
      return Response.json({ erro: e.message }, { status: e.status || 500, headers: cors });
    }
  },
};
