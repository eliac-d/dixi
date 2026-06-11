const blessed = require('blessed');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

process.on('uncaughtException', (err) => {
  try { screen.destroy(); } catch(e) {}
  console.error('Error:', err.message);
  process.exit(1);
});

const screen = blessed.screen({
  smartCSR: true,
  title: 'DIXI Panel',
  fullUnicode: false,
  forceUnicode: false,
  terminal: process.env.TERM || 'xterm',
  input: process.stdin,
  output: process.stdout
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

try { lastCpuTimes = os.cpus().map(c => c.times); } catch(e) { lastCpuTimes = []; }

function safeCpus() { try { return os.cpus() || []; } catch(e) { return []; } }

function bar(percent, width) {
  width = width || 18;
  percent = Math.max(0, Math.min(100, percent || 0));
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  const color = percent > 85 ? '\x1b[31m' : percent > 60 ? '\x1b[33m' : '\x1b[32m';
  return color + '#'.repeat(filled) + '\x1b[90m' + '-'.repeat(empty) + '\x1b[0m';
}

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1024*1024*1024) return (bytes/1024/1024).toFixed(1) + ' MB';
  return (bytes/1024/1024/1024).toFixed(2) + ' GB';
}

function formatUptime(secs) {
  secs = secs || 0;
  const d = Math.floor(secs/86400);
  const h = Math.floor((secs%86400)/3600);
  const m = Math.floor((secs%3600)/60);
  const s = Math.floor(secs%60);
  if (d > 0) return d+'d '+h+'h '+m+'m';
  if (h > 0) return h+'h '+m+'m '+s+'s';
  return m+'m '+s+'s';
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
      for (const t in cur[i]) totalDiff += (cur[i][t]||0) - (lastCpuTimes[i][t]||0);
      idleDiff += (cur[i].idle||0) - (lastCpuTimes[i].idle||0);
    }
    lastCpuTimes = cur;
    if (totalDiff === 0) return 0;
    return Math.max(0, Math.min(100, 100 - Math.floor((100*idleDiff)/totalDiff)));
  } catch(e) { return 0; }
}

function getLoadAvg() {
  try { return os.loadavg().map(v => (v||0).toFixed(2)).join('  '); } catch { return 'N/A'; }
}

function safeExec(cmd, timeout) {
  try { return execSync(cmd, { timeout: timeout||2000, encoding: 'utf8' }); } catch(e) { return ''; }
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
  label: ' [ CPU & RAM ] ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'cyan' }, label: { fg: 'cyan' } }
});

const networkBox = blessed.box({
  top: 1, left: '34%', width: '33%', height: '28%',
  label: ' [ Red & Procs ] ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'magenta' }, label: { fg: 'magenta' } }
});

const diskBox = blessed.box({
  top: 1, left: '67%', width: '33%', height: '28%',
  label: ' [ Disco & Env ] ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'yellow' }, label: { fg: 'yellow' } }
});

const filesBox = blessed.list({
  top: '29%', left: 0, width: '35%', height: '37%',
  label: ' [ Archivos ] ',
  tags: true, border: { type: 'line' },
  style: {
    border: { fg: 'magenta' }, label: { fg: 'magenta' },
    selected: { bg: 'blue', fg: 'white', bold: true },
    item: { fg: 'white' }
  },
  keys: true, vi: false, interactive: true,
  scrollable: true, alwaysScroll: true,
  scrollbar: { ch: '|', style: { fg: 'cyan' } }
});

const filePreviewBox = blessed.box({
  top: '29%', left: '35%', width: '65%', height: '37%',
  label: ' [ Vista Previa ] ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'cyan' }, label: { fg: 'cyan' } },
  scrollable: true, alwaysScroll: true, keys: true,
  scrollbar: { ch: '|', style: { fg: 'cyan' } }
});

