const blessed = require('blessed');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

process.on('uncaughtException', (err) => {
  try { screen.destroy(); } catch(e) {}
  console.error('Error fatal:', err.message);
  process.exit(1);
});

const screen = blessed.screen({
  smartCSR: true,
  title: 'DIXI Panel',
  fullUnicode: true,
  forceUnicode: true
});

let currentDir = process.env.HOME || process.cwd();
let helpVisible = false;
let helpBox = null;
let runningProcs = [];
let commandHistory = [];
let historyIndex = -1;
let focusIndex = 0;
let cpuHistory = [];
let lastCpuTimes = [];

try {
  lastCpuTimes = os.cpus().map(c => c.times);
} catch(e) {
  lastCpuTimes = [];
}

function safeCpus() {
  try { return os.cpus() || []; } catch(e) { return []; }
}

function bar(percent, width) {
  width = width || 18;
  percent = Math.max(0, Math.min(100, percent || 0));
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  const color = percent > 85 ? '\x1b[31m' : percent > 60 ? '\x1b[33m' : '\x1b[32m';
  return color + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(empty) + '\x1b[0m';
}

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function formatUptime(secs) {
  secs = secs || 0;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function getCpuUsage() {
  try {
    const cpus = safeCpus();
    if (!cpus.length || !lastCpuTimes.length || cpus.length !== lastCpuTimes.length) {
      lastCpuTimes = cpus.map(c => c.times);
      return 0;
    }
    const cur = cpus.map(c => c.times);
    let idleDiff = 0, totalDiff = 0;
    for (let i = 0; i < cur.length; i++) {
      for (const t in cur[i]) totalDiff += (cur[i][t] || 0) - (lastCpuTimes[i][t] || 0);
      idleDiff += (cur[i].idle || 0) - (lastCpuTimes[i].idle || 0);
    }
    lastCpuTimes = cur;
    if (totalDiff === 0) return 0;
    return Math.max(0, Math.min(100, 100 - Math.floor((100 * idleDiff) / totalDiff)));
  } catch(e) { return 0; }
}

function getLoadAvg() {
  try {
    const avg = os.loadavg();
    if (!avg || !avg.length) return 'N/A';
    return avg.map(v => (v || 0).toFixed(2)).join('  ');
  } catch { return 'N/A'; }
}

function safeExec(cmd, timeout) {
  try {
    return execSync(cmd, { timeout: timeout || 2000, encoding: 'utf8' });
  } catch(e) { return ''; }
}

const headerBar = blessed.box({
  top: 0, left: 0, width: '100%', height: 1,
  tags: true,
  style: { fg: 'black', bg: 'cyan', bold: true }
});

const statusBar = blessed.box({
  bottom: 0, left: 0, width: '100%', height: 1,
  tags: true,
  style: { fg: 'black', bg: 'blue' }
});

const metricsBox = blessed.box({
  top: 1, left: 0, width: '34%', height: '28%',
  label: ' {cyan-fg}[ CPU & RAM ]{/} ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'cyan' } }
});

const networkBox = blessed.box({
  top: 1, left: '34%', width: '33%', height: '28%',
  label: ' {magenta-fg}[ Red & Procs ]{/} ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'magenta' } }
});

const diskBox = blessed.box({
  top: 1, left: '67%', width: '33%', height: '28%',
  label: ' {yellow-fg}[ Disco & Env ]{/} ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'yellow' } }
});

const filesBox = blessed.list({
  top: '29%', left: 0, width: '35%', height: '37%',
  label: ' {magenta-fg}[ Archivos ]{/} ',
  tags: true, border: { type: 'line' },
  style: {
    border: { fg: 'magenta' },
    selected: { bg: 'blue', fg: 'white', bold: true },
    item: { fg: 'white' }
  },
  keys: true, vi: true, interactive: true,
  scrollable: true, alwaysScroll: true,
  scrollbar: { ch: '|', style: { fg: 'cyan' } }
});

const filePreviewBox = blessed.box({
  top: '29%', left: '35%', width: '65%', height: '37%',
  label: ' {cyan-fg}[ Vista Previa ]{/} ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'cyan' } },
  scrollable: true, alwaysScroll: true, keys: true,
  scrollbar: { ch: '|', style: { fg: 'cyan' } }
});

const terminalContainer = blessed.box({
  top: '66%', left: 0, width: '100%', height: '34%',
  label: ' {green-fg}[ $ DIXI Terminal ]{/} ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'green' } }
});

const terminalLog = blessed.log({
  parent: terminalContainer,
  top: 0, left: 1, width: '100%-3', height: '100%-4',
  scrollable: true, alwaysScroll: true, tags: true,
  scrollbar: { ch: '|', track: { bg: 'black' }, style: { fg: 'green' } }
});

const commandInput = blessed.textbox({
  parent: terminalContainer,
  bottom: 0, left: 1, width: '100%-3', height: 1,
  keys: true, mouse: true, inputOnFocus: true,
  style: { fg: 'green', bg: 'black', bold: true }
});

screen.append(headerBar);
screen.append(statusBar);
screen.append(metricsBox);
screen.append(networkBox);
screen.append(diskBox);
screen.append(filesBox);
screen.append(filePreviewBox);
screen.append(terminalContainer);

function updateMetrics() {
  try {
    const cpu = getCpuUsage();
    cpuHistory.push(cpu);
    if (cpuHistory.length > 10) cpuHistory.shift();

    const totalMem = os.totalmem() || 0;
    const freeMem = os.freemem() || 0;
    const usedMem = totalMem - freeMem;
    const memPct = totalMem > 0 ? Math.floor((usedMem / totalMem) * 100) : 0;
    const uptime = os.uptime() || 0;
    const cpus = safeCpus();
    const cpuCount = cpus.length;
    const cpuModel = cpuCount > 0 ? (cpus[0].model || 'Android ARM').substring(0, 26) : 'Android ARM';
    const cpuSpeed = cpuCount > 0 && cpus[0].speed ? (cpus[0].speed / 1000).toFixed(1) : '?';
    const trendStr = cpuHistory.map(v => v > 75 ? '#' : v > 50 ? '+' : v > 25 ? '-' : '.').join('');

    const content =
      `\n {bold}{cyan-fg}CPU{/}  [${bar(cpu)}] {bold}${cpu}%{/}\n` +
      ` {grey-fg}Trend:{/} [${trendStr.padEnd(10, ' ')}]  {grey-fg}Load:{/} ${getLoadAvg()}\n` +
      ` {grey-fg}Modelo:{/} ${cpuModel}\n` +
      ` {grey-fg}Cores:{/} ${cpuCount}  {grey-fg}Vel:{/} ${cpuSpeed} GHz\n\n` +
      ` {bold}{cyan-fg}RAM{/}  [${bar(memPct)}] {bold}${memPct}%{/}\n` +
      ` {grey-fg}Usado:{/}  ${formatBytes(usedMem)}\n` +
      ` {grey-fg}Libre:{/}  ${formatBytes(freeMem)}\n` +
      ` {grey-fg}Total:{/}  ${formatBytes(totalMem)}\n\n` +
      ` {grey-fg}Uptime:{/}  {bold}${formatUptime(uptime)}{/}\n` +
      ` {grey-fg}OS:{/}      ${os.platform()} ${os.arch()}\n` +
      ` {grey-fg}Host:{/}    ${(os.hostname() || 'android').substring(0, 20)}`;

    metricsBox.setContent(content);
  } catch(e) {
    metricsBox.setContent(`\n {red-fg}Error: ${e.message}{/}`);
  }
  screen.render();
}

function getNetworkInfo() {
  try {
    const ifaces = os.networkInterfaces() || {};
    let lines = '\n';
    let count = 0;
    for (const name in ifaces) {
      if (count >= 3) break;
      const arr = ifaces[name] || [];
      const iface = arr.find(i => !i.internal && i.family === 'IPv4');
      if (iface) {
        lines += ` {bold}{magenta-fg}${name}{/}  ${iface.address}\n`;
        count++;
      }
    }
    if (count === 0) lines += ' {grey-fg}Sin interfaces{/}\n';
    return lines;
  } catch { return ' {grey-fg}N/A{/}\n'; }
}

function getTopProcesses() {
  const out = safeExec('ps -eo pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -6 | tail -5', 1500);
  if (!out.trim()) {
    const out2 = safeExec('ps 2>/dev/null | head -8 | tail -5', 1500);
    return out2.split('\n').filter(Boolean).map(l => ' {grey-fg}' + l.substring(0, 50) + '{/}').join('\n') || ' {grey-fg}No disponible{/}';
  }
  return out.split('\n').filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    const cpu = parts[1] || '0';
    const mem = parts[2] || '0';
    const name = (parts[3] || '').split('/').pop().substring(0, 14);
    const col = parseFloat(cpu) > 10 ? '{red-fg}' : parseFloat(cpu) > 3 ? '{yellow-fg}' : '{green-fg}';
    return ` ${col}${cpu.padStart(5)}%{/}  {cyan-fg}${mem.padStart(4)}%{/}  ${name}`;
  }).join('\n');
}

