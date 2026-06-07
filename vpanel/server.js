const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { execSync, spawn, exec } = require('child_process');
const os = require('os');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const CONFIG_FILE = path.join(__dirname, 'config.json');
const SERVERS_FILE = path.join(__dirname, 'servers.json');
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'vpanel-secret-' + Math.random(),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 86400000 }
}));

const upload = multer({ dest: path.join(__dirname, 'tmp') });

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function getServers() {
  if (!fs.existsSync(SERVERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}

function saveServers(data) {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(data, null, 2));
}

const serverProcesses = {};

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'No autenticado' });
}

app.get('/', (req, res) => {
  const config = getConfig();
  if (!config) {
    return res.sendFile(path.join(__dirname, 'public', 'setup.html'));
  }
  if (!req.session.authenticated) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post('/api/setup', async (req, res) => {
  const config = getConfig();
  if (config) return res.status(400).json({ error: 'Panel ya configurado' });
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Contraseña muy corta (mín 6 caracteres)' });
  const hash = await bcrypt.hash(password, 12);
  saveConfig({ passwordHash: hash, createdAt: new Date().toISOString() });
  req.session.authenticated = true;
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const config = getConfig();
  if (!config) return res.status(400).json({ error: 'Panel no configurado' });
  const { password } = req.body;
  const match = await bcrypt.compare(password, config.passwordHash);
  if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });
  req.session.authenticated = true;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();
  const load = os.loadavg();

  let diskInfo = { total: 0, used: 0, free: 0 };
  try {
    const df = execSync("df -k / | tail -1").toString().trim().split(/\s+/);
    diskInfo = { total: parseInt(df[1]) * 1024, used: parseInt(df[2]) * 1024, free: parseInt(df[3]) * 1024 };
  } catch(e) {}

  let netStats = {};
  try {
    const netData = execSync("cat /proc/net/dev 2>/dev/null | grep -v lo | tail -n +3").toString().trim();
    netData.split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts[0]) {
        const iface = parts[0].replace(':', '');
        netStats[iface] = { rx: parseInt(parts[1]), tx: parseInt(parts[9]) };
      }
    });
  } catch(e) {}

  res.json({
    cpu: { cores: cpus.length, model: cpus[0]?.model || 'Unknown', load },
    memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
    disk: diskInfo,
    uptime,
    platform: os.platform(),
    hostname: os.hostname(),
    network: netStats
  });
});

app.get('/api/servers', requireAuth, (req, res) => {
  res.json(getServers());
});

app.post('/api/servers', requireAuth, (req, res) => {
  const { name, repoUrl, gitToken, startCmd, workDir } = req.body;
  if (!name || !repoUrl) return res.status(400).json({ error: 'Nombre y URL requeridos' });
  const servers = getServers();
  const id = 'srv_' + Date.now();
  const newServer = { id, name, repoUrl, gitToken: gitToken || '', startCmd: startCmd || 'npm start', workDir: workDir || path.join(__dirname, 'servers', id), status: 'stopped', createdAt: new Date().toISOString() };
  servers.push(newServer);
  saveServers(servers);
  res.json(newServer);
});

app.delete('/api/servers/:id', requireAuth, (req, res) => {
  let servers = getServers();
  const srv = servers.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Servidor no encontrado' });
  if (serverProcesses[req.params.id]) {
    try { serverProcesses[req.params.id].kill('SIGTERM'); } catch(e) {}
    delete serverProcesses[req.params.id];
  }
  servers = servers.filter(s => s.id !== req.params.id);
  saveServers(servers);
  res.json({ ok: true });
});

app.post('/api/servers/:id/install', requireAuth, async (req, res) => {
  const servers = getServers();
  const srv = servers.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Servidor no encontrado' });

  res.json({ ok: true, message: 'Instalación iniciada' });

  const workDir = srv.workDir;
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  const emit = (msg, type = 'log') => io.emit('server-log', { id: srv.id, msg, type });

  emit('🚀 Iniciando instalación...', 'info');

  let repoUrl = srv.repoUrl;
  if (srv.gitToken && !repoUrl.includes('@')) {
    repoUrl = repoUrl.replace('https://', `https://${srv.gitToken}@`);
  }

  try {
    emit('📦 Clonando repositorio...', 'info');
    execSync(`git clone "${repoUrl}" "${workDir}" 2>&1`, { stdio: 'pipe' });
    emit('✅ Repositorio clonado', 'success');

    if (fs.existsSync(path.join(workDir, 'package.json'))) {
      emit('📥 Instalando dependencias npm...', 'info');
      execSync(`cd "${workDir}" && npm install 2>&1`, { stdio: 'pipe' });
      emit('✅ Dependencias instaladas', 'success');
    }

    if (fs.existsSync(path.join(workDir, 'requirements.txt'))) {
      emit('📥 Instalando dependencias pip...', 'info');
      execSync(`cd "${workDir}" && pip install -r requirements.txt 2>&1`, { stdio: 'pipe' });
      emit('✅ Dependencias Python instaladas', 'success');
    }

    const srv2 = servers.find(s => s.id === req.params.id);
    if (srv2) { srv2.status = 'stopped'; srv2.installed = true; saveServers(servers); }
    emit('🎉 Instalación completada', 'success');
    io.emit('server-status', { id: srv.id, status: 'stopped', installed: true });
  } catch(e) {
    emit('❌ Error: ' + e.message, 'error');
    io.emit('server-status', { id: srv.id, status: 'error' });
  }
});

