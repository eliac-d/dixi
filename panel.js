const blessed = require('blessed');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const screen = blessed.screen({
  smartCSR: true,
  title: 'Dixi Automations Dashboard',
  fullUnicode: true,
  warnings: true
});

const headerBox = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  content: ' DIXI PANEL - SISTEMA DE AUTOMATIZACIÓN DE WHATSAPP ',
  align: 'center',
  valign: 'middle',
  style: { fg: 'white', bg: 'blue', bold: true }
});

const timeBox = blessed.box({
  parent: headerBox,
  top: 0,
  right: 1,
  width: 25,
  height: '100%',
  align: 'right',
  valign: 'middle',
  style: { fg: 'cyan', bg: 'blue', bold: true }
});

const metricsBox = blessed.box({
  top: 3,
  left: 0,
  width: '40%',
  height: '40%',
  label: ' [ DIAGNÓSTICO DEL SISTEMA ] ',
  border: { type: 'line' },
  style: { border: { fg: 'cyan' }, fg: 'white' },
  padding: { left: 1, right: 1 }
});

const filesBox = blessed.list({
  top: 3,
  left: '40%',
  width: '60%',
  height: '40%',
  label: ' [ EXPLORADOR DE RUTAS ] ',
  border: { type: 'line' },
  style: { border: { fg: 'magenta' }, selected: { bg: 'green', fg: 'black', bold: true } },
  keys: true,
  vi: true,
  interactive: true,
  scrollbar: { ch: '█', track: { bg: 'black' }, style: { fg: 'magenta' } }
});

const bottomContainer = blessed.box({
  top: '43%',
  left: 0,
  width: '100%',
  height: '57%',
  label: ' [ TERMINAL INTERACTIVA ] ',
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
  keys: true,
  vi: true,
  scrollbar: { ch: '█', track: { bg: 'black' }, style: { fg: 'green' } }
});

const inputLabel = blessed.box({
  parent: bottomContainer,
  bottom: 0,
  left: 0,
  width: 3,
  height: 1,
  content: '>> ',
  style: { fg: 'yellow', bold: true }
});

const commandInput = blessed.textbox({
  parent: bottomContainer,
  bottom: 0,
  left: 3,
  width: '100%-5',
  height: 1,
  keys: true,
  mouse: true,
  inputOnFocus: true,
  style: { fg: 'white', bg: 'black' }
});

screen.append(headerBox);
screen.append(metricsBox);
screen.append(filesBox);
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

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  let ipv4 = 'Desconectado';
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ipv4 = net.address;
      }
    }
  }
  return ipv4;
}

function updateMetrics() {
  const cpu = getCpuUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.floor((usedMem / totalMem) * 100);
  const uptime = Math.floor(os.uptime() / 60);
  const loadAvg = os.loadavg().map(n => n.toFixed(2)).join(', ');
  const netIP = getNetworkInfo();
  const userInfo = os.userInfo().username;

  const timeString = new Date().toLocaleTimeString('es-ES', { hour12: false });
  timeBox.setContent(`[ ${timeString} ]`);

  const cpuBar = '█'.repeat(Math.floor(cpu / 5)).padEnd(20, '░');
  const ramBar = '█'.repeat(Math.floor(memPercent / 5)).padEnd(20, '░');

  const content = 
    `{yellow-fg}■ USUARIO:{/} ${userInfo}\n` +
    `{yellow-fg}■ RED IP:{/}  ${netIP}\n` +
    `{yellow-fg}■ CARGA:{/}   ${loadAvg}\n` +
    `{yellow-fg}■ UPTIME:{/}  ${uptime} minutos\n` +
    `{gray-fg}----------------------------------{/}\n` +
    `{cyan-fg}CPU:{/} [${cpuBar}] {cyan-fg}${cpu}%{/}\n` +
    `{cyan-fg}RAM:{/} [${ramBar}] {cyan-fg}${memPercent}%{/}\n` +
    `{gray-fg}USADO:{/} ${(usedMem / 1073741824).toFixed(2)}GB / ${(totalMem / 1073741824).toFixed(2)}GB\n` +
    `{gray-fg}NÚCLEOS:{/} ${os.cpus().length} Cores ${os.arch()}`;

  metricsBox.setContent(content);
  screen.render();
}

