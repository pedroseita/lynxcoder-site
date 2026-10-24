// TOTP (RFC 6238) — o mesmo algoritmo do Google/Microsoft Authenticator.
// Implementado com node:crypto para não depender de bibliotecas de terceiros
// numa peça de segurança.
'use strict';

const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret() { return base32Encode(crypto.randomBytes(20)); }

function codeAt(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1e6).padStart(6, '0');
}

const STEP = 30;
const counterNow = () => Math.floor(Date.now() / 1000 / STEP);

// Devolve o contador aceite (para impedir reutilizar o mesmo código) ou -1.
// Aceita ±1 passo de 30 s para tolerar relógios ligeiramente desacertados.
function verify(secret, code, lastUsedCounter = -1) {
  if (!/^\d{6}$/.test(code || '')) return -1;
  const now = counterNow();
  for (const c of [now - 1, now, now + 1]) {
    if (c <= lastUsedCounter) continue;
    const expected = Buffer.from(codeAt(secret, c));
    if (crypto.timingSafeEqual(expected, Buffer.from(code))) return c;
  }
  return -1;
}

function otpauthUri(secret, account, issuer = 'LynxCoder') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

module.exports = { generateSecret, verify, otpauthUri, codeAt, counterNow };
