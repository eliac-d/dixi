
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
const state = {
  mode: 'DASHBOARD', // Puede ser 'DASHBOARD', 'EXPLORER', 'COMMAND'
  // Estado del Dashboard
  cpuHistory: [],
  lastCpuTimes: [],
  netHistory: [],
  prevNet: null,
  // Estado del Explorador
  currentPath: process.env.HOME || process.cwd() || '/data/data/com.termux/files/home',
  files: [],
  selectedIndex: 0,
  scrollOffset: 0,
  // Estado de Comandos
  cmdInput: '',
  cmdOutput: ''
};

try { state.lastCpuTimes = os.cpus().map(c => c.times); } catch(e) {}

// ==========================================
// CONSTANTES DE DISEÑO Y COLOR
// ==========================================
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
  white: '\x1b[37m', gray: '\x1b[90m',
  bgCyan: '\x1b[46m', bgBlack: '\x1b[40m', bgGray: '\x1b[47m',
  black: '\x1b[30m'
};

const BOX = {
  tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│',
  t: '┬', b: '┴', l: '├', r: '┤', c: '┼'
};

// ==========================================
// FUNCIONES DE CONTROL DE TERMINAL (TUI)
// ==========================================
const esc = (code) => `\x1b[${code}`;
const clearScreen = () => process.stdout.write(esc('2J') + esc('0;0H'));
const hideCursor = () => process.stdout.write(esc('?25l'));
const showCursor = () => process.stdout.write(esc('?25h'));
const moveCursor = (x, y) => process.stdout.write(esc(`${y};${x}H`));

function drawBox(x, y, width, height, title, color = C.cyan) {
  const cBorder = C.dim + C.white;
  moveCursor(x, y);
  process.stdout.write(cBorder + BOX.tl + BOX.h.repeat(width - 2) + BOX.tr + C.reset);
  
  if (title) {
    moveCursor(x + 2, y);
    process.stdout.write(color + C.bold + ' ' + title + ' ' + C.reset);
  }

  for (let i = 1; i < height - 1; i++) {
    moveCursor(x, y + i);
    process.stdout.write(cBorder + BOX.v + C.reset);
    moveCursor(x + width - 1, y + i);
    process.stdout.write(cBorder + BOX.v + C.reset);
  }

  moveCursor(x, y + height - 1);
  process.stdout.write(cBorder + BOX.bl + BOX.h.repeat(width - 2) + BOX.br + C.reset);
}

function writeAt(x, y, text) {
  moveCursor(x, y);
  process.stdout.write(text);
}

// ==========================================
// FUNCIONES UTILITARIAS Y DE FORMATEO
// ==========================================
function safeCpus() { try { return os.cpus()||[]; } catch(e) { return []; } }
function safeExec(cmd, t) { try { return execSync(cmd,{timeout:t||1500,encoding:'utf8'}); } catch(e) { return ''; } }

function bar(percent, width, type = 'solid') {
  width = width || 20;
  percent = Math.max(0, Math.min(100, percent||0));
  const filled = Math.round((percent/100)*width);
  const color = percent > 85 ? C.red : percent > 60 ? C.yellow : C.green;
  
  if (type === 'blocks') {
    const chars = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
    let str = color;
    const exact = (percent / 100) * width;
    for (let i = 0; i < width; i++) {
      if (exact >= i + 1) str += '█';
      else if (exact > i) str += chars[Math.floor((exact - i) * 8)];
      else str += C.gray + ' ' + color;
    }
    return str + C.reset;
  } else {
    const filledChar = '█';
    const emptyChar = '░';
    return color + filledChar.repeat(filled) + C.gray + emptyChar.repeat(width-filled) + C.reset;
  }
}

function sparkline(arr, width) {
  width = width || 10;
  const chars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const data = arr.slice(-width);
  while (data.length < width) data.unshift(0);
  return data.map(v => {
    const idx = Math.min(chars.length-1, Math.floor((v/100)*chars.length));
    const color = v>80 ? C.red : v>50 ? C.yellow : C.cyan;
    return color + chars[idx] + C.reset;
  }).join('');
}

function formatBytes(b) {
  if (!b||b<0) return '0 B';
  if (b<1024) return b.toFixed(0)+' B';
  if (b<1024*1024) return (b/1024).toFixed(1)+' KB';
  if (b<1024*1024*1024) return (b/1024/1024).toFixed(1)+' MB';
  return (b/1024/1024/1024).toFixed(2)+' GB';
}

