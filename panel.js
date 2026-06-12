
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
const state = {
  mode: 'DASHBOARD', // 'DASHBOARD', 'EXPLORER', 'COMMAND'
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

// Historiales para cálculos delta de CPU mediante /proc/stat
let prevCpuTotal = 0;
let prevCpuIdle = 0;
let prevCores = [];

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

const EL = '\x1b[K'; // Secuencia ANSI para borrar hasta el final de la línea actual (Evita parpadeo)

// ==========================================
// FUNCIONES DE CONTROL DE TERMINAL (TUI)
// ==========================================
const esc = (code) => `\x1b[${code}`;
const clearScreen = () => process.stdout.write(esc('2J') + esc('0;0H'));
const resetCursor = () => process.stdout.write(esc('H')); // Retorna cursor a 1,1 sin parpadeo de pantalla
const hideCursor = () => process.stdout.write(esc('?25l'));
const showCursor = () => process.stdout.write(esc('?25h'));
const moveCursor = (x, y) => process.stdout.write(esc(`${y};${x}H`));

function drawBox(x, y, width, height, title, color = C.cyan) {
  const cBorder = C.dim + C.white;
  moveCursor(x, y);
  process.stdout.write(cBorder + BOX.tl + BOX.h.repeat(width - 2) + BOX.tr + C.reset + EL);
  
  if (title) {
    moveCursor(x + 2, y);
    process.stdout.write(color + C.bold + ' ' + title + ' ' + C.reset);
  }

  for (let i = 1; i < height - 1; i++) {
    moveCursor(x, y + i);
    process.stdout.write(cBorder + BOX.v + C.reset);
    moveCursor(x + width - 1, y + i);
    process.stdout.write(cBorder + BOX.v + C.reset + EL);
  }

  moveCursor(x, y + height - 1);
  process.stdout.write(cBorder + BOX.bl + BOX.h.repeat(width - 2) + BOX.br + C.reset + EL);
}

function writeAt(x, y, text) {
  moveCursor(x, y);
  process.stdout.write(text + EL);
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
// RECOLECCIÓN DE DATOS DEL SISTEMA (ROBUSTA)
// ==========================================
function getCpuMetrics() {
  // Intenta leer /proc/stat primero (Soporte nativo y exacto en Android/Linux)
  try {
    if (fs.existsSync('/proc/stat')) {
      const data = fs.readFileSync('/proc/stat', 'utf8');
      const lines = data.split('\n');
      
      // CPU Total
      const totalLine = lines.find(l => l.startsWith('cpu '));
      let totalPercent = 0;
      if (totalLine) {
        const parts = totalLine.trim().split(/\s+/).slice(1).map(Number);
        const idle = parts[3] + (parts[4] || 0); // idle + iowait
        const total = parts.reduce((a, b) => a + b, 0);
        
        if (prevCpuTotal > 0) {
          const totalDiff = total - prevCpuTotal;
          const idleDiff = idle - prevCpuIdle;
          if (totalDiff > 0) {
            totalPercent = Math.max(0, Math.min(100, Math.round(100 * (totalDiff - idleDiff) / totalDiff)));
          }
        }
        prevCpuTotal = total;
        prevCpuIdle = idle;
      }

      // CPU Cores individuales
      const corePercents = [];
      lines.forEach(line => {
        if (line.startsWith('cpu') && !line.startsWith('cpu ')) {
          const cParts = line.trim().split(/\s+/);
          const coreName = cParts[0];
          const ticks = cParts.slice(1).map(Number);
          const cIdle = ticks[3] + (ticks[4] || 0);
          const cTotal = ticks.reduce((a, b) => a + b, 0);
          
          let cPercent = 0;
          const prevCore = prevCores.find(c => c.name === coreName);
          if (prevCore) {
            const tDiff = cTotal - prevCore.total;
            const iDiff = cIdle - prevCore.idle;
            if (tDiff > 0) {
              cPercent = Math.max(0, Math.min(100, Math.round(100 * (tDiff - iDiff) / tDiff)));
            }
            prevCore.total = cTotal;
            prevCore.idle = cIdle;
          } else {
            prevCores.push({ name: coreName, total: cTotal, idle: cIdle });
          }
          corePercents.push(cPercent);
        }
      });

      if (totalLine) {
        return { total: totalPercent, cores: corePercents };
      }
    }
  } catch (e) {
    // Si falla la lectura directa, continúa al método estándar os.cpus()
  }

  // Fallback con os.cpus()
  try {
    const cpus = safeCpus();
    if (!cpus.length) return { total: 0, cores: [] };

    let totalPercent = 0;
    if (state.lastCpuTimes.length === cpus.length) {
      let idleDiff = 0, totalDiff = 0;
      for (let i = 0; i < cpus.length; i++) {
        const cur = cpus[i].times;
        const last = state.lastCpuTimes[i];
        for (const t in cur) {
          totalDiff += (cur[t] || 0) - (last[t] || 0);
        }
        idleDiff += (cur.idle || 0) - (last.idle || 0);
      }
      if (totalDiff > 0) {
        totalPercent = Math.max(0, Math.min(100, 100 - Math.floor((100 * idleDiff) / totalDiff)));
      }
    }
    state.lastCpuTimes = cpus.map(c => c.times);

    const corePercents = cpus.map(c => {
      const total = Object.values(c.times).reduce((a, b) => a + b, 0);
      const idle = c.times.idle;
      return total > 0 ? Math.max(0, Math.min(100, 100 - Math.floor((idle / total) * 100))) : 0;
    });

    return { total: totalPercent, cores: corePercents };
  } catch (e) {
    return { total: 0, cores: [] };
  }
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
    if (!fs.existsSync('/proc/net/dev')) return null;
    const data = fs.readFileSync('/proc/net/dev','utf8');
    const lines = data.split('\n').slice(2);
    let rx = 0, tx = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const iface = parts[0].replace(':','');
      if (iface === 'lo' || iface.startsWith('sit') || iface.startsWith('ip6')) continue;
      rx += parseInt(parts[1])||0;
      tx += parseInt(parts[9])||0;
    }
    const now = Date.now();
    let rxSpeed = 0, txSpeed = 0;
    if (state.prevNet) {
      const dt = (now - state.prevNet.time)/1000;
      if (dt > 0) {
        rxSpeed = Math.max(0,(rx - state.prevNet.rx)/dt);
        txSpeed = Math.max(0,(tx - state.prevNet.tx)/dt);
      }
    }
    state.prevNet = { rx, tx, time: now };
    return { rx, tx, rxSpeed, txSpeed };
  } catch(e) { return null; }
}

