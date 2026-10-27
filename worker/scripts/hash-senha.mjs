// Gera o valor da coluna senha_hash da aba Usuarios.
// Uso (na pasta worker): node scripts/hash-senha.mjs
import { createInterface } from 'node:readline/promises';
import { hashSenha } from '../src/index.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const senha = await rl.question('Senha do usuário (mínimo 6 caracteres): ');
rl.close();
if (senha.length < 6) {
  console.error('A senha precisa ter no mínimo 6 caracteres.');
  process.exit(1);
}
console.log('\nCole na coluna senha_hash:\n' + await hashSenha(senha));
