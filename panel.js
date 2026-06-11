const blessed = require('blessed');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const screen = blessed.screen({
  smartCSR: true,
  title: 'Dashboard Automations'
});

const topContainer = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '40%'
});

const metricsBox = blessed.box({
  parent: topContainer,
  top: 0,
  left: 0,
  width: '50%',
  height: '100%',
  label: ' Recursos del Sistema ',
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } }
});

const filesBox = blessed.list({
  parent: topContainer,
  top: 0,
  left: '50%',
  width: '50%',
  height: '100%',
  label: ' Explorador de Archivos ',
  border: { type: 'line' },
  style: { border: { fg: 'magenta' }, selected: { bg: 'blue' } },
  keys: true,
  vi: true,
  interactive: true
});

const bottomContainer = blessed.box({
  top: '40%',
  left: 0,
  width: '100%',
  height: '60%',
  label: ' Terminal ',
  border: { type: 'line' },
  style: { border: { fg: 'green' } }
});

const terminalLog = blessed.log({
  parent: bottomContainer,
  top: 0,
  left: 0,
  width: '100%-2',
  height: '100%-3',
  scrollable: true,
  alwaysScroll: true,
  scrollbar: { ch: ' ', track: { bg: 'cyan' }, style: { inverse: true } }
});

const commandInput = blessed.textbox({
  parent: bottomContainer,
  bottom: 0,
  left: 0,
  width: '100%-2',
  height: 1,
  keys: true,
  mouse: true,
  inputOnFocus: true,
  style: { fg: 'white', bg: 'black' }
});

screen.append(topContainer);
screen.append(bottomContainer);

let lastCpuTimes = os.cpus().map(core => core.times);

function getCpuUsage() {
  const currentCpuTimes = os.cpus().map(core => core.times);
  let idleDifference = 0;
  let totalDifference = 0;
  for (let i = 0; i < currentCpuTimes.length; i++) {
    const current = currentCpuTimes[i];
    const last = lastCpuTimes[i];
    for (const type in current) {
      totalDifference += current[type] - last[type];
    }
    idleDifference += current.idle - last.idle;
  }
  lastCpuTimes = currentCpuTimes;
  if (totalDifference === 0) return 0;
  return 100 - Math.floor((100 * idleDifference) / totalDifference);
}

function updateMetrics() {
  const cpu = getCpuUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.floor((usedMem / totalMem) * 100);
  const uptime = Math.floor(os.uptime() / 60);
  
  const content = `\n CPU Uso:    [${'█'.repeat(Math.floor(cpu/5)).padEnd(20, '░')}] ${cpu}%\n\n` +
                  ` RAM Uso:    [${'█'.repeat(Math.floor(memPercent/5)).padEnd(20, '░')}] ${memPercent}%\n` +
                  ` RAM Libre:  ${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB\n` +
                  ` RAM Total:  ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB\n\n` +
                  ` Uptime:     ${uptime} minutos\n` +
                  ` Plataforma: ${os.platform()} ${os.arch()}`;
  
  metricsBox.setContent(content);
  screen.render();
}

function updateFiles() {
  try {
    const files = fs.readdirSync(process.cwd());
    filesBox.setItems(files);
    screen.render();
  } catch (err) {
    filesBox.setItems(['Error leyendo directorio']);
  }
}

commandInput.on('submit', (value) => {
  commandInput.clearValue();
  if (!value.trim()) {
    commandInput.focus();
    return;
  }
  
  terminalLog.add(`\x1b[33m$ ${value}\x1b[0m`);
  
  if (value.trim() === 'clear') {
    terminalLog.setContent('');
    commandInput.focus();
    return;
  }
  
  const args = value.trim().split(' ');
  const cmd = args.shift();
  
  const proc = spawn(cmd, args, { shell: true, cwd: process.cwd() });
  
  proc.stdout.on('data', (data) => {
    terminalLog.add(data.toString().trimEnd());
  });
  
  proc.stderr.on('data', (data) => {
    terminalLog.add(`\x1b[31m${data.toString().trimEnd()}\x1b[0m`);
  });
  
  proc.on('close', (code) => {
    terminalLog.add(`\x1b[36m[Proceso terminado con código ${code}]\x1b[0m`);
    updateFiles();
    commandInput.focus();
  });
  
  commandInput.focus();
});

screen.key(['C-c'], () => {
  return process.exit(0);
});

filesBox.on('select', (item) => {
  const selected = item.getText();
  commandInput.setValue(`cat ${selected}`);
  commandInput.focus();
});

setInterval(updateMetrics, 2000);
updateMetrics();
updateFiles();
terminalLog.add('Dashboard iniciado. Escribe un comando abajo y presiona Enter.');
terminalLog.add('Presiona Ctrl+C para salir.');
commandInput.focus();
screen.render();