function getDiskInfo() {
  const out = safeExec('df -h /data 2>/dev/null || df -h /', 1500);
  if (!out) return null;
  const lines = out.trim().split('\n');
  if (lines.length < 2) return null;
  const line = lines[lines.length-1];
  const p = line.trim().split(/\s+/);
  if (p.length < 5) return null;
  const pct = parseInt((p[4]||'0').replace('%',''))||0;
  return { total: p[1], used: p[2], avail: p[3], pct, mount: p[5]||'/' };
}

function getTopProcesses(n) {
  // Método 1: VPS estándar con ordenamiento por CPU nativo
  let out = safeExec(`ps -eo pid,pcpu,pmem,user,comm --sort=-pcpu 2>/dev/null | head -${n+1} | tail -${n}`, 1500);
  if (out.trim()) {
    return out.split('\n').filter(Boolean).map(line => {
      const p = line.trim().split(/\s+/);
      return { pid: p[0]||'0', cpu: parseFloat(p[1])||0, mem: parseFloat(p[2])||0, user: p[3]||'system', name: (p[4]||'unknown').split('/').pop() };
    });
  }

  // Método 2: Fallback Termux/Android mediante el comando 'top' en modo batch
  out = safeExec(`top -b -n 1 -s cpu -m ${n + 4} 2>/dev/null`, 1500);
  if (out.trim()) {
    const lines = out.split('\n');
    const procs = [];
    let startParsing = false;
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.includes('PID') && (line.includes('CPU') || line.includes('%CPU') || line.includes('THR'))) {
        startParsing = true;
        continue;
      }
      if (startParsing) {
        const parts = line.split(/\s+/);
        if (parts.length >= 8) {
          const pid = parts[0];
          const user = parts[1];
          // En el comando top de Termux, CPU suele ser el parámetro en índice 8 o 9
          const cpu = parseFloat(parts[8]) || parseFloat(parts[9]) || 0;
          const mem = parseFloat(parts[9]) || parseFloat(parts[10]) || 0;
          const name = parts.slice(11).join(' ') || parts[10] || 'proc';
          if (pid && !isNaN(pid)) {
            procs.push({ pid, user, cpu, mem, name: name.split('/').pop() });
          }
        }
      }
    }
    procs.sort((a, b) => b.cpu - a.cpu);
    return procs.slice(0, n);
  }

  // Método 3: Fallback general 'ps' genérico
  out = safeExec('ps -ax 2>/dev/null || ps 2>/dev/null', 1500);
  if (out.trim()) {
    const lines = out.split('\n').slice(1, n + 1);
    return lines.map(line => {
      const p = line.trim().split(/\s+/);
      return { pid: p[0]||'0', cpu: 0, mem: 0, user: 'user', name: (p[3] || p[4] || 'proc').split('/').pop() };
    });
  }

  return [];
}

