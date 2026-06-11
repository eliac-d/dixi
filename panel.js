const blessed = require('blessed');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const screen = blessed.screen({
  smartCSR: true,
  title: '>_ DIXI PANEL TERMINAL',
  fullUnicode: true,
  forceUnicode: true
});

let currentDir = process.cwd();
let helpVisible = false;
let helpBox = null;
let selectedFileIndex = 0;
let runningProcs = [];

const COLORS = {
  border: 'cyan',
  titleFg: 'white',
  accent: 'yellow',
  success: 'green',
  error: 'red',
  info: 'blue',
  warning: 'yellow',
  dim: 'grey'
};

const headerBar = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 1,
  style: { fg: 'black', bg: 'cyan', bold: true }
});

const statusBar = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  style: { fg: 'black', bg: 'blue', bold: false }
});

const metricsBox = blessed.box({
  top: 1,
  left: 0,
  width: '34%',
  height: '28%',
  label: ' {cyan-fg}⚙{/} Sistema ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } }
});

const networkBox = blessed.box({
  top: 1,
  left: '34%',
  width: '33%',
  height: '28%',
  label: ' {magenta-fg}⇅{/} Red & Procesos ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'magenta' } }
});

const diskBox = blessed.box({
  top: 1,
  left: '67%',
  width: '33%',
  height: '28%',
  label: ' {yellow-fg}💾{/} Disco & Entorno ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'yellow' } }
});

const filesBox = blessed.list({
  top: '29%',
  left: 0,
  width: '35%',
  height: '37%',
  label: ' {magenta-fg}📁{/} Explorador ',
  tags: true,
  border: { type: 'line' },
  style: {
    border: { fg: 'magenta' },
    selected: { bg: 'blue', fg: 'white', bold: true },
    item: { fg: 'white' }
  },
  keys: true,
  vi: true,
  interactive: true,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: { ch: '▐', style: { fg: 'cyan' } }
});

const filePreviewBox = blessed.box({
  top: '29%',
  left: '35%',
  width: '65%',
  height: '37%',
  label: ' {cyan-fg}🔍{/} Vista Previa / Info ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'cyan' } },
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  scrollbar: { ch: '▐', style: { fg: 'cyan' } }
});

const terminalContainer = blessed.box({
  top: '66%',
  left: 0,
  width: '100%',
  height: '34%',
  label: ' {green-fg}$_{/} Terminal ',
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'green' } }
});

const terminalLog = blessed.log({
  parent: terminalContainer,
  top: 0,
  left: 1,
  width: '100%-3',
  height: '100%-4',
  scrollable: true,
  alwaysScroll: true,
  tags: true,
  scrollbar: { ch: '▐', track: { bg: 'black' }, style: { fg: 'green' } }
});