function formatUptime(s) {
  s = s||0;
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60), sec=Math.floor(s%60);
  if (d>0) return d+'d '+h+'h '+m+'m';
  if (h>0) return h+'h '+m+'m '+sec+'s';
  return m+'m '+sec+'s';
}

function pad(str, len, char = ' ') {
  str = String(str);
  const visLen = str.replace(/\x1b\[[0-9;]*m/g,'').length;
  if (visLen >= len) return str;
  return str + char.repeat(len - visLen);
}

// ==========================================
// RECOLECCIÓN DE DATOS DEL SISTEMA
// ==========================================
function getCpuUsage() {
  try {
    const cpus = safeCpus();
    if (!cpus.length || !state.lastCpuTimes.length || cpus.length!==state.lastCpuTimes.length) {
      state.lastCpuTimes = cpus.map(c=>c.times);
      return 0;
    }
    const cur = cpus.map(c=>c.times);
    let idleDiff=0, totalDiff=0;
    for (let i=0;i<cur.length;i++) {
      for (const t in cur[i]) totalDiff += (cur[i][t]||0)-(state.lastCpuTimes[i][t]||0);
      idleDiff += (cur[i].idle||0)-(state.lastCpuTimes[i].idle||0);
    }
    state.lastCpuTimes = cur;
    if (totalDiff===0) return 0;
    return Math.max(0,Math.min(100,100-Math.floor((100*idleDiff)/totalDiff)));
  } catch(e) { return 0; }
}

function getPerCoreCpu() {
  try {
    const cpus = safeCpus();
    return cpus.map(c => {
      const total = Object.values(c.times).reduce((a,b)=>a+b,0);
      const idle = c.times.idle;
      return Math.max(0, Math.min(100, 100 - Math.floor((idle/total)*100)));
    });
  } catch(e) { return []; }
}

function getBattery() {
  const out = safeExec('termux-battery-status 2>/dev/null', 1500);
  if (out.trim()) {
    try {
      const j = JSON.parse(out);
      return { percentage: j.percentage, status: j.status, health: j.health, temp: j.temperature, plugged: j.plugged };
    } catch(e) {}
  }
  const cap = safeExec('cat /sys/class/power_supply/battery/capacity 2>/dev/null',800);
  const stat = safeExec('cat /sys/class/power_supply/battery/status 2>/dev/null',800);
  if (cap.trim()) return { percentage: parseInt(cap.trim()), status: stat.trim()||'Unknown' };
  return null;
}

function getNetworkInterfaces() {
  try {
    const ifaces = os.networkInterfaces()||{};
    const result = [];
    for (const name in ifaces) {
      const f = (ifaces[name]||[]).find(i=>!i.internal && i.family==='IPv4');
      if (f) result.push({ name, address: f.address, mac: f.mac });
    }
    return result;
  } catch(e) { return []; }
}

function getNetworkSpeed() {
  try {
    const data = fs.readFileSync('/proc/net/dev','utf8');
    const lines = data.split('\n').slice(2);
    let rx = 0, tx = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const iface = parts[0].replace(':','');
      if (iface === 'lo' || iface.includes('wlan') === false && iface.includes('rmnet') === false && iface.includes('eth') === false) continue; 
      rx += parseInt(parts[1])||0;
      tx += parseInt(parts[9])||0;
    }
    const now = Date.now();
    let rxSpeed = 0, txSpeed = 0;
    if (state.prevNet) {
      const dt = (now - state.prevNet.time)/1000;
      rxSpeed = Math.max(0,(rx - state.prevNet.rx)/dt);
      txSpeed = Math.max(0,(tx - state.prevNet.tx)/dt);
    }
    state.prevNet = { rx, tx, time: now };
    return { rx, tx, rxSpeed, txSpeed };
  } catch(e) { return null; }
}

function getDiskInfo() {
  const out = safeExec('df -h /data 2>/dev/null || df -h /', 1500);
  if (!out) return null;
  const lines = out.trim().split('\n');
  const line = lines[lines.length-1];
  const p = line.trim().split(/\s+/);
  if (p.length < 5) return null;
  const pct = parseInt((p[4]||'0').replace('%',''))||0;
  return { total: p[1], used: p[2], avail: p[3], pct, mount: p[5]||'/' };
}