const terminalContainer = blessed.box({
  top: '66%', left: 0, width: '100%', height: '34%',
  label: ' [ $ DIXI Terminal ] ',
  tags: true, border: { type: 'line' },
  style: { border: { fg: 'green' }, label: { fg: 'green' } }
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
  keys: true,
  mouse: false,
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

function updateMetrics() {
  try {
    const cpu = getCpuUsage();
    cpuHistory.push(cpu);
    if (cpuHistory.length > 10) cpuHistory.shift();
    const totalMem = os.totalmem()||0;
    const freeMem = os.freemem()||0;
    const usedMem = totalMem - freeMem;
    const memPct = totalMem > 0 ? Math.floor((usedMem/totalMem)*100) : 0;
    const uptime = os.uptime()||0;
    const cpus = safeCpus();
    const cpuCount = cpus.length;
    const cpuModel = cpuCount > 0 ? (cpus[0].model||'Android ARM').substring(0,24) : 'Android ARM';
    const cpuSpeed = cpuCount > 0 && cpus[0].speed ? (cpus[0].speed/1000).toFixed(1) : '?';
    const trendStr = cpuHistory.map(v => v>75?'#':v>50?'+':v>25?'-':'.').join('');
    metricsBox.setContent(
      '\n CPU  ['+bar(cpu)+'] '+cpu+'%\n'+
      ' Trend: ['+trendStr.padEnd(10,' ')+']  Load: '+getLoadAvg()+'\n'+
      ' Modelo: '+cpuModel+'\n'+
      ' Cores: '+cpuCount+'  Vel: '+cpuSpeed+' GHz\n\n'+
      ' RAM  ['+bar(memPct)+'] '+memPct+'%\n'+
      ' Usado:  '+formatBytes(usedMem)+'\n'+
      ' Libre:  '+formatBytes(freeMem)+'\n'+
      ' Total:  '+formatBytes(totalMem)+'\n\n'+
      ' Uptime: '+formatUptime(uptime)+'\n'+
      ' OS:     '+os.platform()+' '+os.arch()+'\n'+
      ' Host:   '+(os.hostname()||'android').substring(0,20)
    );
  } catch(e) { metricsBox.setContent('\n Error: '+e.message); }
  screen.render();
}

function getNetworkInfo() {
  try {
    const ifaces = os.networkInterfaces()||{};
    let lines = '\n';
    let count = 0;
    for (const name in ifaces) {
      if (count >= 3) break;
      const iface = (ifaces[name]||[]).find(i => !i.internal && i.family === 'IPv4');
      if (iface) { lines += ' '+name+'  '+iface.address+'\n'; count++; }
    }
    if (count === 0) lines += ' Sin interfaces activas\n';
    return lines;
  } catch { return ' N/A\n'; }
}

function getTopProcesses() {
  const out = safeExec('ps -eo pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -6 | tail -5', 1500);
  if (!out.trim()) {
    const out2 = safeExec('ps 2>/dev/null | head -7 | tail -5', 1500);
    return out2.split('\n').filter(Boolean).map(l => ' '+l.substring(0,50)).join('\n')||' No disponible';
  }
  return out.split('\n').filter(Boolean).map(line => {
    const p = line.trim().split(/\s+/);
    return ' '+(p[1]||'0').padStart(5)+'%  '+(p[2]||'0').padStart(4)+'%  '+(p[3]||'').split('/').pop().substring(0,14);
  }).join('\n');
}

function updateNetwork() {
  try {
    networkBox.setContent(
      '\nInterfaces:'+getNetworkInfo()+
      '\nProcesos (CPU%  MEM%  Nombre)\n'+
      ' ----------------------------\n'+
      getTopProcesses()
    );
  } catch(e) { networkBox.setContent('\n Error: '+e.message); }
  screen.render();
}

function getDiskInfo() {
  try {
    let diskLine = ' No disponible';
    const out = safeExec('df -h /data 2>/dev/null || df -h / 2>/dev/null', 1500);
    if (out) {
      const line = out.trim().split('\n').pop();
      const p = line.trim().split(/\s+/);
      const pct = parseInt((p[4]||'0').replace('%',''))||0;
      diskLine = ' / ['+bar(pct,12)+'] '+pct+'%\n Usado: '+(p[2]||'?')+'  Libre: '+(p[3]||'?');
    }
    const envVars = ['HOME','USER','SHELL','TERM','PREFIX'];
    const envLines = envVars.filter(k=>process.env[k])
      .map(k=>' '+k+': '+(process.env[k]||'').substring(0,22)).join('\n');
    diskBox.setContent(
      '\nDisco:\n'+diskLine+'\n\n'+
      ' Node: '+process.version+'\n'+
      ' PID:  '+process.pid+'\n'+
      ' Dir:  '+currentDir.substring(0,26)+'\n\n'+
      ' Env:\n'+envLines
    );
  } catch(e) { diskBox.setContent('\n Error: '+e.message); }
  screen.render();
}

function updateFiles() {
  try {
    let entries = fs.readdirSync(currentDir);
    entries.sort((a,b) => {
      try {
        const aD = fs.statSync(path.join(currentDir,a)).isDirectory();
        const bD = fs.statSync(path.join(currentDir,b)).isDirectory();
        if (aD && !bD) return -1;
        if (!aD && bD) return 1;
      } catch {}
      return a.localeCompare(b);
    });
    const items = ['.. [subir]', ...entries.map(e => {
      try {
        const stat = fs.statSync(path.join(currentDir,e));
        if (stat.isDirectory()) return '[D] '+e;
        const ext = path.extname(e).toLowerCase();
        if (['.js','.ts','.jsx','.tsx'].includes(ext)) return '[J] '+e;
        if (['.json','.yaml','.yml'].includes(ext)) return '[C] '+e;
        if (['.sh','.bash'].includes(ext)) return '[S] '+e;
        if (ext === '.md') return '[M] '+e;
        return '    '+e;
      } catch { return '    '+e; }
    })];
    filesBox.setItems(items);
    filesBox.setLabel(' [ '+(path.basename(currentDir)||'/')+' ] ');
    screen.render();
  } catch(err) {
    filesBox.setItems(['Error: '+err.message]);
    screen.render();
  }
}

function showFilePreview(rawText) {
  if (!rawText) return;
  const clean = rawText.replace(/\[.\]\s*/,'').replace('[subir]','..').trim();
  if (clean === '..') {
    const parent = path.dirname(currentDir);
    if (parent !== currentDir) { currentDir = parent; updateFiles(); }
    filePreviewBox.setContent(' -> '+currentDir);
    screen.render();
    return;
  }
  const fullPath = path.join(currentDir, clean);
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      currentDir = fullPath;
      updateFiles();
      filePreviewBox.setContent(' -> Entrando: '+currentDir);
      screen.render();
      return;
    }
    let content = '\n '+clean+'\n Tamano: '+formatBytes(stat.size)+'   Modificado: '+stat.mtime.toLocaleString()+'\n --------------------------------------------\n\n';
    if (stat.size < 60000) {
      try {
        const data = fs.readFileSync(fullPath,'utf8');
        const lines = data.split('\n').slice(0,80);
        content += lines.map((l,i) => ' '+(String(i+1)).padStart(3)+'  '+l.replace(/[{}]/g,'').substring(0,78)).join('\n');
        if (data.split('\n').length > 80) content += '\n ... (truncado)';
      } catch { content += ' (Binario o no legible)'; }
    } else {
      content += ' Archivo grande ('+formatBytes(stat.size)+')\n Usa: cat '+clean;
    }
    filePreviewBox.setContent(content);
    screen.render();
  } catch(err) {
    filePreviewBox.setContent(' Error: '+err.message);
    screen.render();
  }
}