function updateNetwork() {
  try {
    const netInfo = getNetworkInfo();
    const procs = getTopProcesses();
    const content =
      `\n{bold}Interfaces:{/}${netInfo}\n` +
      ` {bold}Procesos {grey-fg}(CPU%  MEM%  Nombre){/}{/}\n` +
      ` {grey-fg}------------------------------{/}\n` +
      procs;
    networkBox.setContent(content);
  } catch(e) {
    networkBox.setContent(`\n {red-fg}Error: ${e.message}{/}`);
  }
  screen.render();
}

function getDiskInfo() {
  try {
    let diskLine = ' {grey-fg}No disponible{/}';
    const out = safeExec('df -h /data 2>/dev/null || df -h / 2>/dev/null | tail -1', 1500);
    if (out) {
      const parts = out.trim().split('\n').pop().split(/\s+/);
      const used = parts[2] || '?';
      const avail = parts[3] || '?';
      const pct = parseInt((parts[4] || '0').replace('%', '')) || 0;
      diskLine = ` / [${bar(pct, 12)}] {bold}${pct}%{/}\n {grey-fg}Usado:{/} ${used}  {grey-fg}Libre:{/} ${avail}`;
    }

    const termuxHome = process.env.HOME || '/data/data/com.termux/files/home';
    const envVars = ['HOME', 'USER', 'SHELL', 'TERM', 'PREFIX'];
    const envLines = envVars
      .filter(k => process.env[k])
      .map(k => ` {grey-fg}${k}:{/} ${(process.env[k] || '').substring(0, 22)}`)
      .join('\n');

    const content =
      `\n{bold}Disco:{/}\n${diskLine}\n\n` +
      ` {bold}Node:{/} {green-fg}${process.version}{/}\n` +
      ` {grey-fg}PID:{/}  ${process.pid}\n` +
      ` {grey-fg}Dir:{/}  ${currentDir.substring(0, 26)}\n\n` +
      ` {bold}Env:{/}\n${envLines}`;

    diskBox.setContent(content);
  } catch(e) {
    diskBox.setContent(`\n {red-fg}Error: ${e.message}{/}`);
  }
  screen.render();
}

