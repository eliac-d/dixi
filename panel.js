const blessed = require('blessed');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const screen = blessed.screen({ smartCSR: true, title: 'Dixi Dashboard', fullUnicode: true });

const metricsBox = blessed.box({ top: 0, left: 0, width: '40%', height: '40%', border: { type: 'line' }, label: ' SISTEMA ' });
const filesBox = blessed.list({ top: 0, left: '40%', width: '60%', height: '40%', border: { type: 'line' }, label: ' ARCHIVOS ', keys: true, vi: true, mouse: true, style: { selected: { bg: 'blue' } } });
const log = blessed.log({ top: '40%', left: 0, width: '100%', height: '45%', border: { type: 'line' }, label: ' LOGS ', scrollable: true, alwaysScroll: true });
const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, border: { type: 'line' }, label: ' COMANDO ', inputOnFocus: true });

screen.append(metricsBox); screen.append(filesBox); screen.append(log); screen.append(input);

let currentPath = process.cwd();

function updateMetrics() {
  const cpu = os.loadavg()[0].toFixed(2);
  const mem = ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1);
  metricsBox.setContent(` CPU: ${cpu}\n RAM: ${mem}%\n UPTIME: ${Math.floor(os.uptime()/60)}m\n PATH: ${currentPath}`);
  screen.render();
}

function loadFiles() {
  filesBox.setItems(fs.readdirSync(currentPath));
  screen.render();
}

filesBox.on('select', (item) => {
  const fullPath = path.join(currentPath, item.getText());
  if (fs.statSync(fullPath).isDirectory()) {
    currentPath = fullPath;
    loadFiles();
  }
});

screen.key(['b'], () => {
  currentPath = path.dirname(currentPath);
  loadFiles();
});

screen.key(['d'], () => {
  const selected = filesBox.getItem(filesBox.selected).getText();
  const fullPath = path.join(currentPath, selected);
  fs.rmSync(fullPath, { recursive: true, force: true });
  loadFiles();
  log.add('ELIMINADO: ' + selected);
});

function iniciarPregunta() {
  log.add('{yellow-fg}>> ¿DESEAS INSTALAR KIRITO BOT MD? (S/N){/}');
}

input.on('submit', (val) => {
  const cmd = val.trim().toUpperCase();
  input.clearValue();
  
  if (cmd === 'S') {
    log.add('{green-fg}>> INSTALANDO KIRITO...{/}');
    const inst = spawn('bash', ['-c', 'git clone https://github.com/eliac-d/kirito-Bot-MD && cd kirito-Bot-MD && npm install']);
    inst.stdout.on('data', (d) => log.add(d.toString()));
    inst.on('close', () => {
      log.add('{green-fg}>> INSTALACIÓN FINALIZADA.{/}');
      loadFiles();
    });
  } else if (cmd === 'EXIT') {
    process.exit(0);
  } else {
    log.add('> ' + val);
    const args = val.split(' ');
    const proc = spawn(args[0], args.slice(1), { shell: true, cwd: currentPath });
    proc.stdout.on('data', (d) => log.add(d.toString()));
  }
  input.focus();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));

setInterval(updateMetrics, 2000);
updateMetrics();
loadFiles();
iniciarPregunta();
input.focus();
screen.render();