function updateHeader() {
  try {
    const time = new Date().toLocaleTimeString();
    const cpu = cpuHistory[cpuHistory.length-1]||0;
    const memPct = os.totalmem()>0 ? Math.floor(((os.totalmem()-os.freemem())/os.totalmem())*100) : 0;
    const dir = currentDir.replace(process.env.HOME||'','~').substring(0,32);
    headerBar.setContent(' DIXI Panel  |  '+time+'  |  CPU:'+cpu+'%  RAM:'+memPct+'%  |  '+dir+'  |  exit=Salir  help=Ayuda');
    screen.render();
  } catch(e) {}
}

function updateStatus(msg) {
  try {
    statusBar.setContent(' '+(msg||'Tab:CambiarPanel  Ctrl+L:Refrescar  exit:Salir  help:Ayuda'));
    screen.render();
  } catch(e) {}
}

function closeHelp() {
  if (helpBox) {
    try { helpBox.destroy(); } catch(e) {}
    helpBox = null;
  }
  helpVisible = false;
  screen.render();
  commandInput.focus();
}

function showHelp() {
  if (helpVisible) { closeHelp(); return; }
  const cpus = safeCpus();
  const cpuInfo = cpus.length > 0 ? cpus.length+' x '+(cpus[0].model||'ARM').substring(0,26) : 'Android ARM';
  helpBox = blessed.box({
    top: 'center', left: 'center', width: '70%', height: '80%',
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'yellow' }, label: { fg: 'yellow' }, bg: 'black' },
    label: ' [ DIXI Panel - Ayuda ] ',
    scrollable: true, alwaysScroll: true, keys: true,
    scrollbar: { ch: '|', style: { fg: 'yellow' } },
    content:
      '\n ==== COMANDOS DEL PANEL ====\n\n'+
      ' exit / quit   -> Cerrar DIXI Panel\n'+
      ' cls / clear   -> Limpiar terminal\n'+
      ' help          -> Mostrar/ocultar ayuda\n'+
      ' cd [dir]      -> Cambiar directorio\n'+
      ' pwd           -> Directorio actual\n'+
      ' sysinfo       -> Info completa del sistema\n'+
      ' ports         -> Puertos en uso\n'+
      ' top5          -> Top procesos por CPU\n'+
      ' mem           -> Detalle de memoria\n'+
      ' net           -> Info de red detallada\n'+
      ' env           -> Variables de entorno\n'+
      ' bat           -> Bateria del dispositivo\n'+
      ' storage       -> Uso de almacenamiento\n\n'+
      ' ==== SALIR DE ESTA AYUDA ====\n\n'+
      ' Escribe: closemenu   (en el terminal)\n'+
      ' O presiona Enter aqui para cerrar\n\n'+
      ' ==== NAVEGADOR DE ARCHIVOS ====\n\n'+
      ' Flechas arriba/abajo para navegar\n'+
      ' Enter para entrar a carpeta o ver archivo\n'+
      ' Tab para cambiar entre paneles\n\n'+
      ' ==== INFO DEL SISTEMA ====\n\n'+
      ' Node.js:    '+process.version+'\n'+
      ' PID:        '+process.pid+'\n'+
      ' Platform:   '+os.platform()+' '+os.arch()+'\n'+
      ' Hostname:   '+(os.hostname()||'android')+'\n'+
      ' CPUs:       '+cpuInfo+'\n'+
      ' RAM Total:  '+formatBytes(os.totalmem())+'\n'+
      ' Prefix:     '+(process.env.PREFIX||'N/A')+'\n\n'+
      ' Escribe closemenu o presiona Enter para cerrar\n'
  });
  screen.append(helpBox);
  helpVisible = true;
  helpBox.key(['enter','escape','space'], () => closeHelp());
  helpBox.focus();
  screen.render();
}