function updateFiles() {
  try {
    let entries = fs.readdirSync(currentDir);
    entries.sort((a, b) => {
      try {
        const aD = fs.statSync(path.join(currentDir, a)).isDirectory();
        const bD = fs.statSync(path.join(currentDir, b)).isDirectory();
        if (aD && !bD) return -1;
        if (!aD && bD) return 1;
      } catch {}
      return a.localeCompare(b);
    });

    const items = ['.. {grey-fg}[arriba]{/}', ...entries.map(e => {
      try {
        const stat = fs.statSync(path.join(currentDir, e));
        if (stat.isDirectory()) return `{cyan-fg}[D] ${e}{/}`;
        const ext = path.extname(e).toLowerCase();
        if (['.js','.ts','.jsx','.tsx'].includes(ext)) return `{yellow-fg}[J] ${e}{/}`;
        if (['.json','.yaml','.yml'].includes(ext)) return `{blue-fg}[C] ${e}{/}`;
        if (['.sh','.bash'].includes(ext)) return `{green-fg}[S] ${e}{/}`;
        if (['.png','.jpg','.gif','.svg'].includes(ext)) return `{magenta-fg}[I] ${e}{/}`;
        if (ext === '.md') return `{white-fg}[M] ${e}{/}`;
        return `    ${e}`;
      } catch { return `    ${e}`; }
    })];

    filesBox.setItems(items);
    filesBox.setLabel(` {magenta-fg}[ ${path.basename(currentDir) || '/'} ]{/} `);
    screen.render();
  } catch (err) {
    filesBox.setItems([`{red-fg}Error: ${err.message}{/}`]);
    screen.render();
  }
}