function getTopProcesses(n) {
  const out = safeExec(`ps -eo pid,pcpu,pmem,user,comm --sort=-pcpu 2>/dev/null | head -${n+1} | tail -${n}`, 1500);
  if (!out.trim()) return [];
  return out.split('\n').filter(Boolean).map(line => {
    const p = line.trim().split(/\s+/);
    return { pid: p[0], cpu: parseFloat(p[1])||0, mem: parseFloat(p[2])||0, user: p[3]||'', name: (p[4]||'').split('/').pop() };
  });
}

function getProcessCount() {
  const out = safeExec('ps -e 2>/dev/null | wc -l', 1000);
  return Math.max(0, (parseInt(out.trim())||0) - 1);
}

function getThermal() {
  const out = safeExec('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null', 800);
  if (out.trim()) {
    const t = parseInt(out.trim());
    if (!isNaN(t)) return (t/1000).toFixed(1);
  }
  return null;
}

// ==========================================
// RENDERIZADO DEL DASHBOARD
// ==========================================
function renderDashboard() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  clearScreen();

  // Header principal
  const title = ' DIXI CORE v2.0 - SYSTEM MONITOR ';
  writeAt(Math.floor((cols - title.length) / 2), 1, C.bgCyan + C.black + C.bold + title + C.reset);
  
  const now = new Date();
  writeAt(cols - 22, 1, C.gray + now.toLocaleDateString() + ' ' + now.toLocaleTimeString() + C.reset);
  writeAt(2, 1, C.cyan + 'MODE: ' + C.bold + 'DASHBOARD' + C.reset);

  // Cálculos de layout dinámico
  const halfW = Math.floor(cols / 2);
  const leftW = halfW - 1;
  const rightW = cols - halfW - 1;

  // --- PANEL CPU (Arriba Izquierda) ---
  const cpuHeight = 9;
  drawBox(1, 3, leftW, cpuHeight, 'CPU USAGE', C.cyan);
  const cpu = getCpuUsage();
  state.cpuHistory.push(cpu);
  if (state.cpuHistory.length > leftW - 4) state.cpuHistory.shift();
  
  writeAt(3, 4, `TOTAL: [${bar(cpu, leftW - 18, 'blocks')}] ${C.bold}${String(cpu).padStart(3)}%${C.reset}`);
  writeAt(3, 5, `GRAPH: ${sparkline(state.cpuHistory, leftW - 11)}`);
  
  const cpus = safeCpus();
  const perCore = getPerCoreCpu();
  if (perCore.length > 0) {
    let coreLine1 = '', coreLine2 = '';
    perCore.forEach((c, i) => {
      const cStr = `${C.dim}C${i}:${C.reset}${c>75?C.red:c>50?C.yellow:C.green}${String(c).padStart(3)}%${C.reset} `;
      if (i < 4) coreLine1 += cStr;
      else if (i < 8) coreLine2 += cStr;
    });
    writeAt(3, 7, coreLine1);
    writeAt(3, 8, coreLine2);
  }
  const load = (() => { try { return os.loadavg(); } catch(e) { return null; } })();
  if (load) writeAt(3, 10, `${C.gray}LOAD AVG:${C.reset} ${load.map(v=>v.toFixed(2)).join(' ')}`);

  // --- PANEL MEMORIA (Arriba Derecha) ---
  drawBox(halfW + 1, 3, rightW, cpuHeight, 'MEMORY', C.magenta);
  const totalMem = os.totalmem(), freeMem = os.freemem(), usedMem = totalMem - freeMem;
  const memPct = totalMem > 0 ? Math.floor((usedMem / totalMem) * 100) : 0;
  
  writeAt(halfW + 3, 4, `RAM: [${bar(memPct, rightW - 16)}] ${C.bold}${String(memPct).padStart(3)}%${C.reset}`);
  writeAt(halfW + 3, 6, `${C.magenta}■${C.reset} USED:  ${C.bold}${formatBytes(usedMem).padStart(10)}${C.reset}`);
  writeAt(halfW + 3, 7, `${C.green}■${C.reset} FREE:  ${C.bold}${formatBytes(freeMem).padStart(10)}${C.reset}`);
  writeAt(halfW + 3, 8, `${C.cyan}■${C.reset} TOTAL: ${C.bold}${formatBytes(totalMem).padStart(10)}${C.reset}`);
  const temp = getThermal();
  if (temp) writeAt(halfW + 3, 10, `${C.gray}SYS TEMP:${C.reset} ${temp>70?C.red:temp>50?C.yellow:C.green}${temp}°C${C.reset}`);

  // --- PANEL RED (Medio Izquierda) ---
  const midY = 3 + cpuHeight;
  const midHeight = 8;
  drawBox(1, midY, leftW, midHeight, 'NETWORK', C.blue);
  const netSpeed = getNetworkSpeed();
  if (netSpeed) {
    writeAt(3, midY + 1, `${C.green}▼ DOWN: ${formatBytes(netSpeed.rxSpeed)}/s${C.reset}`);
    writeAt(3, midY + 2, `${C.cyan}▲ UP:   ${formatBytes(netSpeed.txSpeed)}/s${C.reset}`);
    writeAt(3, midY + 4, `${C.gray}TOTAL RX: ${formatBytes(netSpeed.rx)}${C.reset}`);
    writeAt(3, midY + 5, `${C.gray}TOTAL TX: ${formatBytes(netSpeed.tx)}${C.reset}`);
  }
  const ifaces = getNetworkInterfaces();
  if (ifaces.length > 0) {
    writeAt(3, midY + 6, `${C.dim}IP: ${C.reset}${ifaces[0].address}`);
  }

  // --- PANEL DISCO Y BATERÍA (Medio Derecha) ---
  const battery = getBattery();
  const disk = getDiskInfo();
  
  if (battery) {
    drawBox(halfW + 1, midY, rightW, Math.floor(midHeight/2) + 1, 'BATTERY', C.green);
    const bpct = battery.percentage || 0;
    writeAt(halfW + 3, midY + 1, `[${bar(bpct, rightW - 14)}] ${C.bold}${String(bpct).padStart(3)}%${C.reset}`);
    writeAt(halfW + 3, midY + 2, `${C.gray}STATUS:${C.reset} ${battery.status} ${battery.plugged ? '⚡' : ''}`);
    if (battery.temp) writeAt(halfW + 3, midY + 3, `${C.gray}TEMP:${C.reset} ${battery.temp}°C`);
  }

  const diskY = battery ? midY + Math.floor(midHeight/2) + 1 : midY;
  const diskH = battery ? midHeight - Math.floor(midHeight/2) - 1 : midHeight;
  drawBox(halfW + 1, diskY, rightW, diskH, 'STORAGE (/data)', C.yellow);
  if (disk) {
    writeAt(halfW + 3, diskY + 1, `[${bar(disk.pct, rightW - 14)}] ${C.bold}${String(disk.pct).padStart(3)}%${C.reset}`);
    writeAt(halfW + 3, diskY + 2, `${C.yellow}■${C.reset} USED: ${disk.used} / ${disk.total}`);
    writeAt(halfW + 3, diskY + 3, `${C.green}■${C.reset} FREE: ${disk.avail}`);
  }

  // --- PANEL PROCESOS (Abajo) ---
  const botY = midY + midHeight;
  const botHeight = rows - botY - 2; // Dejar espacio para footer
  drawBox(1, botY, cols, botHeight, `TOP PROCESSES (Total: ${getProcessCount()})`, C.red);
  const procs = getTopProcesses(botHeight - 3);
  writeAt(3, botY + 1, C.bold + pad('PID', 8) + pad('USER', 10) + pad('CPU%', 8) + pad('MEM%', 8) + 'COMMAND' + C.reset);
  procs.forEach((p, i) => {
    if (i >= botHeight - 3) return;
    const ccolor = p.cpu > 10 ? C.red : p.cpu > 3 ? C.yellow : C.green;
    const line = pad(p.pid, 8) + C.gray + pad(p.user, 10) + C.reset + ccolor + pad(p.cpu.toFixed(1)+'%', 8) + C.reset + C.cyan + pad(p.mem.toFixed(1)+'%', 8) + C.reset + p.name;
    writeAt(3, botY + 2 + i, line.substring(0, cols - 6));
  });

  // Footer
  writeAt(1, rows, `${C.bgGray}${C.black} [E] File Explorer  |  [C] Command Line  |  [Q] Quit ${C.reset}`);
}

