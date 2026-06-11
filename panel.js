const blessed = require('blessed');
const fs = require('fs');
const { spawn } = require('child_process');

const screen = blessed.screen({ smartCSR: true, title: 'Dixi Dashboard', fullUnicode: true });

const log = blessed.log({ top: 0, left: 0, width: '100%', height: '80%', border: { type: 'line' }, label: ' PROCESO DE INSTALACIÓN Y LOGS ', scrollable: true, alwaysScroll: true });
const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, border: { type: 'line' }, label: ' COMANDO ', inputOnFocus: true });

screen.append(log); screen.append(input);

function ejecutarInstalacion() {
  if (!fs.existsSync('kirito-Bot-MD')) {
    log.add('{yellow-fg}>> Iniciando despliegue de Kirito-Bot-MD...{/}');
    const proc = spawn('bash', ['-c', 'git clone https://github.com/eliac-d/kirito-Bot-MD && cd kirito-Bot-MD && npm install']);
    
    proc.stdout.on('data', (d) => log.add(d.toString()));
    proc.stderr.on('data', (d) => log.add('{red-fg}' + d.toString() + '{/}'));
    
    proc.on('close', () => {
      log.add('{green-fg}>> Instalación finalizada. Levantando bot con PM2...{/}');
      spawn('pm2', ['start', 'kirito-Bot-MD/index.js', '--name', 'kirito']);
    });
  } else {
    log.add('{green-fg}>> Kirito-Bot ya instalado. Iniciando proceso...{/}');
    spawn('pm2', ['start', 'kirito-Bot-MD/index.js', '--name', 'kirito']);
  }
}

input.on('submit', (val) => {
  if (val.trim() === 'exit') process.exit(0);
  log.add('> ' + val);
  input.clearValue();
  input.focus();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));

input.focus();
ejecutarInstalacion();
screen.render();