function stripTags(str) {
  return str.replace(/\{[^}]+\}/g, '').replace(/\x1b\[[0-9;]*m/g, '').trim();
}

function showFilePreview(rawText) {
  if (!rawText) return;
  const clean = stripTags(rawText).replace(/^\[.\]\s*/, '').replace(/\[arriba\]/, '..').trim();

  if (clean === '..') {
    const parent = path.dirname(currentDir);
    if (parent !== currentDir) {
      currentDir = parent;
      updateFiles();
      filePreviewBox.setContent(` {grey-fg}-> ${currentDir}{/}`);
    }
    screen.render();
    return;
  }

  const fullPath = path.join(currentDir, clean);
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      currentDir = fullPath;
      updateFiles();
      filePreviewBox.setContent(` {cyan-fg}-> Entrando: ${currentDir}{/}`);
      screen.render();
      return;
    }

    const size = formatBytes(stat.size);
    const mtime = stat.mtime.toLocaleString();
    let content =
      `\n {bold}{cyan-fg}${clean}{/}\n` +
      ` {grey-fg}Tamano:{/} ${size}   {grey-fg}Modificado:{/} ${mtime}\n` +
      ` {grey-fg}--------------------------------------------{/}\n\n`;

    if (stat.size < 60000) {
      try {
        const data = fs.readFileSync(fullPath, 'utf8');
        const lines = data.split('\n').slice(0, 80);
        content += lines.map((l, i) =>
          ` {grey-fg}${String(i+1).padStart(3)}{/}  ${l.replace(/\{/g,'(').replace(/\}/g,')').substring(0, 78)}`
        ).join('\n');
        if (data.split('\n').length > 80) content += '\n {grey-fg}... (truncado){/}';
      } catch { content += ' {grey-fg}(Archivo binario o no legible){/}'; }
    } else {
      content += ` {grey-fg}Archivo grande (${size}).{/}\n {grey-fg}Usa: cat ${clean}{/}`;
    }

    filePreviewBox.setContent(content);
    screen.render();
  } catch (err) {
    filePreviewBox.setContent(` {red-fg}Error: ${err.message}{/}`);
    screen.render();
  }
}