function getProcessCount() {
  const out = safeExec('ps -e 2>/dev/null | wc -l || ps 2>/dev/null | wc -l', 1000);
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
// RENDERIZADO DEL DASHBOARD (CERO PARPADEO)
// ==========================================
function renderDashboard() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  // Regresa cursor al inicio para sobrescribir (Cero parpadeo)
  resetCursor();

  // Header principal
  const title = ' DIXI CORE v2.1 - SYSTEM MONITOR ';
  writeAt(Math.floor((cols - title.length) / 2), 1, C.bgCyan + C.black + C.bold + title + C.reset);
  
  const now = new Date();
  writeAt(cols - 25, 1, C.gray + now.toLocaleDateString() + ' ' + now.toLocaleTimeString() + C.reset);
  writeAt(2, 1, C.cyan + 'MODE: ' + C.bold + 'DASHBOARD' + C.reset);

  // Dimensiones del Layout de Paneles
  const halfW = Math.floor(cols / 2);
  const leftW = halfW - 1;
  const rightW = cols - halfW - 1;

  // --- PANEL CPU (Arriba Izquierda) ---
  const cpuHeight = 9;
  drawBox(1, 3, leftW, cpuHeight, 'CPU USAGE', C.cyan);
  
  const cpuData = getCpuMetrics();
  const cpu = cpuData.total;
  state.cpuHistory.push(cpu);
  if (state.cpuHistory.length > leftW - 18) state.cpuHistory.shift();
  
  writeAt(3, 4, `TOTAL: [${bar(cpu, leftW - 18, 'blocks')}] ${C.bold}${String(cpu).padStart(3)}%${C.reset}`);
  writeAt(3, 5, `GRAPH: ${sparkline(state.cpuHistory, leftW - 18)}`);
  
  if (cpuData.cores && cpuData.cores.length > 0) {
    let coreLine1 = ' ', coreLine2 = ' ';
    cpuData.cores.slice(0, 8).forEach((c, i) => {
      const cStr = `${C.dim}C${i}:${C.reset}${c>75?C.red:c>50?C.yellow:C.green}${String(c).padStart(3)}%${C.reset}  `;
      if (i < 4) coreLine1 += cStr;
      else coreLine2 += cStr;
    });
    writeAt(3, 7, coreLine1);
    writeAt(3, 8, coreLine2);
  } else {
    writeAt(3, 7, C.gray + ' Detalles de núcleos no disponibles' + C.reset);
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
  else writeAt(halfW + 3, 10, `${C.gray}SYS TEMP:${C.reset} ${C.dim}N/A${C.reset}`);

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
  } else {
    writeAt(3, midY + 2, C.gray + ' Lectura de Red [No Disponible]' + C.reset);
  }
  const ifaces = getNetworkInterfaces();
  if (ifaces.length > 0) {
    writeAt(3, midY + 6, `${C.dim}IP: ${C.reset}${ifaces[0].address}`);
  } else {
    writeAt(3, midY + 6, `${C.dim}IP: ${C.reset}Sin conexión`);
  }

  // --- PANEL DISCO Y BATERÍA (Medio Derecha - Auto-Ajustable) ---
  const battery = getBattery();
  const disk = getDiskInfo();
  
  if (battery) {
    drawBox(halfW + 1, midY, rightW, Math.floor(midHeight/2) + 1, 'BATTERY', C.green);
    const bpct = battery.percentage || 0;
    writeAt(halfW + 3, midY + 1, `[${bar(bpct, rightW - 14)}] ${C.bold}${String(bpct).padStart(3)}%${C.reset}`);
    writeAt(halfW + 3, midY + 2, `${C.gray}STATUS:${C.reset} ${battery.status} ${battery.plugged ? '⚡' : ''}`);
    if (battery.temp) writeAt(halfW + 3, midY + 3, `${C.gray}TEMP:${C.reset} ${battery.temp}°C`);
  }

  // Si no hay batería (servidor VPS), el bloque de Almacenamiento ocupa todo el espacio medio derecho
  const diskY = battery ? midY + Math.floor(midHeight/2) + 1 : midY;
  const diskH = battery ? midHeight - Math.floor(midHeight/2) - 1 : midHeight;
  drawBox(halfW + 1, diskY, rightW, diskH, 'STORAGE', C.yellow);
  if (disk) {
    writeAt(halfW + 3, diskY + 1, `[${bar(disk.pct, rightW - 14)}] ${C.bold}${String(disk.pct).padStart(3)}%${C.reset}`);
    writeAt(halfW + 3, diskY + 2, `${C.yellow}■${C.reset} USED: ${disk.used} / ${disk.total} (${disk.mount})`);
    writeAt(halfW + 3, diskY + 3, `${C.green}■${C.reset} FREE: ${disk.avail}`);
  } else {
    writeAt(halfW + 3, diskY + 2, C.gray + ' No se detectó almacenamiento disponible' + C.reset);
  }

  // --- PANEL PROCESOS (Abajo) ---
  const botY = midY + midHeight;
  const botHeight = rows - botY - 2; 
  drawBox(1, botY, cols, botHeight, `TOP PROCESSES (Total: ${getProcessCount()})`, C.red);
  
  const procs = getTopProcesses(botHeight - 3);
  writeAt(3, botY + 1, C.bold + pad('PID', 8) + pad('USER', 12) + pad('CPU%', 8) + pad('MEM%', 8) + 'COMMAND' + C.reset);
  
  if (procs.length > 0) {
    procs.forEach((p, i) => {
      if (i >= botHeight - 3) return;
      const ccolor = p.cpu > 10 ? C.red : p.cpu > 3 ? C.yellow : C.green;
      const line = pad(p.pid, 8) + C.gray + pad(p.user, 12) + C.reset + ccolor + pad(p.cpu.toFixed(1)+'%', 8) + C.reset + C.cyan + pad(p.mem.toFixed(1)+'%', 8) + C.reset + p.name;
      writeAt(3, botY + 2 + i, line.substring(0, cols - 6));
    });
  } else {
    writeAt(3, botY + 3, C.gray + ' [No se pudieron obtener procesos en el entorno actual]' + C.reset);
  }

  // Footer Informativo
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

    // Ordenamiento semántico: Carpetas primero, luego orden alfabético
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
  
  resetCursor();

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
  
  // Cabecera de listado
  writeAt(3, listY + 1, C.dim + pad('NAME', Math.floor(cols * 0.5)) + pad('SIZE', 15) + pad('MODIFIED', 20) + C.reset);

  // Ajuste de scroll
  if (state.selectedIndex >= state.scrollOffset + listHeight - 3) {
    state.scrollOffset = state.selectedIndex - listHeight + 4;
  } else if (state.selectedIndex < state.scrollOffset) {
    state.scrollOffset = state.selectedIndex;
  }

  // Renderizado dinámico de archivos
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
      writeAt(2, yPos, C.bgGray + C.black + icon.trim() + ' ' + pad(file.name, Math.floor(cols*0.5)-3) + pad(sizeStr, 15) + pad(dateStr, 20).substring(0, cols - Math.floor(cols*0.5) - 15 - 4) + C.reset);
    } else {
      writeAt(3, yPos, lineStr.substring(0, cols + 30));
    }
  });

  // Consola de salida integrada inferior
  const infoY = listY + listHeight;
  drawBox(1, infoY, cols, 4, 'OUTPUT / INFO', C.green);
  const outLines = state.cmdOutput.split('\n');
  writeAt(3, infoY + 1, C.dim + (outLines[0] || 'Listo.').substring(0, cols - 6) + C.reset);
  if (outLines.length > 1) {
    writeAt(3, infoY + 2, C.dim + outLines[1].substring(0, cols - 6) + C.reset);
  } else {
    writeAt(3, infoY + 2, '');
  }

  // Footer
  writeAt(1, rows, `${C.bgGray}${C.black} [↑/↓] Navigate  |  [Enter] Open/Enter  |  [D] Dashboard  |  [C] Command  |  [Q] Quit ${C.reset}`);
}