app.post('/api/servers/:id/start', requireAuth, (req, res) => {
  const servers = getServers();
  const srv = servers.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'No encontrado' });
  if (serverProcesses[srv.id]) return res.status(400).json({ error: 'Ya está corriendo' });

  const workDir = srv.workDir;
  if (!fs.existsSync(workDir)) return res.status(400).json({ error: 'No instalado' });

  const emit = (msg, type = 'log') => io.emit('server-log', { id: srv.id, msg, type });

  const [cmd, ...args] = (srv.startCmd || 'npm start').split(' ');
  const proc = spawn(cmd, args, { cwd: workDir, shell: true });

  serverProcesses[srv.id] = proc;
  srv.status = 'running'; srv.pid = proc.pid;
  saveServers(servers);
  io.emit('server-status', { id: srv.id, status: 'running', pid: proc.pid });

  proc.stdout.on('data', d => emit(d.toString().trim()));
  proc.stderr.on('data', d => emit(d.toString().trim(), 'error'));
  proc.on('close', code => {
    delete serverProcesses[srv.id];
    const s2 = getServers();
    const sv = s2.find(s => s.id === srv.id);
    if (sv) { sv.status = 'stopped'; sv.pid = null; saveServers(s2); }
    io.emit('server-status', { id: srv.id, status: 'stopped' });
    emit(`Proceso terminado con código ${code}`, 'info');
  });

  res.json({ ok: true, pid: proc.pid });
});

app.post('/api/servers/:id/stop', requireAuth, (req, res) => {
  const proc = serverProcesses[req.params.id];
  if (!proc) return res.status(400).json({ error: 'No está corriendo' });
  proc.kill('SIGTERM');
  delete serverProcesses[req.params.id];
  const servers = getServers();
  const srv = servers.find(s => s.id === req.params.id);
  if (srv) { srv.status = 'stopped'; srv.pid = null; saveServers(servers); }
  io.emit('server-status', { id: req.params.id, status: 'stopped' });
  res.json({ ok: true });
});

app.post('/api/servers/:id/restart', requireAuth, (req, res) => {
  const proc = serverProcesses[req.params.id];
  if (proc) { proc.kill('SIGTERM'); delete serverProcesses[req.params.id]; }
  setTimeout(() => {
    const fakereq = { params: req.params, session: req.session };
    const fakeres = { json: () => {}, status: () => ({ json: () => {} }) };
  }, 1000);
  res.json({ ok: true, message: 'Reiniciando...' });
});

app.get('/api/files', requireAuth, (req, res) => {
  const { dir } = req.query;
  const safeDir = dir || os.homedir();
  try {
    const items = fs.readdirSync(safeDir).map(name => {
      const full = path.join(safeDir, name);
      let stat;
      try { stat = fs.statSync(full); } catch(e) { return null; }
      return { name, path: full, isDir: stat.isDirectory(), size: stat.size, mtime: stat.mtime };
    }).filter(Boolean);
    res.json({ path: safeDir, items, parent: path.dirname(safeDir) });
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/files/read', requireAuth, (req, res) => {
  const { file } = req.query;
  try {
    const content = fs.readFileSync(file, 'utf8');
    res.json({ content });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/files/write', requireAuth, (req, res) => {
  const { file, content } = req.body;
  try {
    fs.writeFileSync(file, content, 'utf8');
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/files/rename', requireAuth, (req, res) => {
  const { oldPath, newName } = req.body;
  const newPath = path.join(path.dirname(oldPath), newName);
  try {
    fs.renameSync(oldPath, newPath);
    res.json({ ok: true, newPath });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/files/delete', requireAuth, (req, res) => {
  const { filePath } = req.body;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) fs.rmdirSync(filePath, { recursive: true });
    else fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/files/mkdir', requireAuth, (req, res) => {
  const { dirPath } = req.body;
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/files/create', requireAuth, (req, res) => {
  const { filePath } = req.body;
  try {
    fs.writeFileSync(filePath, '', 'utf8');
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

io.on('connection', (socket) => {
  socket.on('terminal-input', (data) => {
    exec(data.cmd, { cwd: data.cwd || os.homedir() }, (err, stdout, stderr) => {
      socket.emit('terminal-output', { output: stdout || stderr || (err ? err.message : ''), cwd: data.cwd });
    });
  });
});

server.listen(PORT, () => {
  console.log(`VPanel corriendo en http://0.0.0.0:${PORT}`);
});