function updateHeader() {
  try {
    const time = new Date().toLocaleTimeString();
    const cpu = cpuHistory[cpuHistory.length - 1] || 0;
    const memPct = os.totalmem() > 0 ? Math.floor(((os.totalmem() - os.freemem()) / os.totalmem()) * 100) : 0;
    const dir = currentDir.replace(process.env.HOME || '', '~').substring(0, 35);
    headerBar.setContent(
      ` {bold}DIXI Panel{/}  |  ${time}  |  CPU:${cpu}%  RAM:${memPct}%  |  ${dir}  |  {bold}[exit]{/}=Salir  {bold}[help]{/}=Ayuda  {bold}[F1]{/}=Ayuda`
    );
    screen.render();
  } catch(e) {}
}

function updateStatus(msg) {
  try {
    statusBar.setContent(' ' + (msg || 'Tab:CambiarPanel  Ctrl+L:Refrescar  exit:Salir  help:Ayuda'));
    screen.render();
  } catch(e) {}
}

function showHelp() {
  if (helpVisible && helpBox) {
    try { helpBox.destroy(); } catch(e) {}
    helpVisible = false;
    screen.render();
    commandInput.focus();
    return;
  }

  const cpus = safeCpus();
  const cpuInfo = cpus.length > 0
    ? `${cpus.length} x ${(cpus[0].model || 'ARM').substring(0, 28)}`
    : `${cpus.length} cores (Android)`;

  helpBox = blessed.box({
    top: 'center', left: 'center', width: '72%', height: '82%',
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'yellow' }, bg: 'black' },
    label: ' {yellow-fg}[ DIXI Panel - Ayuda ]{/} ',
    scrollable: true, alwaysScroll: true, keys: true,
    scrollbar: { ch: '|', style: { fg: 'yellow' } },
    content:
      `\n {bold}{yellow-fg}==== COMANDOS DEL PANEL ===={/}\n\n` +
      ` {bold}{cyan-fg}exit{/}        {grey-fg}Cerrar DIXI Panel{/}\n` +
      ` {bold}{cyan-fg}quit{/}        {grey-fg}Igual que exit{/}\n` +
      ` {bold}{cyan-fg}cls / clear{/} {grey-fg}Limpiar terminal{/}\n` +
      ` {bold}{cyan-fg}help{/}        {grey-fg}Mostrar/ocultar esta ayuda{/}\n` +
      ` {bold}{cyan-fg}cd [dir]{/}    {grey-fg}Cambiar directorio{/}\n` +
      ` {bold}{cyan-fg}pwd{/}         {grey-fg}Directorio actual{/}\n` +
      ` {bold}{cyan-fg}ls{/}          {grey-fg}Listar archivos{/}\n` +
      ` {bold}{cyan-fg}sysinfo{/}     {grey-fg}Info completa del sistema{/}\n` +
      ` {bold}{cyan-fg}ports{/}       {grey-fg}Puertos en uso{/}\n` +
      ` {bold}{cyan-fg}top5{/}        {grey-fg}Top procesos por CPU{/}\n` +
      ` {bold}{cyan-fg}mem{/}         {grey-fg}Detalle de memoria{/}\n` +
      ` {bold}{cyan-fg}net{/}         {grey-fg}Info de red detallada{/}\n` +
      ` {bold}{cyan-fg}env{/}         {grey-fg}Variables de entorno{/}\n` +
      ` {bold}{cyan-fg}bat{/}         {grey-fg}Bateria del dispositivo (Termux){/}\n` +
      ` {bold}{cyan-fg}storage{/}     {grey-fg}Uso de almacenamiento{/}\n\n` +
      ` {bold}{yellow-fg}==== ATAJOS DE TECLADO ===={/}\n\n` +
      ` {bold}F1{/}          {grey-fg}Abrir/cerrar ayuda{/}\n` +
      ` {bold}Tab{/}         {grey-fg}Cambiar foco entre paneles{/}\n` +
      ` {bold}Ctrl+L{/}      {grey-fg}Refrescar todos los paneles{/}\n` +
      ` {bold}Arriba/Abajo{/} {grey-fg}Navegar archivos / historial cmds{/}\n` +
      ` {bold}Enter{/}       {grey-fg}Seleccionar archivo/carpeta{/}\n` +
      ` {bold}Esc{/}         {grey-fg}Cerrar esta ayuda{/}\n\n` +
      ` {bold}{yellow-fg}==== NAVEGADOR DE ARCHIVOS ===={/}\n\n` +
      ` {grey-fg}[D] = Directorio   [J] = JavaScript\n` +
      ` [C] = Config/JSON  [S] = Script Shell\n` +
      ` [I] = Imagen       [M] = Markdown{/}\n\n` +
      ` {bold}{yellow-fg}==== INFO DEL SISTEMA ===={/}\n\n` +
      ` {grey-fg}Node.js:{/}   ${process.version}\n` +
      ` {grey-fg}PID:{/}       ${process.pid}\n` +
      ` {grey-fg}Platform:{/}  ${os.platform()} ${os.arch()}\n` +
      ` {grey-fg}Hostname:{/}  ${os.hostname() || 'android'}\n` +
      ` {grey-fg}CPUs:{/}      ${cpuInfo}\n` +
      ` {grey-fg}RAM Total:{/} ${formatBytes(os.totalmem())}\n` +
      ` {grey-fg}Termux Prefix:{/} ${process.env.PREFIX || 'N/A'}\n\n` +
      ` {grey-fg}Presiona Esc o F1 para cerrar{/}\n`
  });

  screen.append(helpBox);
  helpVisible = true;
  helpBox.key(['escape', 'f1', 'q'], () => {
    try { helpBox.destroy(); } catch(e) {}
    helpVisible = false;
    screen.render();
    commandInput.focus();
  });
  helpBox.focus();
  screen.render();
}

