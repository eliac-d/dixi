const blessed = require('blessed');
const { spawn } = require('child_process');
const fs = require('fs');

const screen = blessed.screen({ smartCSR: true, title: 'Dixi Dashboard' });
const log = blessed.log({ top: 0, left: 0, width: '100%', height: '80%', border: { type: 'line' }, label: ' ESTADO ', scrollable: true, alwaysScroll: true });
const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, border: { type: 'line' }, label: ' COMANDO ', inputOnFocus: true });

screen.append(log); screen.append(input);

function iniciarPregunta() {
  log.add('{yellow-fg}>> ¿Quieres instalar Kirito Bot MD? (S/N){/}');
  input.focus();
}

input.on('submit', (val) => {
  const resp = val.trim().toUpperCase();
  if (resp === 'S') {
    log.add('{green-fg}>> Iniciando instalación de Kirito Bot MD...{/}');
    input.clearValue();
    const inst = spawn('bash', ['-c', 'npm install -g pm2 && git clone https://github.com/eliac-d/kirito-Bot-MD && cd kirito-Bot-MD && npm install']);
    inst.stdout.on('data', (d) => log.add(d.toString()));
    inst.on('close', () => {
      log.add('{green-fg}>> Instalación completa. Iniciando con PM2...{/}');
      spawn('pm2', ['start', 'kirito-Bot-MD/index.js', '--name', 'kirito']);
    });
  } else if (resp === 'N') {
    log.add('{red-fg}>> Instalación cancelada.{/}');
    input.clearValue();
  } else if (resp === 'EXIT') {
    process.exit(0);
  } else {
    log.add('> ' + val);
    input.clearValue();
  }
  input.focus();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));

screen.render();
setTimeout(iniciarPregunta, 500);