// ==========================================
// LÓGICA Y RENDERIZADO DEL EXPLORADOR
// ==========================================
function loadDirectory() {
  try {
    const items = fs.readdirSync(state.currentPath);
    state.files = [{ name: '..', isDir: true, size: 0, mtime: null }];
    
    const parsed = items.map(item => {
      try {
        const fullPath = path.join(state.currentPath, item);
        const stats = fs.statSync(fullPath);
        return {
          name: item,
          isDir: stats.isDirectory(),
          size: stats.size,
          mtime: stats.mtime,
          mode: stats.mode
        };
      } catch(e) { return null; }
    }).filter(Boolean);

    // Ordenar: Directorios primero, luego alfabético
    parsed.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    state.files.push(...parsed);
    state.selectedIndex = 0;
    state.scrollOffset = 0;
  } catch(err) {
    state.files = [{ name: '..', isDir: true, size: 0, mtime: null }];
    state.cmdOutput = `Error reading dir: ${err.message}`;
  }
}

function renderExplorer() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  clearScreen();

  // Header
  const title = ' DIXI CORE - FILE EXPLORER ';
  writeAt(Math.floor((cols - title.length) / 2), 1, C.bgMagenta + C.black + C.bold + title + C.reset);
  writeAt(2, 1, C.magenta + 'MODE: ' + C.bold + 'EXPLORER' + C.reset);

  // Path actual
  drawBox(1, 3, cols, 3, 'CURRENT PATH', C.yellow);
  writeAt(3, 4, C.bold + state.currentPath.substring(0, cols - 6) + C.reset);

  // Lista de archivos
  const listY = 6;
  const listHeight = rows - listY - 6;
  drawBox(1, listY, cols, listHeight, `FILES (${state.files.length})`, C.cyan);
  
  // Headers de la tabla
  writeAt(3, listY + 1, C.dim + pad('NAME', Math.floor(cols * 0.5)) + pad('SIZE', 15) + pad('MODIFIED', 20) + C.reset);

  // Ajuste de scroll
  if (state.selectedIndex >= state.scrollOffset + listHeight - 3) {
    state.scrollOffset = state.selectedIndex - listHeight + 4;
  } else if (state.selectedIndex < state.scrollOffset) {
    state.scrollOffset = state.selectedIndex;
  }

  // Renderizar items
  const visibleFiles = state.files.slice(state.scrollOffset, state.scrollOffset + listHeight - 3);
  visibleFiles.forEach((file, i) => {
    const isSelected = (i + state.scrollOffset === state.selectedIndex);
    const yPos = listY + 2 + i;
    
    let icon = file.isDir ? '📁 ' : '📄 ';
    let color = file.isDir ? C.blue + C.bold : C.white;
    if (file.name === '..') { icon = '🔙 '; color = C.yellow; }
    
    const sizeStr = file.isDir ? '<DIR>' : formatBytes(file.size);
    const dateStr = file.mtime ? file.mtime.toISOString().split('T')[0] + ' ' + file.mtime.toTimeString().split(' ')[0] : '';
    
    let lineStr = icon + color + pad(file.name, Math.floor(cols * 0.5) - 3) + C.reset + 
                  C.cyan + pad(sizeStr, 15) + C.reset + 
                  C.gray + pad(dateStr, 20) + C.reset;

    if (isSelected) {
      writeAt(2, yPos, C.bgGray + C.black + lineStr.replace(/\x1b\[[0-9;]*m/g, '') + C.reset); // Limpiar colores para highlight
      writeAt(2, yPos, C.bgGray + C.black + icon.trim() + ' ' + pad(file.name, Math.floor(cols*0.5)-3) + pad(sizeStr, 15) + pad(dateStr, 20).substring(0, cols - Math.floor(cols*0.5) - 15 - 4) + C.reset);
    } else {
      writeAt(3, yPos, lineStr.substring(0, cols + 30)); // Aproximado por los ansi codes
    }
  });

  // Salida de comandos / Errores
  const infoY = listY + listHeight;
  drawBox(1, infoY, cols, 4, 'OUTPUT / INFO', C.green);
  const outLines = state.cmdOutput.split('\n');
  writeAt(3, infoY + 1, C.dim + outLines[0].substring(0, cols - 6) + C.reset);
  if (outLines.length > 1) writeAt(3, infoY + 2, C.dim + outLines[1].substring(0, cols - 6) + C.reset);

  // Footer
  writeAt(1, rows, `${C.bgGray}${C.black} [↑/↓] Navigate  |  [Enter] Open/Enter  |  [D] Dashboard  |  [C] Command  |  [Q] Quit ${C.reset}`);
}