function runBuiltinCommand(value) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const parts = trimmed.split(/\s+/);

  if (lower === 'exit' || lower === 'quit') {
    terminalLog.add('{yellow-fg}Cerrando DIXI Panel...{/}');
    screen.render();
    setTimeout(() => {
      try { screen.destroy(); } catch(e) {}
      process.exit(0);
    }, 400);
    return true;
  }

  if (lower === 'cls' || lower === 'clear') {
    terminalLog.setContent('');
    screen.render();
    return true;
  }

  if (lower === 'help') {
    showHelp();
    return true;
  }

  if (lower === 'pwd') {
    terminalLog.add(`{cyan-fg}${currentDir}{/}`);
    return true;
  }

  if (parts[0].toLowerCase() === 'cd') {
    const target = parts[1] || (process.env.HOME || '/');
    try {
      const newDir = path.resolve(currentDir, target);
      fs.accessSync(newDir);
      currentDir = newDir;
      updateFiles();
      terminalLog.add(`{green-fg}-> ${currentDir}{/}`);
      updateStatus(`Dir: ${currentDir}`);
      getDiskInfo();
    } catch (e) {
      terminalLog.add(`{red-fg}cd: ${e.message}{/}`);
    }
    return true;
  }

  if (lower === 'sysinfo') {
    const cpus = safeCpus();
    const lines = [
      `{bold}{cyan-fg}==== Info del Sistema ===={/}`,
      ` {grey-fg}OS:{/}       ${os.type()} ${os.release()} ${os.arch()}`,
      ` {grey-fg}Hostname:{/} ${os.hostname() || 'android'}`,
      ` {grey-fg}CPUs:{/}     ${cpus.length} cores ${cpus.length > 0 ? '@ ' + cpus[0].model.substring(0,30) : ''}`,
      ` {grey-fg}RAM:{/}      ${formatBytes(os.totalmem())} total / ${formatBytes(os.freemem())} libre`,
      ` {grey-fg}Uptime:{/}   ${formatUptime(os.uptime())}`,
      ` {grey-fg}Load:{/}     ${getLoadAvg()}`,
      ` {grey-fg}Node.js:{/}  ${process.version}`,
      ` {grey-fg}PID:{/}      ${process.pid}`,
      ` {grey-fg}Prefix:{/}   ${process.env.PREFIX || 'N/A'}`,
    ];
    lines.forEach(l => terminalLog.add(l));
    return true;
  }

  if (lower === 'mem') {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const pct = Math.floor((used / total) * 100);
    terminalLog.add(`{bold}{cyan-fg}==== Memoria ===={/}`);
    terminalLog.add(` {grey-fg}Total:{/}  ${formatBytes(total)}`);
    terminalLog.add(` {grey-fg}Usado:{/}  ${formatBytes(used)}  (${pct}%)`);
    terminalLog.add(` {grey-fg}Libre:{/}  ${formatBytes(free)}`);
    terminalLog.add(` [${bar(pct, 30)}]`);
    return true;
  }

  if (lower === 'net') {
    const ifaces = os.networkInterfaces() || {};
    terminalLog.add(`{bold}{cyan-fg}==== Interfaces de Red ===={/}`);
    for (const name in ifaces) {
      (ifaces[name] || []).forEach(i => {
        terminalLog.add(` {bold}${name}{/}  ${i.family}  ${i.address}  ${i.internal ? '{grey-fg}(interno){/}' : '{green-fg}(externo){/}'}`);
      });
    }
    return true;
  }

  if (lower === 'ports') {
    terminalLog.add(`{bold}{cyan-fg}==== Puertos en escucha ===={/}`);
    const out = safeExec('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', 2000);
    if (out.trim()) {
      out.split('\n').filter(Boolean).slice(0, 15).forEach(l => terminalLog.add(' ' + l.substring(0, 88)));
    } else {
      terminalLog.add(` {grey-fg}No disponible en este entorno{/}`);
    }
    return true;
  }

  if (lower === 'top5') {
    terminalLog.add(`{bold}{cyan-fg}==== Top Procesos por CPU ===={/}`);
    const out = safeExec('ps -eo pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -8 || ps aux 2>/dev/null | head -8', 2000);
    if (out.trim()) {
      out.split('\n').filter(Boolean).forEach(l => terminalLog.add(' ' + l.substring(0, 88)));
    } else {
      terminalLog.add(` {grey-fg}No disponible{/}`);
    }
    return true;
  }

  if (lower === 'env') {
    terminalLog.add(`{bold}{cyan-fg}==== Variables de Entorno ===={/}`);
    Object.entries(process.env).slice(0, 25).forEach(([k, v]) => {
      terminalLog.add(` {grey-fg}${k}={/}${String(v).substring(0, 58)}`);
    });
    return true;
  }

  if (lower === 'bat' || lower === 'battery') {
    terminalLog.add(`{bold}{cyan-fg}==== Bateria ===={/}`);
    const out = safeExec('termux-battery-status 2>/dev/null', 2000);
    if (out.trim()) {
      out.split('\n').filter(Boolean).forEach(l => terminalLog.add(' ' + l));
    } else {
      const out2 = safeExec('cat /sys/class/power_supply/battery/capacity 2>/dev/null', 1000);
      const stat2 = safeExec('cat /sys/class/power_supply/battery/status 2>/dev/null', 1000);
      if (out2.trim()) {
        terminalLog.add(` {green-fg}Nivel:{/} ${out2.trim()}%  {grey-fg}Estado:{/} ${stat2.trim() || 'N/A'}`);
      } else {
        terminalLog.add(` {grey-fg}No disponible. Instala termux-api.{/}`);
      }
    }
    return true;
  }

  if (lower === 'storage') {
    terminalLog.add(`{bold}{cyan-fg}==== Almacenamiento ===={/}`);
    const out = safeExec('df -h 2>/dev/null | head -12', 2000);
    if (out.trim()) {
      out.split('\n').filter(Boolean).forEach(l => terminalLog.add(' ' + l.substring(0, 88)));
    } else {
      terminalLog.add(` {grey-fg}No disponible{/}`);
    }
    return true;
  }

  return false;
}

