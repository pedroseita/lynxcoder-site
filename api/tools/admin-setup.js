#!/usr/bin/env node
// Cria (ou substitui) o acesso ao painel admin.lynxcoder.com.br.
// Correr NO VPS, dentro do container:
//   docker exec -it lynxcoder-onboarding node tools/admin-setup.js
// Pede usuário e senha, mostra um QR code para o app autenticador
// (Google/Microsoft Authenticator) e só grava depois de um código válido.
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const QRCode = require('qrcode');
const { DIRS, writeJson } = require('../lib/common');
const { hashPassword } = require('../lib/password');
const totp = require('../lib/totp');

const skipVerify = process.argv.includes('--no-verify'); // só para testes automáticos

let muted = false;
const output = new Writable({
  write(chunk, enc, cb) { if (!muted) process.stdout.write(chunk, enc); cb(); },
});
const rl = readline.createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden && process.stdin.isTTY;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden && process.stdin.isTTY) process.stdout.write('\n');
  if (done) throw new Error('Entrada terminou antes do fim do setup.');
  return value.trim();
}

(async () => {
  console.log('\n=== Painel LynxCoder — configurar acesso ===\n');
  const file = path.join(DIRS.admin, 'credentials.json');
  if (await fsp.stat(file).catch(() => null)) {
    console.log('Já existe um acesso configurado. Continuar SUBSTITUI o usuário, a senha e o código 2FA.');
    const go = await ask('Continuar? (s/N) ');
    if (!/^s/i.test(go)) { console.log('Nada alterado.'); process.exit(0); }
  }

  let user = '';
  while (!/^[a-zA-Z0-9._@-]{3,60}$/.test(user)) {
    user = await ask('Usuário (3–60 letras, números, . _ - @): ');
  }

  let password = '';
  for (;;) {
    password = await ask('Senha (mínimo 12 caracteres): ', { hidden: true });
    if (password.length < 12) { console.log('  Curta demais.'); continue; }
    const again = await ask('Repita a senha: ', { hidden: true });
    if (again !== password) { console.log('  As senhas não coincidem.'); continue; }
    break;
  }

  const secret = totp.generateSecret();
  const uri = totp.otpauthUri(secret, user);
  console.log('\nNo app autenticador do celular, adicione uma conta lendo este QR code:\n');
  console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));
  console.log('Se não conseguir ler o QR, escolha "inserir chave" e use:');
  console.log(`  Conta: LynxCoder (${user})`);
  console.log(`  Chave: ${secret.replace(/(.{4})/g, '$1 ').trim()}\n`);

  if (!skipVerify) {
    for (let i = 0; ; i++) {
      const code = (await ask('Digite o código de 6 dígitos que aparece no app: ')).replace(/\D/g, '');
      if (totp.verify(secret, code) >= 0) break;
      if (i >= 4) { console.log('Código errado demasiadas vezes. Nada foi gravado.'); process.exit(1); }
      console.log('  Código não confere. Confira se o relógio do celular está certo e tente de novo.');
    }
  }

  await fsp.mkdir(DIRS.admin, { recursive: true, mode: 0o700 });
  await fsp.chmod(DIRS.admin, 0o700); // o servidor pode tê-la criado antes com 755
  await writeJson(file, {
    user,
    passwordHash: await hashPassword(password),
    totpSecret: secret,
    criadoEm: new Date().toISOString(),
  }, 0o600);
  console.log('\n✔ Acesso configurado. Entre em https://admin.lynxcoder.com.br');
  console.log('  (se o container estava a correr, não precisa de reiniciar)\n');
  process.exit(0);
})().catch((err) => { console.error('Erro:', err.message); process.exit(1); });