function runBuiltinCommand(value) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const parts = trimmed.split(/\s+/);

  if (lower === 'exit' || lower === 'quit') {
    terminalLog.add('Cerrando DIXI Panel...');
    screen.render();
    setTimeout(() => { try { screen.destroy(); } catch(e) {} process.exit(0); }, 400);
    return true;
  }
  if (lower === 'cls' || lower === 'clear') {
    terminalLog.setContent(''); screen.render(); return true;
  }
  if (lower === 'help') { showHelp(); return true; }
  if (lower === 'closemenu' || lower === 'close') {
    if (helpVisible) closeHelp();
    else terminalLog.add('No hay menu abierto.');
    return true;
  }
  if (lower === 'pwd') {
    terminalLog.add(currentDir); return true;
  }
  if (parts[0].toLowerCase() === 'cd') {
    const target = parts[1] || (process.env.HOME||'/');
    try {
      const newDir = path.resolve(currentDir, target);
      fs.accessSync(newDir);
      currentDir = newDir;
      updateFiles(); getDiskInfo();
      terminalLog.add('-> '+currentDir);
      updateStatus('Dir: '+currentDir);
    } catch(e) { terminalLog.add('cd: '+e.message); }
    return true;
  }
  if (lower === 'sysinfo') {
    const cpus = safeCpus();
    [
      '==== Info del Sistema ====',
      ' OS:       '+os.type()+' '+os.release()+' '+os.arch(),
      ' Hostname: '+(os.hostname()||'android'),
      ' CPUs:     '+cpus.length+' cores'+(cpus.length>0?' @ '+cpus[0].model.substring(0,28):''),
      ' RAM:      '+formatBytes(os.totalmem())+' total / '+formatBytes(os.freemem())+' libre',
      ' Uptime:   '+formatUptime(os.uptime()),
      ' Load:     '+getLoadAvg(),
      ' Node.js:  '+process.version,
      ' PID:      '+process.pid,
      ' Prefix:   '+(process.env.PREFIX||'N/A'),
    ].forEach(l => terminalLog.add(l));
    return true;
  }
  if (lower === 'mem') {
    const total = os.totalmem(), free = os.freemem(), used = total-free;
    const pct = Math.floor((used/total)*100);
    terminalLog.add('==== Memoria ====');
    terminalLog.add(' Total:  '+formatBytes(total));
    terminalLog.add(' Usado:  '+formatBytes(used)+'  ('+pct+'%)');
    terminalLog.add(' Libre:  '+formatBytes(free));
    terminalLog.add(' ['+bar(pct,30)+']');
    return true;
  }
  if (lower === 'net') {
    const ifaces = os.networkInterfaces()||{};
    terminalLog.add('==== Interfaces de Red ====');
    for (const name in ifaces) {
      (ifaces[name]||[]).forEach(i => {
        terminalLog.add(' '+name+'  '+i.family+'  '+i.address+'  '+(i.internal?'(interno)':'(externo)'));
      });
    }
    return true;
  }
  if (lower === 'ports') {
    terminalLog.add('==== Puertos en escucha ====');
    const out = safeExec('ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', 2000);
    if (out.trim()) out.split('\n').filter(Boolean).slice(0,15).forEach(l => terminalLog.add(' '+l.substring(0,88)));
    else terminalLog.add(' No disponible en este entorno');
    return true;
  }
  if (lower === 'top5') {
    terminalLog.add('==== Top Procesos por CPU ====');
    const out = safeExec('ps -eo pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -8 || ps aux 2>/dev/null | head -8', 2000);
    if (out.trim()) out.split('\n').filter(Boolean).forEach(l => terminalLog.add(' '+l.substring(0,88)));
    else terminalLog.add(' No disponible');
    return true;
  }
  if (lower === 'env') {
    terminalLog.add('==== Variables de Entorno ====');
    Object.entries(process.env).slice(0,25).forEach(([k,v]) => terminalLog.add(' '+k+'='+String(v).substring(0,58)));
    return true;
  }
  if (lower === 'bat' || lower === 'battery') {
    terminalLog.add('==== Bateria ====');
    const out = safeExec('termux-battery-status 2>/dev/null', 2000);
    if (out.trim()) out.split('\n').filter(Boolean).forEach(l => terminalLog.add(' '+l));
    else {
      const cap = safeExec('cat /sys/class/power_supply/battery/capacity 2>/dev/null', 1000);
      const stat = safeExec('cat /sys/class/power_supply/battery/status 2>/dev/null', 1000);
      if (cap.trim()) terminalLog.add(' Nivel: '+cap.trim()+'%  Estado: '+(stat.trim()||'N/A'));
      else terminalLog.add(' No disponible. Instala termux-api.');
    }
    return true;
  }
  if (lower === 'storage') {
    terminalLog.add('==== Almacenamiento ====');
    const out = safeExec('df -h 2>/dev/null | head -12', 2000);
    if (out.trim()) out.split('\n').filter(Boolean).forEach(l => terminalLog.add(' '+l.substring(0,88)));
    else terminalLog.add(' No disponible');
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
  terminalLog.add('$ '+value);
  if (runBuiltinCommand(value)) return;
  const args = value.trim().split(/\s+/);
  const cmd = args.shift();
  let proc;
  try {
    proc = spawn(cmd, args, { shell: true, cwd: currentDir, env: process.env });
  } catch(e) {
    terminalLog.add('Error: '+e.message);
    return;
  }
  runningProcs.push(proc);
  proc.stdout.on('data', (data) => {
    data.toString().split('\n').filter(l=>l.trim()).forEach(line => terminalLog.add(line.replace(/[{}]/g,'').substring(0,200)));
  });
  proc.stderr.on('data', (data) => {
    data.toString().split('\n').filter(l=>l.trim()).forEach(line => terminalLog.add('ERR: '+line.substring(0,200)));
  });
  proc.on('close', (code) => {
    runningProcs = runningProcs.filter(p=>p!==proc);
    terminalLog.add('[codigo: '+code+']');
    updateFiles();
    commandInput.focus();
    screen.render();
  });
  proc.on('error', (err) => {
    terminalLog.add('Error: '+err.message);
    runningProcs = runningProcs.filter(p=>p!==proc);
    commandInput.focus();
  });
});

