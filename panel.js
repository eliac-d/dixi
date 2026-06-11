const blessed = require('blessed');
const { spawn } = require('child_process');
const fs = require('fs');

const screen = blessed.screen({ smartCSR: true, title: 'Dixi Dashboard' });
const log = blessed.log({ top: 0, left: 0, width: '100%', height: '80%', border: { type: 'line' }, label: ' PANEL DE CONTROL ', scrollable: true, alwaysScroll: true });
const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, border: { type: 'line' }, label: ' COMANDO ', inputOnFocus: true });

screen.append(log); screen.append(input);

log.add('{cyan-fg}>>> PANEL CARGADO. ESPERANDO INSTRUCCIONES...{/}');

input.on('submit', (val) => {
  const cmd = val.trim();
  if (cmd === 'exit') process.exit(0);
  
  if (cmd === 'instalar') {
    log.add('{yellow-fg}>> Iniciando instalación de Kirito-Bot-MD...{/}');
    const inst = spawn('bash', ['-c', 'git clone https://github.com/eliac-d/kirito-Bot-MD && cd kirito-Bot-MD && npm install']);
    inst.stdout.on('data', (d) => log.add(d.toString()));
    inst.on('close', () => log.add('{green-fg}>> Instalación finalizada.{/}'));
  } else {
    log.add('> ' + cmd);
  }
  
  input.clearValue();
  input.focus();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));

screen.render();
input.focus();