commandInput.on('submit', (value) => {
  commandInput.clearValue();
  commandInput.focus();
  if (!value.trim()) return;

  commandHistory.unshift(value);
  if (commandHistory.length > 100) commandHistory.pop();
  historyIndex = -1;

  terminalLog.add(`{yellow-fg}$ ${value}{/}`);
  if (runBuiltinCommand(value)) return;

  const args = value.trim().split(/\s+/);
  const cmd = args.shift();

  let proc;
  try {
    proc = spawn(cmd, args, { shell: true, cwd: currentDir, env: process.env });
  } catch (e) {
    terminalLog.add(`{red-fg}Error: ${e.message}{/}`);
    return;
  }

  runningProcs.push(proc);

  proc.stdout.on('data', (data) => {
    data.toString().split('\n').filter(l => l.trim()).forEach(line =>
      terminalLog.add(line.replace(/\{/g,'(').replace(/\}/g,')').substring(0, 200))
    );
  });

  proc.stderr.on('data', (data) => {
    data.toString().split('\n').filter(l => l.trim()).forEach(line =>
      terminalLog.add(`{red-fg}${line.substring(0, 200)}{/}`)
    );
  });

  proc.on('close', (code) => {
    runningProcs = runningProcs.filter(p => p !== proc);
    terminalLog.add(`{${code === 0 ? 'green' : 'red'}-fg}[codigo: ${code}]{/}`);
    updateFiles();
    commandInput.focus();
    screen.render();
  });

  proc.on('error', (err) => {
    terminalLog.add(`{red-fg}Error: ${err.message}{/}`);
    runningProcs = runningProcs.filter(p => p !== proc);
    commandInput.focus();
  });
});

