// Subdomínios reservados de lynxsites.com.br, lidos de reservados.txt (fonte
// única, também usada pelo scripts/lynxsites.sh).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LISTA = fs.readFileSync(path.join(__dirname, 'reservados.txt'), 'utf8')
  .split('\n')
  .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
  .filter(Boolean);

const RESERVADOS = new Set(LISTA);

module.exports = { RESERVADOS, LISTA: [...RESERVADOS] };