function updateFiles() {
  try {
    const files = fs.readdirSync(process.cwd());
    const formattedFiles = files.map(file => {
      const stats = fs.statSync(file);
      const isDir = stats.isDirectory();
      return isDir ? `{blue-fg}📁 ${file}{/}` : `{white-fg}📄 ${file}{/}`;
    });
    filesBox.setItems(formattedFiles);
    screen.render();
  } catch (err) {
    filesBox.setItems(['Error leyendo directorio']);
  }
}

function exitPanel() {
  screen.destroy();
  console.log('\nSistema cerrado correctamente. Volviendo a la terminal nativa.\n');
  process.exit(0);
}

function printHelp() {
  terminalLog.add(`\n{cyan-fg}======================================================{/}`);
  terminalLog.add(`{yellow-fg}            COMANDOS AVANZADOS DEL PANEL DIXI         {/}`);
  terminalLog.add(`{cyan-fg}======================================================{/}`);
  terminalLog.add(` {green-fg}help{/}      - Muestra este menú de ayuda detallado.`);
  terminalLog.add(` {green-fg}clear{/}     - Limpia el historial de la terminal del panel.`);
  terminalLog.add(` {green-fg}exit{/}      - Cierra el panel y finaliza los procesos.`);
  terminalLog.add(` {green-fg}salir{/}     - Alias para cerrar el panel completamente.`);
  terminalLog.add(` {green-fg}wa-start{/}  - Inicia los servicios de bot de WhatsApp.`);
  terminalLog.add(` {green-fg}sysinfo{/}   - Muestra el volcado completo del sistema.`);
  terminalLog.add(`{cyan-fg}======================================================{/}\n`);
}

commandInput.on('submit', (value) => {
  commandInput.clearValue();
  const input = value.trim();
  
  if (!input) {
    commandInput.focus();
    return;
  }

  terminalLog.add(`{yellow-fg}>> ${input}{/}`);

  if (input === 'clear') {
    terminalLog.setContent('');
    commandInput.focus();
    return;
  }

  if (input === 'exit' || input === 'salir' || input === 'quit') {
    exitPanel();
    return;
  }

  if (input === 'help') {
    printHelp();
    commandInput.focus();
    screen.render();
    return;
  }

  if (input === 'sysinfo') {
    terminalLog.add(JSON.stringify(os.userInfo(), null, 2));
    commandInput.focus();
    return;
  }

  if (input === 'wa-start') {
    terminalLog.add(`{magenta-fg}[WhatsApp] Iniciando clúster de automatización...{/}`);
    commandInput.focus();
    return;
  }

  const args = input.split(' ');
  const cmd = args.shift();

  const proc = spawn(cmd, args, { shell: true, cwd: process.cwd() });

  proc.stdout.on('data', (data) => {
    terminalLog.add(data.toString().trimEnd());
  });

  proc.stderr.on('data', (data) => {
    terminalLog.add(`{red-fg}${data.toString().trimEnd()}{/}`);
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      terminalLog.add(`{gray-fg}[Proceso finalizado con código de salida ${code}]{/}`);
    }
    updateFiles();
    commandInput.focus();
  });

  proc.on('error', (err) => {
    terminalLog.add(`{red-fg}[Error al ejecutar]: ${err.message}{/}`);
    commandInput.focus();
  });

  commandInput.focus();
});

screen.key(['C-c', 'escape'], () => {
  exitPanel();
});

commandInput.key(['C-c', 'escape'], () => {
  exitPanel();
});

filesBox.on('select', (item) => {
  const selectedText = item.getText().replace(/📁 |📄 /g, '');
  const cleanName = selectedText.replace(/\{.*?\}/g, '');
  commandInput.setValue(`cat ${cleanName}`);
  commandInput.focus();
  screen.render();
});

metricsBox.setContent = function(content) {
  this.content = content;
};
metricsBox.style.tags = true;
terminalLog.style.tags = true;
filesBox.style.tags = true;

setInterval(updateMetrics, 1000);
updateMetrics();
updateFiles();

terminalLog.add('{green-fg}[SISTEMA INICIADO]{/} Panel Dixi de automatización en línea.');
terminalLog.add('Escribe {yellow-fg}help{/} para ver la lista de comandos disponibles.');
commandInput.focus();
screen.render();