// ==========================================
// RENDERIZADO MODO COMANDO
// ==========================================
function renderCommand() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  clearScreen();
  drawBox(1, rows - 5, cols, 5, 'EXECUTE COMMAND (in ' + state.currentPath + ')', C.red);
  writeAt(3, rows - 3, C.bold + C.green + '❯ ' + C.reset + state.cmdInput);
  writeAt(1, rows, `${C.bgGray}${C.black} Type command and press Enter. [Esc] to cancel. ${C.reset}`);
  
  // Posicionar cursor para escribir
  showCursor();
  moveCursor(5 + state.cmdInput.length, rows - 3);
}

function executeCommand(cmd) {
  if (!cmd.trim()) return;
  try {
    const result = execSync(cmd, { cwd: state.currentPath, encoding: 'utf8', stdio: 'pipe' });
    state.cmdOutput = result.trim() || 'Command executed successfully (no output).';
  } catch (err) {
    state.cmdOutput = err.stderr ? err.stderr.trim() : err.message;
  }
}

// ==========================================
// MOTOR PRINCIPAL Y BUCLE
// ==========================================
function render() {
  hideCursor();
  if (state.mode === 'DASHBOARD') {
    renderDashboard();
  } else if (state.mode === 'EXPLORER') {
    renderExplorer();
  } else if (state.mode === 'COMMAND') {
    renderCommand();
  }
}