const commandInput = blessed.textbox({
  parent: terminalContainer,
  bottom: 0,
  left: 1,
  width: '100%-3',
  height: 1,
  keys: true,
  mouse: true,
  inputOnFocus: true,
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

let lastCpuTimes = os.cpus().map(c => c.times);
let cpuHistory = [];
let netStats = { rx: 0, tx: 0 };
let commandHistory = [];
let historyIndex = -1;

function bar(percent, width) {
  width = width || 18;
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  const color = percent > 85 ? '\x1b[31m' : percent > 60 ? '\x1b[33m' : '\x1b[32m';
  return color + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(empty) + '\x1b[0m';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function formatUptime(secs) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function getCpuUsage() {
  const cur = os.cpus().map(c => c.times);
  let idleDiff = 0, totalDiff = 0;
  for (let i = 0; i < cur.length; i++) {
    for (const t in cur[i]) totalDiff += cur[i][t] - lastCpuTimes[i][t];
    idleDiff += cur[i].idle - lastCpuTimes[i].idle;
  }
  lastCpuTimes = cur;
  if (totalDiff === 0) return 0;
  return Math.max(0, Math.min(100, 100 - Math.floor((100 * idleDiff) / totalDiff)));
}

function getLoadAvg() {
  try {
    const avg = os.loadavg();
    return avg.map(v => v.toFixed(2)).join('  ');
  } catch { return 'N/A'; }
}

function updateMetrics() {
  const cpu = getCpuUsage();
  cpuHistory.push(cpu);
  if (cpuHistory.length > 10) cpuHistory.shift();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = Math.floor((usedMem / totalMem) * 100);
  const uptime = os.uptime();
  const cpuModel = os.cpus()[0].model.substring(0, 28);
  const cpuCount = os.cpus().length;

  const trendStr = cpuHistory.map(v => v > 75 ? '▇' : v > 50 ? '▅' : v > 25 ? '▃' : '▁').join('');

  const content =
    `\n {bold}{cyan-fg}CPU{/}  [${bar(cpu)}] {bold}${cpu}%{/}\n` +
    ` {grey-fg}Trend:{/} ${trendStr}  {grey-fg}Load:{/} ${getLoadAvg()}\n` +
    ` {grey-fg}Modelo:{/} ${cpuModel}\n` +
    ` {grey-fg}Núcleos:{/} ${cpuCount} cores @ ${(os.cpus()[0].speed / 1000).toFixed(1)} GHz\n\n` +
    ` {bold}{cyan-fg}RAM{/}  [${bar(memPct)}] {bold}${memPct}%{/}\n` +
    ` {grey-fg}Usado:{/}  ${formatBytes(usedMem)}  {grey-fg}Libre:{/} ${formatBytes(freeMem)}\n` +
    ` {grey-fg}Total:{/}  ${formatBytes(totalMem)}\n\n` +
    ` {grey-fg}Uptime:{/} {bold}${formatUptime(uptime)}{/}\n` +
    ` {grey-fg}Plataforma:{/} ${os.platform()} ${os.arch()}\n` +
    ` {grey-fg}Hostname:{/} ${os.hostname()}`;

  metricsBox.setContent(content);
  screen.render();
}

function getNetworkInfo() {
  try {
    const ifaces = os.networkInterfaces();
    let lines = '\n';
    let count = 0;
    for (const name in ifaces) {
      if (count >= 3) break;
      const iface = ifaces[name].find(i => !i.internal && i.family === 'IPv4');
      if (iface) {
        lines += ` {bold}{magenta-fg}${name}{/}  ${iface.address}\n`;
        count++;
      }
    }
    if (count === 0) lines += ' {grey-fg}Sin interfaces activas{/}\n';
    return lines;
  } catch { return ' {grey-fg}N/A{/}\n'; }
}

function getTopProcesses() {
  try {
    const out = execSync("ps aux --sort=-%cpu | head -6 | tail -5", { timeout: 1000 }).toString();
    return out.split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      const cpu = parts[2] || '0';
      const mem = parts[3] || '0';
      const name = (parts[10] || '').split('/').pop().substring(0, 16);
      const cpuColor = parseFloat(cpu) > 10 ? '{red-fg}' : parseFloat(cpu) > 3 ? '{yellow-fg}' : '{green-fg}';
      return ` ${cpuColor}${cpu.padStart(5)}%{/}  {cyan-fg}${mem.padStart(4)}%{/}  ${name}`;
    }).join('\n');
  } catch { return ' {grey-fg}No disponible{/}'; }
}

function updateNetwork() {
  const netInfo = getNetworkInfo();
  const procs = getTopProcesses();
  const content =
    `\n{bold}Interfaces:{/}${netInfo}\n` +
    ` {bold}Top Procesos {grey-fg}(CPU%  MEM%  Nombre){/}{/}\n` +
    ` {grey-fg}────────────────────────────────{/}\n` +
    procs;
  networkBox.setContent(content);
  screen.render();
}

function getDiskInfo() {
  let diskLine = ' {grey-fg}No disponible{/}';
  try {
    const out = execSync("df -h / 2>/dev/null | tail -1", { timeout: 1000 }).toString().trim();
    const parts = out.split(/\s+/);
    const used = parts[2] || '?';
    const avail = parts[3] || '?';
    const pct = parseInt(parts[4]) || 0;
    diskLine = ` {bold}/{/}  [${bar(pct, 12)}] {bold}${pct}%{/}\n {grey-fg}Usado:{/} ${used}  {grey-fg}Libre:{/} ${avail}`;
  } catch {}

  const envVars = ['NODE_ENV', 'HOME', 'USER', 'SHELL', 'TERM'];
  const envLines = envVars
    .filter(k => process.env[k])
    .map(k => ` {grey-fg}${k}:{/} ${(process.env[k] || '').substring(0, 20)}`)
    .join('\n');

  const content =
    `\n{bold}Disco:{/}\n${diskLine}\n\n` +
    ` {bold}Node:{/} {green-fg}${process.version}{/}  {grey-fg}PID:{/} ${process.pid}\n` +
    ` {grey-fg}Dir:{/} ${currentDir.substring(0, 28)}\n\n` +
    ` {bold}Entorno:{/}\n${envLines}`;

  diskBox.setContent(content);
  screen.render();
}

function updateFiles() {
  try {
    let entries = fs.readdirSync(currentDir);
    entries.sort((a, b) => {
      try {
        const aIsDir = fs.statSync(path.join(currentDir, a)).isDirectory();
        const bIsDir = fs.statSync(path.join(currentDir, b)).isDirectory();
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
      } catch {}
      return a.localeCompare(b);
    });

    const items = ['.. {grey-fg}[↑ subir]{/}', ...entries.map(e => {
      try {
        const stat = fs.statSync(path.join(currentDir, e));
        if (stat.isDirectory()) return `{cyan-fg}📁 ${e}/{/}`;
        const ext = path.extname(e).toLowerCase();
        const jsExts = ['.js', '.ts', '.jsx', '.tsx'];
        const imgExts = ['.png', '.jpg', '.gif', '.svg', '.webp'];
        if (jsExts.includes(ext)) return `{yellow-fg}⚡ ${e}{/}`;
        if (imgExts.includes(ext)) return `{magenta-fg}🖼 ${e}{/}`;
        if (ext === '.json') return `{blue-fg}{ ${e}{/}`;
        if (ext === '.md') return `{green-fg}📝 ${e}{/}`;
        return e;
      } catch { return e; }
    })];

    filesBox.setItems(items);
    filesBox.setLabel(` {magenta-fg}📁{/} ${path.basename(currentDir) || '/'} `);
    screen.render();
  } catch (err) {
    filesBox.setItems([`{red-fg}Error: ${err.message}{/}`]);
  }
}

function showFilePreview(filename) {
  if (!filename) return;
  filename = filename.replace(/\x1b\[[0-9;]*m/g, '').replace(/[📁⚡🖼{📝]/g, '').replace(/{[^}]*}/g, '').replace(/\//g, '').trim();

  if (filename === '..') {
    currentDir = path.dirname(currentDir);
    updateFiles();
    filePreviewBox.setContent(` {grey-fg}Navegando a: ${currentDir}{/}`);
    screen.render();
    return;
  }

  const fullPath = path.join(currentDir, filename);
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      currentDir = fullPath;
      updateFiles();
      filePreviewBox.setContent(` {cyan-fg}📁 Entrando a: ${currentDir}{/}`);
      screen.render();
      return;
    }

    const size = formatBytes(stat.size);
    const mtime = stat.mtime.toLocaleString();
    let content = `\n {bold}{cyan-fg}${filename}{/}\n {grey-fg}Tamaño:{/} ${size}   {grey-fg}Modificado:{/} ${mtime}\n {grey-fg}────────────────────────────────────{/}\n\n`;

    if (stat.size < 50000) {
      try {
        const data = fs.readFileSync(fullPath, 'utf8');
        const lines = data.split('\n').slice(0, 60);
        content += lines.map((l, i) => ` {grey-fg}${String(i + 1).padStart(3)}{/}  ${l.replace(/[{}]/g, c => '\\' + c).substring(0, 80)}`).join('\n');
        if (data.split('\n').length > 60) content += '\n {grey-fg}... (truncado){/}';
      } catch { content += ' {grey-fg}(Archivo binario){/}'; }
    } else {
      content += ` {grey-fg}Archivo grande (${size}). Usa 'cat ${filename}' en terminal.{/}`;
    }

    filePreviewBox.setContent(content);
    screen.render();
  } catch (err) {
    filePreviewBox.setContent(` {red-fg}Error: ${err.message}{/}`);
    screen.render();
  }
}

function updateHeader() {
  const time = new Date().toLocaleTimeString();
  const date = new Date().toLocaleDateString();
  const cpuLast = cpuHistory[cpuHistory.length - 1] || 0;
  headerBar.setContent(` >_ DIXI PANEL │  ${date} ${time}  │  CPU: ${cpuLast}%  │  Dir: ${currentDir.substring(0, 40)}  │  F1:Ayuda  exit:Salir  cls:Limpiar`);
  screen.render();
}

function updateStatus(msg) {
  statusBar.setContent(` ${msg || '  ↑↓:Navegar Archivos   Enter:Seleccionar   Tab:Cambiar Panel   Ctrl+L:Refrescar'}`);
  screen.render();
}

function showHelp() {
  if (helpVisible) {
    helpBox.destroy();
    helpVisible = false;
    screen.render();
    commandInput.focus();
    return;
  }

  helpBox = blessed.box({
    top: 'center',
    left: 'center',
    width: '70%',
    height: '80%',
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'yellow' }, bg: 'black' },
    label: ' {yellow-fg}⚡ AYUDA - PANEL {/} ',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    scrollbar: { ch: '▐', style: { fg: 'yellow' } },
    content:
      `\n {bold}{yellow-fg}════ COMANDOS DEL PANEL ════{/}\n\n` +
      ` {bold}{cyan-fg}exit{/}       {grey-fg}Cerrar el dashboard completamente{/}\n` +
      ` {bold}{cyan-fg}quit{/}       {grey-fg}Igual que exit{/}\n` +
      ` {bold}{cyan-fg}cls{/}        {grey-fg}Limpiar la consola del terminal{/}\n` +
      ` {bold}{cyan-fg}clear{/}      {grey-fg}Igual que cls{/}\n` +
      ` {bold}{cyan-fg}help{/}       {grey-fg}Mostrar/ocultar esta pantalla{/}\n` +
      ` {bold}{cyan-fg}cd [dir]{/}   {grey-fg}Cambiar directorio actual{/}\n` +
      ` {bold}{cyan-fg}ls{/}         {grey-fg}Listar archivos del directorio{/}\n` +
      ` {bold}{cyan-fg}cat [f]{/}    {grey-fg}Ver contenido de archivo{/}\n` +
      ` {bold}{cyan-fg}pwd{/}        {grey-fg}Mostrar directorio actual{/}\n` +
      ` {bold}{cyan-fg}sysinfo{/}    {grey-fg}Mostrar info detallada del sistema{/}\n` +
      ` {bold}{cyan-fg}ports{/}      {grey-fg}Ver puertos en uso{/}\n` +
      ` {bold}{cyan-fg}netstat{/}    {grey-fg}Ver conexiones de red{/}\n` +
      ` {bold}{cyan-fg}top5{/}       {grey-fg}Top 5 procesos por CPU{/}\n` +
      ` {bold}{cyan-fg}killall [n]{/} {grey-fg}Matar proceso por nombre{/}\n` +
      ` {bold}{cyan-fg}env{/}        {grey-fg}Ver variables de entorno{/}\n\n` +
      ` {bold}{yellow-fg}════ ATAJOS DE TECLADO ════{/}\n\n` +
      ` {bold}F1{/}          {grey-fg}Abrir / cerrar esta ayuda{/}\n` +
      ` {bold}Tab{/}         {grey-fg}Cambiar foco entre paneles{/}\n` +
      ` {bold}Ctrl+L{/}      {grey-fg}Refrescar todos los paneles{/}\n` +
      ` {bold}Ctrl+C{/}      {grey-fg}(deshabilitado) - usar 'exit'{/}\n` +
      ` {bold}↑ ↓{/}         {grey-fg}Navegar en el explorador de archivos{/}\n` +
      ` {bold}Enter{/}       {grey-fg}Seleccionar archivo o carpeta{/}\n` +
      ` {bold}↑ en input{/}  {grey-fg}Historial de comandos anteriores{/}\n` +
      ` {bold}Esc{/}         {grey-fg}Cerrar este panel de ayuda{/}\n\n` +
      ` {bold}{yellow-fg}════ INFORMACIÓN DEL SISTEMA ════{/}\n\n` +
      ` {grey-fg}Node.js:{/} ${process.version}\n` +
      ` {grey-fg}PID:{/} ${process.pid}\n` +
      ` {grey-fg}Platform:{/} ${os.platform()} ${os.arch()}\n` +
      ` {grey-fg}Hostname:{/} ${os.hostname()}\n` +
      ` {grey-fg}CPUs:{/} ${os.cpus().length} x ${os.cpus()[0].model.substring(0, 30)}\n` +
      ` {grey-fg}RAM Total:{/} ${formatBytes(os.totalmem())}\n\n` +
      ` {grey-fg}Presiona Esc o F1 para cerrar{/}\n`
  });

  screen.append(helpBox);
  helpVisible = true;
  helpBox.key(['escape', 'f1', 'q'], () => {
    helpBox.destroy();
    helpVisible = false;
    screen.render();
    commandInput.focus();
  });
  helpBox.focus();
  screen.render();
}

