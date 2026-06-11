const blessed = require('blessed');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const screen = blessed.screen({ smartCSR: true, title: 'Dixi Panel Pro', fullUnicode: true });

const metricsBox = blessed.box({ top: 0, left: 0, width: '100%', height: 4, border: { type: 'line' }, style: { border: { fg: 'cyan' } } });
const filesBox = blessed.list({ top: 4, left: 0, width: '40%', height: '50%', label: ' Archivos ', border: { type: 'line' }, keys: true, vi: true, mouse: true, style: { border: { fg: 'magenta' }, selected: { bg: 'blue' } } });
const terminalLog = blessed.log({ top: 4, left: '40%', width: '60%', height: '50%', label: ' Logs ', border: { type: 'line' }, style: { border: { fg: 'green' } } });
const commandInput = blessed.textbox({ top: '54%', left: 0, width: '100%', height: 3, label: ' Entrada ', border: { type: 'line' }, inputOnFocus: true });

screen.append(metricsBox); screen.append(filesBox); screen.append(terminalLog); screen.append(commandInput);

let currentPath = process.cwd();

function updateMetrics() {
  const cpu = os.loadavg()[0].toFixed(2);
  const mem = ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1);
  const disk = 'N/A';
  metricsBox.setContent(` CPU Load: ${cpu} | RAM: ${mem}% | Path: ${currentPath}`);
  screen.render();
}

function loadFiles() {
  const files = fs.readdirSync(currentPath);
  filesBox.setItems(files);
  screen.render();
}

filesBox.on('select', (item) => {
  const name = item.getText();
  const fullPath = path.join(currentPath, name);
  if (fs.statSync(fullPath).isDirectory()) {
    currentPath = fullPath;
    loadFiles();
  } else {
    terminalLog.add('Archivo seleccionado: ' + name);
  }
});

screen.key(['d'], () => {
  const selected = filesBox.getItem(filesBox.selected).getText();
  const fullPath = path.join(currentPath, selected);
  fs.rmSync(fullPath, { recursive: true, force: true });
  loadFiles();
  terminalLog.add('Eliminado: ' + selected);
});

screen.key(['b'], () => {
  currentPath = path.dirname(currentPath);
  loadFiles();
});

commandInput.on('submit', (val) => {
  const args = val.split(' ');
  const cmd = spawn(args[0], args.slice(1), { shell: true, cwd: currentPath });
  cmd.stdout.on('data', (d) => terminalLog.add(d.toString()));
  cmd.stderr.on('data', (d) => terminalLog.add('Error: ' + d.toString()));
  commandInput.clearValue();
  commandInput.focus();
});

screen.key(['C-c'], () => process.exit(0));

setInterval(updateMetrics, 1000);
loadFiles();
commandInput.focus();
screen.render();