// ==========================================
// RENDERIZADO MODO COMANDO
// ==========================================
function renderCommand() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  
  resetCursor();
  drawBox(1, rows - 5, cols, 5, 'EXECUTE COMMAND (in ' + state.currentPath + ')', C.red);
  writeAt(3, rows - 3, C.bold + C.green + '❯ ' + C.reset + state.cmdInput);
  writeAt(1, rows, `${C.bgGray}${C.black} Type command and press Enter. [Esc] to cancel. ${C.reset}`);
  
  showCursor();
  moveCursor(5 + state.cmdInput.length, rows - 3);
}

function executeCommand(cmd) {
  if (!cmd.trim()) return;
  try {
    const result = execSync(cmd, { cwd: state.currentPath, encoding: 'utf8', stdio: 'pipe' });
    state.cmdOutput = result.trim() || 'Comando ejecutado con éxito (Sin salida).';
  } catch (err) {
    state.cmdOutput = err.stderr ? err.stderr.trim() : err.message;
  }
}

// ==========================================
// MOTOR PRINCIPAL Y BUCLE DE RENDER
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

// Configurar lectura sin procesar de la consola para captura directa
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  // Manejo de salida forzada Ctrl + C
  if (key.ctrl && key.name === 'c') {
    clearScreen();
    showCursor();
    process.exit();
  }

  // Comportamiento del teclado en Modo Consola Directa
  if (state.mode === 'COMMAND') {
    if (key.name === 'escape') {
      state.mode = 'EXPLORER';
      state.cmdInput = '';
      clearScreen();
      render();
    } else if (key.name === 'return') {
      state.mode = 'EXPLORER';
      executeCommand(state.cmdInput);
      state.cmdInput = '';
      loadDirectory(); 
      clearScreen();
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

  // Controles del sistema
  if (key.name === 'q') {
    clearScreen();
    showCursor();
    process.exit();
  } else if (key.name === 'e' || key.name === 'E') {
    state.mode = 'EXPLORER';
    loadDirectory();
    clearScreen(); // Limpia la interfaz para evitar mezclas con el Dashboard
    render();
  } else if (key.name === 'd' || key.name === 'D') {
    state.mode = 'DASHBOARD';
    clearScreen();
    render();
  } else if (key.name === 'c' || key.name === 'C') {
    state.mode = 'COMMAND';
    clearScreen();
    render();
  }

  // Navegación dentro del Explorador de Archivos
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
        const filePath = path.join(state.currentPath, selected.name);
        try {
          // Intenta previsualizar el archivo
          const content = fs.readFileSync(filePath, 'utf8');
          state.cmdOutput = `[VISTA PREVIA] ${selected.name}:\n${content.substring(0, 150).replace(/\n/g, ' ')}...`;
        } catch(e) {
          state.cmdOutput = `Archivo binario o ilegible. Tamaño: ${formatBytes(selected.size)}`;
        }
        render();
      }
    }
  }
});

// Manejo de cambio de tamaño de pantalla en caliente
process.stdout.on('resize', () => {
  clearScreen();
  render();
});

// Inicialización de la aplicación
clearScreen();
loadDirectory();
render();

// Intervalo de actualización del Dashboard en tiempo real (Cero parpadeo)
setInterval(() => {
  if (state.mode === 'DASHBOARD') {
    render();
  }
}, 2000);