function runBuiltinCommand(value) {
  const cmd = value.trim().toLowerCase();
  const parts = value.trim().split(/\s+/);

  if (cmd === 'exit' || cmd === 'quit') {
    terminalLog.add('{yellow-fg}👋 Cerrando Dashboard Pro...{/}');
    screen.render();
    setTimeout(() => { screen.destroy(); process.exit(0); }, 300);
    return true;
  }

  if (cmd === 'cls' || cmd === 'clear') {
    terminalLog.setContent('');
    screen.render();
    return true;
  }

  if (cmd === 'help') {
    showHelp();
    return true;
  }

  if (cmd === 'pwd') {
    terminalLog.add(`{cyan-fg}${currentDir}{/}`);
    return true;
  }

  if (parts[0] === 'cd') {
    const target = parts[1] || os.homedir();
    try {
      const newDir = path.resolve(currentDir, target);
      fs.accessSync(newDir);
      currentDir = newDir;
      process.chdir(currentDir);
      updateFiles();
      terminalLog.add(`{green-fg}→ ${currentDir}{/}`);
      updateStatus(`Directorio: ${currentDir}`);
    } catch (e) {
      terminalLog.add(`{red-fg}cd: ${e.message}{/}`);
    }
    return true;
  }

  if (cmd === 'sysinfo') {
    const info = [
      `{bold}{cyan-fg}══ Información del Sistema ══{/}`,
      ` {grey-fg}OS:{/} ${os.type()} ${os.release()} ${os.arch()}`,
      ` {grey-fg}Hostname:{/} ${os.hostname()}`,
      ` {grey-fg}CPUs:{/} ${os.cpus().length} x ${os.cpus()[0].model}`,
      ` {grey-fg}RAM:{/} ${formatBytes(os.totalmem())} total, ${formatBytes(os.freemem())} libre`,
      ` {grey-fg}Uptime:{/} ${formatUptime(os.uptime())}`,
      ` {grey-fg}Load Avg:{/} ${getLoadAvg()}`,
      ` {grey-fg}Node.js:{/} ${process.version}`,
      ` {grey-fg}PID:{/} ${process.pid}`
    ];
    info.forEach(l => terminalLog.add(l));
    return true;
  }

  if (cmd === 'ports') {
    try {
      const out = execSync("ss -tlnp 2>/dev/null | tail -n +2 || netstat -tlnp 2>/dev/null | tail -n +3", { timeout: 2000 }).toString();
      terminalLog.add('{bold}{cyan-fg}Puertos en escucha:{/}');
      out.split('\n').filter(Boolean).slice(0, 15).forEach(l => terminalLog.add(' ' + l.substring(0, 90)));
    } catch { terminalLog.add('{red-fg}No se pudo obtener info de puertos{/}'); }
    return true;
  }

  if (cmd === 'top5') {
    try {
      const out = execSync("ps aux --sort=-%cpu | head -6", { timeout: 2000 }).toString();
      terminalLog.add('{bold}{cyan-fg}Top 5 procesos por CPU:{/}');
      out.split('\n').filter(Boolean).forEach(l => terminalLog.add(' ' + l.substring(0, 90)));
    } catch { terminalLog.add('{red-fg}No disponible{/}'); }
    return true;
  }

  if (cmd === 'env') {
    terminalLog.add('{bold}{cyan-fg}Variables de entorno:{/}');
    Object.entries(process.env).slice(0, 20).forEach(([k, v]) => {
      terminalLog.add(` {grey-fg}${k}={/}${v.substring(0, 60)}`);
    });
    return true;
  }

  return false;
}