commandInput.key(['up'], () => {
  if (!commandHistory.length) return;
  historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
  commandInput.setValue(commandHistory[historyIndex]);
  screen.render();
});

commandInput.key(['down'], () => {
  historyIndex = Math.max(historyIndex - 1, -1);
  commandInput.setValue(historyIndex >= 0 ? commandHistory[historyIndex] : '');
  screen.render();
});

filesBox.on('select', (item) => {
  if (!item) return;
  showFilePreview(item.getText());
  commandInput.focus();
});

screen.key(['f1'], () => showHelp());

screen.key(['C-l'], () => {
  updateMetrics();
  updateNetwork();
  updateFiles();
  getDiskInfo();
  updateHeader();
  terminalLog.add('{grey-fg}[Actualizado]{/}');
  screen.render();
});

screen.key(['C-c'], () => {
  terminalLog.add('{grey-fg}[Ctrl+C desactivado — escribe "exit" para salir]{/}');
  commandInput.focus();
  screen.render();
});

const focusables = [commandInput, filesBox, filePreviewBox];
const focusNames  = ['Terminal', 'Explorador', 'Vista Previa'];
screen.key(['tab'], () => {
  focusIndex = (focusIndex + 1) % focusables.length;
  focusables[focusIndex].focus();
  updateStatus(`Panel activo: ${focusNames[focusIndex]}`);
  screen.render();
});

updateMetrics();
updateNetwork();
updateFiles();
getDiskInfo();
updateHeader();
updateStatus();

terminalLog.add('{bold}{green-fg}DIXI Panel iniciado correctamente{/}');
terminalLog.add('{grey-fg}Comandos: exit quit cls help cd pwd sysinfo ports top5 mem net env bat storage{/}');
terminalLog.add('{grey-fg}F1 = Ayuda completa  |  Tab = Cambiar panel  |  Ctrl+L = Refrescar{/}');

setInterval(() => { try { updateMetrics(); updateHeader(); } catch(e) {} }, 2000);
setInterval(() => { try { updateNetwork(); getDiskInfo(); } catch(e) {} }, 6000);

commandInput.focus();
screen.render();