commandInput.key(['up'], () => {
  if (!commandHistory.length) return;
  historyIndex = Math.min(historyIndex+1, commandHistory.length-1);
  commandInput.setValue(commandHistory[historyIndex]);
  screen.render();
});

commandInput.key(['down'], () => {
  historyIndex = Math.max(historyIndex-1, -1);
  commandInput.setValue(historyIndex >= 0 ? commandHistory[historyIndex] : '');
  screen.render();
});

filesBox.on('select', (item) => {
  if (!item) return;
  showFilePreview(item.getText());
  commandInput.focus();
});

screen.key(['C-l'], () => {
  updateMetrics(); updateNetwork(); updateFiles(); getDiskInfo(); updateHeader();
  terminalLog.add('[Actualizado]');
  screen.render();
});

screen.key(['C-c'], () => {
  if (helpVisible) { closeHelp(); return; }
  terminalLog.add('[Ctrl+C: escribe "exit" para salir]');
  commandInput.focus();
  screen.render();
});

const focusables = [commandInput, filesBox, filePreviewBox];
const focusNames  = ['Terminal', 'Explorador', 'Vista Previa'];
screen.key(['tab'], () => {
  focusIndex = (focusIndex+1) % focusables.length;
  focusables[focusIndex].focus();
  updateStatus('Panel activo: '+focusNames[focusIndex]);
  screen.render();
});

updateMetrics();
updateNetwork();
updateFiles();
getDiskInfo();
updateHeader();
updateStatus();

terminalLog.add('DIXI Panel iniciado. Node '+process.version);
terminalLog.add('Comandos: exit cls help cd pwd sysinfo ports top5 mem net env bat storage');
terminalLog.add('Para abrir ayuda: escribe  help');
terminalLog.add('Para salir del menu ayuda: escribe  closemenu');
terminalLog.add('');

setInterval(() => { try { updateMetrics(); updateHeader(); } catch(e) {} }, 2000);
setInterval(() => { try { updateNetwork(); getDiskInfo(); } catch(e) {} }, 6000);

commandInput.focus();
screen.render();