commandInput.on('submit', (value) => {
  commandInput.clearValue();
  commandInput.focus();
  if (!value.trim()) return;

  commandHistory.unshift(value);
  historyIndex = -1;

  terminalLog.add(`{yellow-fg}$ ${value}{/}`);

  if (runBuiltinCommand(value)) return;

  const args = value.trim().split(' ');
  const cmd = args.shift();

  let proc;
  try {
    proc = spawn(cmd, args, { shell: true, cwd: currentDir });
  } catch (e) {
    terminalLog.add(`{red-fg}Error al iniciar proceso: ${e.message}{/}`);
    return;
  }

  runningProcs.push(proc);

  proc.stdout.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach(line => terminalLog.add(line.substring(0, 200)));
  });

  proc.stderr.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach(line => terminalLog.add(`{red-fg}${line.substring(0, 200)}{/}`));
  });

  proc.on('close', (code) => {
    runningProcs = runningProcs.filter(p => p !== proc);
    const color = code === 0 ? 'green' : 'red';
    terminalLog.add(`{${color}-fg}[Proceso terminado: código ${code}]{/}`);
    updateFiles();
    commandInput.focus();
    screen.render();
  });

  proc.on('error', (err) => {
    terminalLog.add(`{red-fg}Error: ${err.message}{/}`);
    commandInput.focus();
  });
});