// Configurar captura de teclado
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  // Salida global de emergencia
  if (key.ctrl && key.name === 'c') {
    clearScreen();
    showCursor();
    process.exit();
  }

  if (state.mode === 'COMMAND') {
    if (key.name === 'escape') {
      state.mode = 'EXPLORER';
      state.cmdInput = '';
      render();
    } else if (key.name === 'return') {
      state.mode = 'EXPLORER';
      executeCommand(state.cmdInput);
      state.cmdInput = '';
      loadDirectory(); // Refrescar por si el comando alteró archivos
      render();
    } else if (key.name === 'backspace') {
      state.cmdInput = state.cmdInput.slice(0, -1);
      render();
    } else if (str && !key.ctrl && !key.meta) {
      state.cmdInput += str;
      render();
    }
    return;
  }

  // Navegación global
  if (key.name === 'q') {
    clearScreen();
    showCursor();
    process.exit();
  } else if (key.name === 'e' || key.name === 'E') {
    state.mode = 'EXPLORER';
    loadDirectory();
    render();
  } else if (key.name === 'd' || key.name === 'D') {
    state.mode = 'DASHBOARD';
    render();
  } else if (key.name === 'c' || key.name === 'C') {
    state.mode = 'COMMAND';
    render();
  }

  // Interacciones del Explorador
  if (state.mode === 'EXPLORER') {
    if (key.name === 'up') {
      if (state.selectedIndex > 0) state.selectedIndex--;
      render();
    } else if (key.name === 'down') {
      if (state.selectedIndex < state.files.length - 1) state.selectedIndex++;
      render();
    } else if (key.name === 'return') {
      const selected = state.files[state.selectedIndex];
      if (!selected) return;
      
      if (selected.name === '..') {
        state.currentPath = path.resolve(state.currentPath, '..');
        loadDirectory();
        render();
      } else if (selected.isDir) {
        state.currentPath = path.join(state.currentPath, selected.name);
        loadDirectory();
        render();
      } else {
        // Es un archivo. Intentamos ejecutarlo o leer una muestra.
        const filePath = path.join(state.currentPath, selected.name);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          state.cmdOutput = `[FILE PREVIEW]\n${content.substring(0, 100).replace(/\n/g, ' ')}...`;
        } catch(e) {
          state.cmdOutput = `Cannot read file preview: ${e.message}`;
        }
        render();
      }
    }
  }
});

// Manejo de resize de ventana
process.stdout.on('resize', () => {
  render();
});

// Inicio
loadDirectory();
render();

// Bucle de actualización (solo renderiza automático si estamos en dashboard)
setInterval(() => {
  if (state.mode === 'DASHBOARD') {
    render();
  }
}, 2000);
