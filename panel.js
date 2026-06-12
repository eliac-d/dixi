const os = require('os');
const { execSync } = require('child_process');

let lastCpuTimes = [];
try { lastCpuTimes = os.cpus().map(c => c.times); } catch(e) {}

function safeCpus() { try { return os.cpus()||[]; } catch(e) { return []; } }

function bar(percent, width) {
  width = width || 20;
  percent = Math.max(0, Math.min(100, percent||0));
  const filled = Math.floor((percent/100)*width);
  const color = percent>85 ? '\x1b[31m' : percent>60 ? '\x1b[33m' : '\x1b[32m';
  return color+'#'.repeat(filled)+'\x1b[90m'+'-'.repeat(width-filled)+'\x1b[0m';
}

function formatBytes(b) {
  if (!b||b<0) return '0 B';
  if (b<1024) return b+' B';
  if (b<1024*1024) return (b/1024).toFixed(1)+' KB';
  if (b<1024*1024*1024) return (b/1024/1024).toFixed(1)+' MB';
  return (b/1024/1024/1024).toFixed(2)+' GB';
}

function formatUptime(s) {
  s = s||0;
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60);
  if (d>0) return d+'d '+h+'h '+m+'m';
  if (h>0) return h+'h '+m+'m';
  return m+'m';
}

function getCpuUsage() {
  try {
    const cpus = safeCpus();
    if (!cpus.length || !lastCpuTimes.length || cpus.length!==lastCpuTimes.length) {
      lastCpuTimes = cpus.map(c=>c.times);
      return 0;
    }
    const cur = cpus.map(c=>c.times);
    let idleDiff=0, totalDiff=0;
    for (let i=0;i<cur.length;i++) {
      for (const t in cur[i]) totalDiff += (cur[i][t]||0)-(lastCpuTimes[i][t]||0);
      idleDiff += (cur[i].idle||0)-(lastCpuTimes[i].idle||0);
    }
    lastCpuTimes = cur;
    if (totalDiff===0) return 0;
    return Math.max(0,Math.min(100,100-Math.floor((100*idleDiff)/totalDiff)));
  } catch(e) { return 0; }
}

function safeExec(cmd, t) {
  try { return execSync(cmd,{timeout:t||1500,encoding:'utf8'}); } catch(e) { return ''; }
}

function getBattery() {
  const out = safeExec('termux-battery-status 2>/dev/null', 1500);
  if (out.trim()) {
    try {
      const j = JSON.parse(out);
      return j.percentage+'% ('+j.status+')';
    } catch(e) {}
  }
  const cap = safeExec('cat /sys/class/power_supply/battery/capacity 2>/dev/null',800);
  return cap.trim() ? cap.trim()+'%' : 'N/A';
}

function getIP() {
  try {
    const ifaces = os.networkInterfaces()||{};
    for (const name in ifaces) {
      const f = (ifaces[name]||[]).find(i=>!i.internal && i.family==='IPv4');
      if (f) return name+': '+f.address;
    }
  } catch(e) {}
  return 'Sin conexion';
}

function render() {
  const cpu = getCpuUsage();
  const total = os.totalmem(), free = os.freemem(), used = total-free;
  const memPct = total>0 ? Math.floor((used/total)*100) : 0;
  const cpus = safeCpus();
  const time = new Date().toLocaleTimeString();
  const bat = getBattery();
  const ip = getIP();

  console.clear();
  console.log('\x1b[1;36m================= DIXI PANEL ================\x1b[0m');
  console.log(' \x1b[1mHora:\x1b[0m '+time+'   \x1b[1mBateria:\x1b[0m '+bat);
  console.log('');
  console.log(' \x1b[1mCPU\x1b[0m  ['+bar(cpu)+'] '+String(cpu).padStart(3)+'%   ('+cpus.length+' cores)');
  console.log(' \x1b[1mRAM\x1b[0m  ['+bar(memPct)+'] '+String(memPct).padStart(3)+'%   '+formatBytes(used)+' / '+formatBytes(total));
  console.log('');
  console.log(' \x1b[1mUptime:\x1b[0m '+formatUptime(os.uptime())+'   \x1b[1mRed:\x1b[0m '+ip);
  console.log('\x1b[1;36m==============================================\x1b[0m');
}

render();
setInterval(render, 2000);