commandInput.key(['up'], () => {
  if (commandHistory.length === 0) return;
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
  const raw = item.getText();
  showFilePreview(raw);
  commandInput.focus();
});

filesBox.on('keypress', (ch, key) => {
  if (key.name === 'right' || key.name === 'l') {
    const item = filesBox.getItem(filesBox.selected);
    if (item) showFilePreview(item.getText());
  }
});

screen.key(['f1'], () => showHelp());

screen.key(['C-l'], () => {
  updateMetrics();
  updateNetwork();
  updateFiles();
  updateHeader();
  getDiskInfo();
  terminalLog.add('{grey-fg}[Paneles actualizados]{/}');
  screen.render();
});

screen.key(['tab'], () => {
  if (document.activeElement === commandInput) {
    filesBox.focus();
  } else {
    commandInput.focus();
  }
});

screen.key(['C-c'], () => {
  terminalLog.add('{grey-fg}[Ctrl+C deshabilitado. Escribe "exit" para salir.]{/}');
  commandInput.focus();
  screen.render();
});

let focusIndex = 0;
const focusables = [commandInput, filesBox, filePreviewBox];
screen.key(['tab'], () => {
  focusIndex = (focusIndex + 1) % focusables.length;
  focusables[focusIndex].focus();
  const names = ['Terminal', 'Explorador', 'Vista Previa'];
  updateStatus(`Panel activo: ${names[focusIndex]}`);
  screen.render();
});

updateMetrics();
updateNetwork();
updateFiles();
getDiskInfo();
updateHeader();
updateStatus();

terminalLog.add('{bold}{green-fg}>_ DIXI PANEL INICIADO{/}');
terminalLog.add('{grey-fg}Comandos disponibles: exit, help, cls, cd, sysinfo, ports, top5, env{/}');
terminalLog.add('{grey-fg}Presiona F1 para ver ayuda completa. Escribe "exit" para salir.{/}');
terminalLog.add('');

setInterval(() => {
  updateMetrics();
  updateHeader();
}, 2000);

setInterval(() => {
  updateNetwork();
  getDiskInfo();
}, 5000);

commandInput.focus();
screen.render();
