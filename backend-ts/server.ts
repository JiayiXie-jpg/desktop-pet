import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import multer from 'multer';
import { SERVER_HOST, SERVER_PORT, ASSETS_DIR, PET_STATES, DETECTION_INTERVAL, ADMIN_SECRET, PETS_BASE_DIR, VOLC_BASE_URL, VISION_MODEL, getHeaders } from './config';
import { generatePetAssets } from './generator/pipeline';
import { detectPetState } from './detector/detect_state';
import {
  getCodes, saveCodes, generateCode,
  getPets, savePets, generatePetId, ensurePetDir, getPetDir,
  getLikes, saveLikes,
  getReminders, saveReminders,
  getUsers, saveUsers, generateUserId,
  type PetRecord, type CodeRecord, type LikeRecord, type Reminder, type UserRecord,
  getDiyTasks, saveDiyTasks, generateTaskId,
  type DiyTask,
} from './data/store';
import crypto from 'crypto';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ---- Auth: Sessions ----
const sessions = new Map<string, { userId: string; expiresAt: number }>();

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function createSession(userId: string): string {
  const token = generateToken();
  sessions.set(token, { userId, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  return token;
}

function getSessionUser(req: express.Request): UserRecord | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(token);
    return null;
  }
  const users = getUsers();
  return users[session.userId] || null;
}

// ---- Auth: Migration (run once on startup) ----
function migrateExistingPets() {
  const pets = getPets();
  const users = getUsers();
  const existingUsernames = new Set(Object.values(users).map(u => u.username.toLowerCase()));
  let migrated = 0;

  for (const [petId, pet] of Object.entries(pets)) {
    if (pet.ownerId) continue; // already migrated
    if (pet.status !== 'ready') continue;

    let username = pet.name;
    // Handle duplicate usernames
    if (existingUsernames.has(username.toLowerCase())) {
      let suffix = 2;
      while (existingUsernames.has((username + '_' + suffix).toLowerCase())) suffix++;
      username = username + '_' + suffix;
    }

    const userId = generateUserId();
    users[userId] = {
      id: userId,
      username,
      password: pet.code,
      petIds: [petId],
      createdAt: pet.createdAt,
      migratedFrom: petId,
    };
    pet.ownerId = userId;
    existingUsernames.add(username.toLowerCase());
    migrated++;
  }

  if (migrated > 0) {
    saveUsers(users);
    savePets(pets);
    console.log('[Migration] Migrated ' + migrated + ' existing pets to user accounts');
  }
}


// --- TTS ---
const TTS_DIR = path.join(ASSETS_DIR, 'tts');
if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });

// Voice clone speaker IDs: petId -> cloned voice speaker ID
const VOICE_CLONE_MAP: Record<string, string> = {
  '7iwnvs7e': 'S_hjqRy6eX1',  // 乔瑟夫·乔斯达
  'zafkhxri': 'S_gjqRy6eX1',  // 莎莎
  'gnswzv7p': 'S_ejqRy6eX1',  // 楚钦
};
const VOICE_CLONE_API_KEY = 'c66bccbc-a03a-4857-8c41-989f010a4e55';

// Voice clone TTS via V1 API (for cloned voices)
async function textToSpeechClone(text: string, speakerId: string): Promise<string | null> {
  try {
    const reqid = `clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resp = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': VOICE_CLONE_API_KEY,
      },
      body: JSON.stringify({
        app: { cluster: 'volcano_icl' },
        user: { uid: 'desktop_pet' },
        audio: { voice_type: speakerId, encoding: 'mp3', speed_ratio: 1.0 },
        request: { reqid, text, operation: 'query' },
      }),
    });
    if (!resp.ok) { console.error('[TTS-Clone] HTTP error:', resp.status); return null; }
    const data = await resp.json() as any;
    if (data.code !== 3000 || !data.data) {
      console.error('[TTS-Clone] Error:', data.code, data.message);
      return null;
    }
    const audio = Buffer.from(data.data, 'base64');
    const filename = `tts_${Date.now()}.mp3`;
    fs.writeFileSync(path.join(TTS_DIR, filename), audio);
    console.log(`[TTS-Clone] ${speakerId} -> ${audio.length} bytes -> ${filename}`);
    const files = fs.readdirSync(TTS_DIR).filter(f => f.endsWith('.mp3')).sort();
    while (files.length > 50) { fs.unlinkSync(path.join(TTS_DIR, files.shift()!)); }
    return `/api/tts/${filename}`;
  } catch (err) {
    console.error('[TTS-Clone] Error:', err);
    return null;
  }
}

async function textToSpeech(text: string, petId?: string): Promise<string | null> {
  // Use cloned voice if available for this pet
  if (petId && VOICE_CLONE_MAP[petId]) {
    return textToSpeechClone(text, VOICE_CLONE_MAP[petId]);
  }
  try {
    const resp = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Access-Key': 'OX_VMqDAcF-6AHPyOsB5CpchCM_cSfQA',
        'X-Api-App-Key': '4380630105',
        'X-Api-Resource-Id': 'seed-tts-2.0',
      },
      body: JSON.stringify({
        user: { uid: 'desktop_pet' },
        req_params: {
          text,
          speaker: 'zh_female_xiaohe_uranus_bigtts',
          audio_params: { format: 'mp3', sample_rate: 24000 },
        },
      }),
    });
    if (!resp.ok) { console.error('[TTS] HTTP error:', resp.status); return null; }
    const body = await resp.text();
    const lines = body.split('\n').filter(l => l.trim());
    const audioParts: Buffer[] = [];
    for (const line of lines) {
      try {
        const chunk = JSON.parse(line);
        if (chunk.data) audioParts.push(Buffer.from(chunk.data, 'base64'));
      } catch {}
    }
    if (audioParts.length === 0) { console.error('[TTS] No audio data in response'); return null; }
    const audio = Buffer.concat(audioParts);
    const filename = `tts_${Date.now()}.mp3`;
    fs.writeFileSync(path.join(TTS_DIR, filename), audio);
    console.log(`[TTS] Generated ${audio.length} bytes -> ${filename}`);
    // Clean up old files (keep last 50)
    const files = fs.readdirSync(TTS_DIR).filter(f => f.endsWith('.mp3')).sort();
    while (files.length > 50) { fs.unlinkSync(path.join(TTS_DIR, files.shift()!)); }
    return `/api/tts/${filename}`;
  } catch (err) {
    console.error('[TTS] Error:', err);
    return null;
  }
}

// CORS
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

app.use(express.json());
app.use('/api/tts', express.static(TTS_DIR));

// ---- Traffic stats ----
interface DayStats {
  date: string;
  requests: number;
  bytesOut: number;
  uniqueIPs: Set<string>;
  electronIPs: Set<string>;
  browserIPs: Set<string>;
  paths: Record<string, number>;
}

const statsHistory: DayStats[] = [];
const STATS_FILE = path.join(ASSETS_DIR, '..', 'data', 'traffic_stats.json');

// Persist stats to disk
function saveStats() {
  try {
    const serializable = statsHistory.map(s => ({
      date: s.date,
      requests: s.requests,
      bytesOut: s.bytesOut,
      uniqueIPs: [...s.uniqueIPs],
      electronIPs: [...s.electronIPs],
      browserIPs: [...s.browserIPs],
      paths: s.paths,
    }));
    fs.writeFileSync(STATS_FILE, JSON.stringify(serializable, null, 2));
  } catch (err) {
    console.error('[Stats] Failed to save:', err);
  }
}

// Load stats from disk on startup
function loadStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    for (const s of raw) {
      statsHistory.push({
        date: s.date,
        requests: s.requests || 0,
        bytesOut: s.bytesOut || 0,
        uniqueIPs: new Set(s.uniqueIPs || []),
        electronIPs: new Set(s.electronIPs || []),
        browserIPs: new Set(s.browserIPs || []),
        paths: s.paths || {},
      });
    }
    console.log('[Stats] Loaded', statsHistory.length, 'days from disk');
  } catch (err) {
    console.error('[Stats] Failed to load:', err);
  }
}

loadStats();

// Auto-save every 60 seconds
setInterval(saveStats, 60_000);

// Save stats on process exit
process.on('SIGINT', () => { saveStats(); process.exit(0); });
process.on('SIGTERM', () => { saveStats(); process.exit(0); });

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTodayStats(): DayStats {
  const today = getToday();
  let s = statsHistory.find(d => d.date === today);
  if (!s) {
    s = { date: today, requests: 0, bytesOut: 0, uniqueIPs: new Set(), electronIPs: new Set(), browserIPs: new Set(), paths: {} };
    statsHistory.push(s);
    // Keep only 30 days
    while (statsHistory.length > 30) statsHistory.shift();
  }
  return s;
}

// Track request stats
app.use((req, res, next) => {
  const stats = getTodayStats();
  stats.requests++;
  const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
  if (ip) stats.uniqueIPs.add(ip);
  // Simplify path for grouping
  const p = req.path.replace(/\/[a-z0-9]{8}\//g, '/:id/').replace(/\/(sitting|sleeping|eating|moving)\./g, '/:state.');
  stats.paths[p] = (stats.paths[p] || 0) + 1;

  // Track response bytes
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  res.write = function(chunk: any, ...args: any[]) {
    if (chunk) stats.bytesOut += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    return origWrite(chunk, ...args);
  } as any;
  const originalEnd = res.end;
  res.end = function(chunk?: any, ...args: any[]) {
    if (chunk) stats.bytesOut += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    return originalEnd.call(res, chunk, ...args);
  } as any;

  next();
});

// Client type heartbeat — frontend calls this on load
app.post('/api/heartbeat', (req, res) => {
  const stats = getTodayStats();
  const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
  const client = req.body?.client; // 'electron' or 'browser'
  if (ip) {
    if (client === 'electron') stats.electronIPs.add(ip);
    else stats.browserIPs.add(ip);
  }
  res.json({ ok: true });
});

// Dynamic multer storage — per-pet upload directory
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const petId = req.params.petId;
    const uploadDir = path.join(PETS_BASE_DIR, petId, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

// ---- Per-pet in-memory state ----

interface GenerationState {
  status: 'idle' | 'generating' | 'ready' | 'error';
  stage: string;
  progress: number;
  message: string;
  manifest: Record<string, any> | null;
}

interface PetInstance {
  id: string;
  generationState: GenerationState;
  currentPetState: string;
  mockTimer: ReturnType<typeof setInterval> | null;
  wsConnections: Set<WebSocket>;
}

const petInstances = new Map<string, PetInstance>();

function getPetInstance(petId: string): PetInstance | null {
  if (petInstances.has(petId)) return petInstances.get(petId)!;
  // Check if pet exists on disk
  const pets = getPets();
  if (!pets[petId]) return null;
  // Hydrate from disk
  const inst: PetInstance = {
    id: petId,
    generationState: {
      status: 'idle',
      stage: '',
      progress: 0,
      message: '',
      manifest: null,
    },
    currentPetState: 'sitting',
    mockTimer: null,
    wsConnections: new Set(),
  };
  // Check if manifest exists → mark as ready
  const manifestPath = path.join(PETS_BASE_DIR, petId, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    inst.generationState.status = 'ready';
    inst.generationState.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
  petInstances.set(petId, inst);
  return inst;
}

function broadcastToPet(petId: string, message: Record<string, any>) {
  const inst = petInstances.get(petId);
  if (!inst) return;
  const data = JSON.stringify(message);
  for (const ws of inst.wsConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// ---- WebSocket ----

// Map ws -> petId for cleanup
const wsSubscriptions = new Map<WebSocket, string>();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe' && msg.petId) {
        // Unsubscribe from previous pet
        const prevPetId = wsSubscriptions.get(ws);
        if (prevPetId) {
          petInstances.get(prevPetId)?.wsConnections.delete(ws);
        }
        // Subscribe to new pet
        const inst = getPetInstance(msg.petId);
        if (inst) {
          inst.wsConnections.add(ws);
          wsSubscriptions.set(ws, msg.petId);
          // Send current state
          ws.send(JSON.stringify({ type: 'status', ...inst.generationState }));
          // Start reminder scheduler for this pet
          scheduleReminders(msg.petId);
        }
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else if (msg.type === 'rps_choice' && msg.matchId && msg.choice) {
        const match = rpsMatches.get(msg.matchId);
        if (match) {
          if (match.p1.ws === ws) match.p1.choice = msg.choice;
          else if (match.p2.ws === ws) match.p2.choice = msg.choice;
          // If both chose, evaluate immediately
          if (match.p1.choice && match.p2.choice) rpsEvaluateRound(match);
        }
      }
    } catch {}
  });

  ws.on('close', () => {
    const petId = wsSubscriptions.get(ws);
    if (petId) {
      petInstances.get(petId)?.wsConnections.delete(ws);
      wsSubscriptions.delete(ws);
    }
  });
});

// ---- Admin: Stats Dashboard ----

app.get('/api/admin/stats', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const data = statsHistory.map(s => ({
    date: s.date,
    requests: s.requests,
    bytesOut: s.bytesOut,
    uniqueVisitors: s.uniqueIPs.size,
    topPaths: Object.entries(s.paths).sort((a, b) => b[1] - a[1]).slice(0, 20),
  }));
  res.json(data);
});

app.get('/admin/dashboard', (req, res) => {
  const secret = req.query.key;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).send('Unauthorized. Use ?key=YOUR_ADMIN_SECRET');
  }

  const formatBytes = (b: number) => {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const today = getTodayStats();
  const rows = [...statsHistory].reverse().map(s => `
    <tr style="${s.date === getToday() ? 'background:#1a3a2a;' : ''}">
      <td>${s.date}</td>
      <td>${s.requests.toLocaleString()}</td>
      <td>${formatBytes(s.bytesOut)}</td>
      <td>${s.uniqueIPs.size}</td>
      <td>${s.electronIPs.size}</td>
      <td>${s.browserIPs.size}</td>
    </tr>
  `).join('');

  const topPaths = Object.entries(today.paths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([p, n]) => `<tr><td>${p}</td><td>${n}</td></tr>`)
    .join('');

  // Active WebSocket connections
  let wsCount = 0;
  wss.clients.forEach(() => wsCount++);

  // Pet stats
  const pets = getPets();
  const petCount = Object.keys(pets).length;
  const readyCount = Object.values(pets).filter(p => p.status === 'ready').length;

  const codes = getCodes();
  const totalCodes = Object.keys(codes).length;
  const usedCodes = Object.values(codes).filter(c => c.usedBy).length;

  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>桌面陪伴 - 管理后台</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px}
  h1{font-size:22px;margin-bottom:16px;color:#58a6ff}
  h2{font-size:16px;margin:20px 0 10px;color:#8b949e}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px 20px;min-width:140px}
  .card .num{font-size:28px;font-weight:700;color:#58a6ff}
  .card .label{font-size:12px;color:#8b949e;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #21262d}
  th{color:#8b949e;font-weight:500}
  tr:hover{background:#161b22}
  .refresh{color:#58a6ff;font-size:12px;cursor:pointer;text-decoration:underline}
  .tab-btn{padding:6px 14px;border-radius:8px;border:1px solid #30363d;background:#161b22;color:#c9d1d9;cursor:pointer;font-size:13px}
  .tab-btn.active{background:#1f6feb;color:#fff;border-color:#1f6feb}
  .abtn{padding:4px 10px;border-radius:6px;border:none;background:#238636;color:#fff;cursor:pointer;font-size:11px}
  .abtn.del{background:#da3633}
  .ed{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:2px 6px;border-radius:4px;font-size:12px}
  input{font-size:12px}
</style>
</head><body>
<h1>桌面陪伴 - 管理后台</h1>
<div style="display:flex;gap:8px;margin-bottom:16px">
  <button class="tab-btn active" onclick="showTab('stats')">📊 统计</button>
  <button class="tab-btn" onclick="showTab('users')">👤 用户管理</button>
  <button class="tab-btn" onclick="showTab('codes')">🔑 兑换码</button>
</div>
<div id="tab-stats"><div class="cards">
  <div class="card"><div class="num">${today.requests.toLocaleString()}</div><div class="label">今日请求</div></div>
  <div class="card"><div class="num">${formatBytes(today.bytesOut)}</div><div class="label">今日流量</div></div>
  <div class="card"><div class="num">${today.uniqueIPs.size}</div><div class="label">今日访客 (UV)</div></div>
  <div class="card"><div class="num">${today.electronIPs.size}</div><div class="label">Electron 用户</div></div>
  <div class="card"><div class="num">${today.browserIPs.size}</div><div class="label">浏览器用户</div></div>
  <div class="card"><div class="num">${wsCount}</div><div class="label">WebSocket 连接</div></div>
  <div class="card"><div class="num">${readyCount}/${petCount}</div><div class="label">宠物 (就绪/总数)</div></div>
  <div class="card"><div class="num">${usedCodes}/${totalCodes}</div><div class="label">兑换码 (已用/总数)</div></div>
</div>

<h2>每日统计</h2>
<table><tr><th>日期</th><th>请求数</th><th>流量</th><th>独立访客</th><th>Electron</th><th>浏览器</th></tr>${rows}</table>

<h2>今日热门路径</h2>
<table><tr><th>路径</th><th>请求数</th></tr>${topPaths}</table>

<p style="margin-top:20px;font-size:11px;color:#484f58">自动刷新：<a class="refresh" onclick="location.reload()">刷新</a> | 数据从服务器启动时开始统计，重启会清零</p>
</div>

<div id="tab-users" style="display:none">
  <h2>用户管理 <span style="font-size:12px;color:#8b949e">(共 ${''+Object.keys(getUsers()).length} 个用户)</span></h2>
  <table id="users-table">
    <tr><th>用户名</th><th>密码</th><th>宠物</th><th>创建时间</th><th>迁移</th><th>操作</th></tr>
    ${Object.values(getUsers()).map(u => {
      const uPets = u.petIds.filter(pid => pets[pid]).map(pid => pets[pid].name).join(', ');
      return '<tr>' +
        '<td><input class="ed" id="un-' + u.id + '" value="' + u.username + '" style="width:100px"/></td>' +
        '<td><input class="ed" id="pw-' + u.id + '" value="' + u.password + '" style="width:80px"/></td>' +
        '<td>' + (uPets || '-') + '</td>' +
        '<td>' + u.createdAt.slice(0,10) + '</td>' +
        '<td>' + (u.migratedFrom ? '✅' : '-') + '</td>' +
        '<td><button class="abtn" onclick="saveUser(\'' + u.id + '\')">保存</button> <button class="abtn del" onclick="delUser(\'' + u.id + '\')">删除</button></td>' +
        '</tr>';
    }).join('')}
  </table>
</div>

<div id="tab-codes" style="display:none">
  <h2>兑换码管理 <span style="font-size:12px;color:#8b949e">(${''+usedCodes}/${''+totalCodes} 已使用)</span></h2>
  <div style="margin-bottom:12px;display:flex;gap:8px">
    <input id="gen-count" type="number" value="5" min="1" max="100" style="width:60px;padding:4px 8px;background:#161b22;border:1px solid #30363d;color:#c9d1d9;border-radius:6px"/>
    <button class="abtn" onclick="genCodes()">批量生成</button>
    <input id="single-code" placeholder="手动添加兑换码" style="padding:4px 8px;background:#161b22;border:1px solid #30363d;color:#c9d1d9;border-radius:6px;width:120px"/>
    <button class="abtn" onclick="addCode()">添加</button>
  </div>
  <div id="gen-result" style="font-size:12px;color:#4CAF50;margin-bottom:8px"></div>
  <table>
    <tr><th>兑换码</th><th>状态</th><th>关联宠物</th><th>创建时间</th><th>操作</th></tr>
    ${Object.entries(codes).sort((a,b) => b[1].createdAt.localeCompare(a[1].createdAt)).map(([code, info]) => {
      const petName = info.usedBy && pets[info.usedBy] ? pets[info.usedBy].name : '';
      return '<tr>' +
        '<td style="font-family:monospace">' + code + '</td>' +
        '<td style="color:' + (info.usedBy ? '#f85149' : '#4CAF50') + '">' + (info.usedBy ? '已使用' : '未使用') + '</td>' +
        '<td>' + (petName || '-') + '</td>' +
        '<td>' + info.createdAt.slice(0,10) + '</td>' +
        '<td>' + (info.usedBy ? '' : '<button class="abtn del" onclick="delCode(\'' + code + '\')">删除</button>') + '</td>' +
        '</tr>';
    }).join('')}
  </table>
</div>

<script>
const KEY = new URLSearchParams(location.search).get('key');
const HEADERS = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY };

function showTab(name) {
  document.querySelectorAll('[id^=tab-]').forEach(el => el.style.display = 'none');
  document.getElementById('tab-' + name).style.display = 'block';
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
}

async function saveUser(id) {
  const username = document.getElementById('un-' + id).value;
  const password = document.getElementById('pw-' + id).value;
  const r = await fetch('/api/admin/users/' + id, { method: 'PUT', headers: HEADERS, body: JSON.stringify({ username, password }) });
  const d = await r.json();
  alert(d.success ? '已保存' : (d.error || '失败'));
}

async function delUser(id) {
  if (!confirm('确定删除该用户？')) return;
  await fetch('/api/admin/users/' + id, { method: 'DELETE', headers: HEADERS });
  location.reload();
}

async function genCodes() {
  const count = parseInt(document.getElementById('gen-count').value) || 5;
  const r = await fetch('/api/admin/codes', { method: 'POST', headers: HEADERS, body: JSON.stringify({ count }) });
  const d = await r.json();
  document.getElementById('gen-result').textContent = '生成成功: ' + d.codes.join(', ');
  setTimeout(() => location.reload(), 2000);
}

async function addCode() {
  const code = document.getElementById('single-code').value.trim();
  if (!code) return;
  const r = await fetch('/api/admin/codes/single', { method: 'POST', headers: HEADERS, body: JSON.stringify({ code }) });
  const d = await r.json();
  if (d.success) { alert('添加成功: ' + d.code); location.reload(); }
  else alert(d.error || '失败');
}

async function delCode(code) {
  if (!confirm('确定删除兑换码 ' + code + '？')) return;
  await fetch('/api/admin/codes/' + code, { method: 'DELETE', headers: HEADERS });
  location.reload();
}
</script>
</body></html>`);
});

// ---- Admin: Redemption Codes ----

function requireAdmin(req: express.Request, res: express.Response): boolean {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// POST /api/admin/codes — generate N codes
app.post('/api/admin/codes', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const count = Math.min(req.body.count || 1, 100);
  const codes = getCodes();
  const newCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code: string;
    do { code = generateCode(); } while (codes[code]);
    codes[code] = { createdAt: new Date().toISOString(), usedBy: null, usedAt: null };
    newCodes.push(code);
  }
  saveCodes(codes);
  console.log(`[Admin] Generated ${count} codes: ${newCodes.join(', ')}`);
  res.json({ codes: newCodes });
});

// GET /api/admin/codes — list all codes
app.get('/api/admin/codes', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(getCodes());
});

// ---- Admin: User Management ----

app.get("/api/admin/users", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const users = getUsers();
  const pets = getPets();
  const result = Object.values(users).map(u => ({
    id: u.id,
    username: u.username,
    password: u.password,
    petIds: u.petIds,
    pets: u.petIds.filter(pid => pets[pid]).map(pid => ({ id: pid, name: pets[pid].name, status: pets[pid].status })),
    createdAt: u.createdAt,
    migratedFrom: u.migratedFrom || null,
  }));
  res.json(result);
});

app.put("/api/admin/users/:userId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const users = getUsers();
  const user = users[req.params.userId];
  if (!user) return res.status(404).json({ error: "User not found" });

  const { username, password } = req.body;
  if (username) {
    const nameLower = username.trim().toLowerCase();
    if (Object.values(users).some(u => u.id !== user.id && u.username.toLowerCase() === nameLower)) {
      return res.status(400).json({ error: "Username already exists" });
    }
    user.username = username.trim();
  }
  if (password) user.password = password.trim();
  saveUsers(users);
  res.json({ success: true });
});

app.delete("/api/admin/users/:userId", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const users = getUsers();
  if (!users[req.params.userId]) return res.status(404).json({ error: "User not found" });
  delete users[req.params.userId];
  saveUsers(users);
  res.json({ success: true });
});

app.delete("/api/admin/codes/:code", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const codes = getCodes();
  const code = req.params.code.toUpperCase();
  if (!codes[code]) return res.status(404).json({ error: "Code not found" });
  if (codes[code].usedBy) return res.status(400).json({ error: "Code already used, cannot delete" });
  delete codes[code];
  saveCodes(codes);
  res.json({ success: true });
});

app.post("/api/admin/codes/single", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { code } = req.body;
  if (!code?.trim()) return res.status(400).json({ error: "Code required" });
  const codes = getCodes();
  const upper = code.trim().toUpperCase();
  if (codes[upper]) return res.status(400).json({ error: "Code already exists" });
  codes[upper] = { createdAt: new Date().toISOString(), usedBy: null, usedAt: null };
  saveCodes(codes);
  res.json({ success: true, code: upper });
});

// ---- Auth: Register / Login / Me ----

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.trim().length < 2 || username.trim().length > 20) {
    return res.status(400).json({ error: '用户名长度2-20个字符' });
  }
  if (password.trim().length < 4) {
    return res.status(400).json({ error: '密码至少4个字符' });
  }

  const users = getUsers();
  const nameLower = username.trim().toLowerCase();
  if (Object.values(users).some(u => u.username.toLowerCase() === nameLower)) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const userId = generateUserId();
  users[userId] = {
    id: userId,
    username: username.trim(),
    password: password.trim(),
    petIds: [],
    createdAt: new Date().toISOString(),
  };
  saveUsers(users);

  const token = createSession(userId);
  console.log('[Auth] Register: ' + username.trim() + ' → ' + userId);
  res.json({ token, userId, username: username.trim(), petIds: [] });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const users = getUsers();
  const nameLower = username.trim().toLowerCase();
  const user = Object.values(users).find(u => u.username.toLowerCase() === nameLower);
  if (!user || user.password !== password.trim()) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = createSession(user.id);
  console.log('[Auth] Login: ' + user.username + ' (' + user.id + ')');
  res.json({ token, userId: user.id, username: user.username, petIds: user.petIds });
});

app.get('/api/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: '未登录' });

  const pets = getPets();
  const myPets = user.petIds
    .filter(pid => pets[pid])
    .map(pid => ({ id: pets[pid].id, name: pets[pid].name, status: pets[pid].status }));

  res.json({ userId: user.id, username: user.username, petIds: user.petIds, pets: myPets });
});

app.post('/api/me/update', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: '未登录' });

  const { username, password, oldPassword } = req.body;
  const users = getUsers();

  if (username && username.trim() !== user.username) {
    const nameLower = username.trim().toLowerCase();
    if (Object.values(users).some(u => u.id !== user.id && u.username.toLowerCase() === nameLower)) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    users[user.id].username = username.trim();
  }

  if (password) {
    if (!oldPassword || oldPassword !== user.password) {
      return res.status(400).json({ error: '旧密码错误' });
    }
    if (password.trim().length < 4) {
      return res.status(400).json({ error: '新密码至少4个字符' });
    }
    users[user.id].password = password.trim();
  }

  saveUsers(users);
  res.json({ success: true, username: users[user.id].username });
});

// ---- Redeem + Pet List ----

// POST /api/redeem — validate code, create pet instance
app.post('/api/redeem', (req, res) => {
  const { code, name } = req.body;
  if (!code) return res.status(400).json({ error: '请输入兑换码' });

  const codes = getCodes();
  const codeRecord = codes[code.toUpperCase()];
  if (!codeRecord) return res.status(400).json({ error: '兑换码无效' });
  if (codeRecord.usedBy) return res.status(400).json({ error: '兑换码已被使用' });

  // Create pet
  const petId = generatePetId();
  const pets = getPets();
  pets[petId] = {
    id: petId,
    name: name || '我的萌宠',
    code: code.toUpperCase(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  savePets(pets);

  // Mark code as used
  codeRecord.usedBy = petId;
  codeRecord.usedAt = new Date().toISOString();
  saveCodes(codes);

  // Create directory
  ensurePetDir(petId);

  console.log(`[Redeem] Code ${code.toUpperCase()} → Pet ${petId} (${name || '我的萌宠'})`);
  res.json({ petId, name: pets[petId].name });
});

// GET /api/pets — list all pets (public)
const HIDDEN_PETS = new Set(['tpa5f8zz']);

app.get('/api/pets', (req, res) => {
  const pets = getPets();
  const likes = getLikes();
  const clientId = (req.query.clientId as string) || '';
  const list = Object.values(pets).filter(p => !HIDDEN_PETS.has(p.id)).map(p => {
    // Check actual status from disk
    const manifestPath = path.join(PETS_BASE_DIR, p.id, 'manifest.json');
    const hasManifest = fs.existsSync(manifestPath);
    // Check if matted moving video exists
    const mattedMovingPath = path.join(PETS_BASE_DIR, p.id, 'matted', 'moving.webm');
    const hasMattedMoving = fs.existsSync(mattedMovingPath);
    // Likes info
    const petLikes = likes[p.id] || { count: 0, voters: [] };
    // Stats for badges
    const allStats = readStatsFile();
    const st = allStats[p.id];
    const level = st?.level || 1;
    const mood = st?.mood || 50;
    // Check online status
    let isOnline = false;
    for (const [, subPetId] of wsSubscriptions.entries()) {
      if (subPetId === p.id) { isOnline = true; break; }
    }
    // Recent activity
    const ra = recentActivity.get(p.id);
    const activity = (ra && Date.now() - ra.since < 300000) ? ra.type : null;
    return {
      id: p.id,
      name: p.name,
      status: hasManifest ? 'ready' : p.status,
      createdAt: p.createdAt,
      photoUrl: `/api/pets/${p.id}/assets/pet_photo.jpg`,
      likes: petLikes.count,
      mattedMovingUrl: hasMattedMoving ? `/api/pets/${p.id}/assets/matted/moving.webm` : null,
      level, mood, isOnline, activity,
    };
  });
  // Count total likes this client has given across all pets
  let totalMyLikes = 0;
  if (clientId) {
    for (const rec of Object.values(likes)) {
      totalMyLikes += (rec as any).voters.filter((v: string) => v === clientId).length;
    }
  }
  // Pin certain pets to the top
  const PIN_ORDER = ["zafkhxri", "gnswzv7p"];
  list.sort((a: any, b: any) => {
    const ai = PIN_ORDER.indexOf(a.id);
    const bi = PIN_ORDER.indexOf(b.id);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
  res.json({ pets: list, totalMyLikes });
});

// POST /api/pets/:petId/like — 点赞（每个用户全局最多 3 次）
app.post('/api/pets/:petId/like', (req, res) => {
  const { petId } = req.params;
  const { clientId } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  const pets = getPets();
  if (!pets[petId]) return res.status(404).json({ error: 'Pet not found' });

  const likes = getLikes();
  if (!likes[petId]) likes[petId] = { count: 0, voters: [] };

  // Count total likes across ALL pets for this client
  let totalMyLikes = 0;
  for (const rec of Object.values(likes)) {
    totalMyLikes += rec.voters.filter(v => v === clientId).length;
  }

  if (totalMyLikes >= 3) {
    return res.json({ likes: likes[petId].count, totalMyLikes });
  }

  likes[petId].count++;
  likes[petId].voters.push(clientId);
  saveLikes(likes);

  res.json({ likes: likes[petId].count, totalMyLikes: totalMyLikes + 1 });
});

// ---- Reminder system ----

const reminderTimers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

const DEFAULT_REMINDERS: Omit<Reminder, 'id' | 'petId' | 'createdAt'>[] = [
  { label: '吃午饭', message: '主人～该吃午饭啦！别饿着肚子哦～', type: 'fixed', time: '12:00', enabled: true },
  { label: '吃晚饭', message: '主人～该吃晚饭啦！', type: 'fixed', time: '18:00', enabled: true },
  { label: '起来活动', message: '主人～坐太久了，起来活动一下吧！', type: 'interval', intervalMinutes: 120, enabled: true },
  { label: '该下班了', message: '主人～该下班啦！今天辛苦了～', type: 'fixed', time: '18:30', enabled: true },
];

function seedDefaultReminders(petId: string) {
  const reminders = getReminders();
  const existing = Object.values(reminders).filter(r => r.petId === petId);
  if (existing.length > 0) return;
  for (const def of DEFAULT_REMINDERS) {
    const id = generatePetId();
    reminders[id] = { ...def, id, petId, createdAt: new Date().toISOString() };
  }
  saveReminders(reminders);
}

function scheduleReminders(petId: string) {
  // Clear existing
  const existing = reminderTimers.get(petId);
  if (existing) {
    for (const t of existing.values()) clearTimeout(t);
  }
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const reminders = getReminders();
  const petReminders = Object.values(reminders).filter(r => r.petId === petId && r.enabled);

  for (const r of petReminders) {
    if (r.type === 'fixed' && r.time) {
      const scheduleNext = () => {
        const [h, m] = r.time!.split(':').map(Number);
        const now = new Date();
        const target = new Date();
        target.setHours(h, m, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const delay = target.getTime() - now.getTime();
        timers.set(r.id, setTimeout(async () => {
          const audioUrl = await textToSpeech(r.message, petId);
          broadcastToPet(petId, { type: 'reminder', reminderId: r.id, label: r.label, message: r.message, audioUrl });
          scheduleNext();
        }, delay));
      };
      scheduleNext();
    } else if (r.type === 'interval' && r.intervalMinutes) {
      const ms = r.intervalMinutes * 60 * 1000;
      const iv = setInterval(async () => {
        const audioUrl = await textToSpeech(r.message, petId);
        broadcastToPet(petId, { type: 'reminder', reminderId: r.id, label: r.label, message: r.message, audioUrl });
      }, ms);
      timers.set(r.id, iv as any);
    }
  }
  reminderTimers.set(petId, timers);
}

// GET /api/pets/:petId/reminders
app.get('/api/pets/:petId/reminders', (req, res) => {
  const { petId } = req.params;
  seedDefaultReminders(petId);
  const reminders = getReminders();
  const list = Object.values(reminders).filter(r => r.petId === petId);
  res.json(list);
});

// POST /api/pets/:petId/reminders
app.post('/api/pets/:petId/reminders', (req, res) => {
  const { petId } = req.params;
  const { label, message, type, time, intervalMinutes, enabled } = req.body;
  if (!label || !message) return res.status(400).json({ error: 'label and message required' });

  const reminders = getReminders();
  const id = generatePetId();
  const reminder: Reminder = {
    id, petId, label, message,
    type: type || 'fixed',
    time, intervalMinutes,
    enabled: enabled !== false,
    createdAt: new Date().toISOString(),
  };
  reminders[id] = reminder;
  saveReminders(reminders);
  scheduleReminders(petId);
  res.json(reminder);
});

// PUT /api/pets/:petId/reminders/:reminderId
app.put('/api/pets/:petId/reminders/:reminderId', (req, res) => {
  const { petId, reminderId } = req.params;
  const reminders = getReminders();
  if (!reminders[reminderId] || reminders[reminderId].petId !== petId) {
    return res.status(404).json({ error: 'Reminder not found' });
  }
  const { label, message, type, time, intervalMinutes, enabled } = req.body;
  if (label !== undefined) reminders[reminderId].label = label;
  if (message !== undefined) reminders[reminderId].message = message;
  if (type !== undefined) reminders[reminderId].type = type;
  if (time !== undefined) reminders[reminderId].time = time;
  if (intervalMinutes !== undefined) reminders[reminderId].intervalMinutes = intervalMinutes;
  if (enabled !== undefined) reminders[reminderId].enabled = enabled;
  saveReminders(reminders);
  scheduleReminders(petId);
  res.json(reminders[reminderId]);
});

// DELETE /api/pets/:petId/reminders/:reminderId
app.delete('/api/pets/:petId/reminders/:reminderId', (req, res) => {
  const { petId, reminderId } = req.params;
  const reminders = getReminders();
  if (!reminders[reminderId] || reminders[reminderId].petId !== petId) {
    return res.status(404).json({ error: 'Reminder not found' });
  }
  delete reminders[reminderId];
  saveReminders(reminders);
  scheduleReminders(petId);
  res.json({ ok: true });
});

// ---- Chat ----

app.post('/api/pets/:petId/chat', async (req, res) => {
  const { petId } = req.params;
  const { message, history } = req.body as { message: string; history?: { role: string; content: string }[] };
  if (!message) return res.status(400).json({ error: 'message required' });

  const pets = getPets();
  const pet = pets[petId];
  if (!pet) return res.status(404).json({ error: 'Pet not found' });

  // Build system prompt with pet personality
  // Check for custom personality file first
  let systemPrompt = '';
  const personalityPath = path.join(getPetDir(petId), 'personality.txt');
  if (fs.existsSync(personalityPath)) {
    systemPrompt = fs.readFileSync(personalityPath, 'utf-8');
  } else {
    let petDesc = '';
    try {
      const manifestPath = path.join(getPetDir(petId), 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (manifest.description) petDesc = manifest.description;
      }
    } catch {}
    systemPrompt = `你是一只名叫"${pet.name}"的桌面宠物。${petDesc ? `关于你：${petDesc}。` : ''}
你的性格：可爱、活泼、关心主人、偶尔撒娇。
回复要求：
- 用1-2句话简短回复
- 语气亲切可爱，适当使用"～"等语气词
- 跟随用户使用的语言回复（中文回中文，英文回英文）
- 你是主人的桌面伙伴，会关心主人的生活和工作`;
  }


  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...(history || []).slice(-10),
    { role: 'user', content: message },
  ];

  try {
    const resp = await fetch(`${VOLC_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ model: VISION_MODEL, messages, max_tokens: 256 }),
    });
    const data = await resp.json() as any;
    const rawReply = data?.choices?.[0]?.message?.content || '喵～我好像没听清，再说一次吧？';
    // Extract action tag from LLM reply (e.g. [action:happy])
    const actionMatch = rawReply.match(/\[action:(\w+)\]/);
    const action = actionMatch ? actionMatch[1] : 'talking';
    const reply = rawReply.replace(/\[action:\w+\]/, '').trim();
    const audioUrl = await textToSpeech(reply, petId);
    // Award XP for chatting
    try {
      const statsPath = path.join(ASSETS_DIR, '..', 'data', 'pet_stats.json');
      let allStats: any = {};
      if (fs.existsSync(statsPath)) allStats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      if (allStats[petId]) {
        allStats[petId].xp = (allStats[petId].xp || 0) + 15;
        allStats[petId].mood = Math.min(100, (allStats[petId].mood || 50) + 3);
        // Check level up
        const lvl = allStats[petId].level || 1;
        if (allStats[petId].xp >= 100 * lvl * lvl) allStats[petId].level = lvl + 1;
        allStats[petId].lastTickAt = new Date().toISOString();
        fs.writeFileSync(statsPath, JSON.stringify(allStats, null, 2));
      }
    } catch {}
    incrementTaskProgress(petId, 'chat_3');
    recentActivity.set(petId, { type: 'chatting', since: Date.now() });
    res.json({ reply, audioUrl, action });
  } catch (err) {
    console.error('Chat API error:', err);
    res.json({ reply: '呜呜，我的脑子卡住了...等一下再试试吧～' });
  }
});


// ---- Touch interaction ----
app.post('/api/pets/:petId/touch', async (req, res) => {
  const { petId } = req.params;
  const pets = getPets();
  const pet = pets[petId];
  if (!pet) return res.status(404).json({ error: 'Pet not found' });

  // Load touch replies from pet directory
  const touchPath = path.join(getPetDir(petId), 'touch_replies.json');
  let replies = [
    { text: '你好呀～', action: 'waving' },
    { text: '嘿嘿～', action: 'happy' },
  ];
  try {
    if (fs.existsSync(touchPath)) {
      replies = JSON.parse(fs.readFileSync(touchPath, 'utf-8'));
    }
  } catch {}

  const pick = replies[Math.floor(Math.random() * replies.length)];
  const audioUrl = await textToSpeech(pick.text, petId);
  // Award XP for touch
  try {
    const statsPath = path.join(ASSETS_DIR, '..', 'data', 'pet_stats.json');
    let allStats: any = {};
    if (fs.existsSync(statsPath)) allStats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
    if (allStats[petId]) {
      allStats[petId].xp = (allStats[petId].xp || 0) + 5;
      allStats[petId].mood = Math.min(100, (allStats[petId].mood || 50) + 5);
      const lvl = allStats[petId].level || 1;
      if (allStats[petId].xp >= 100 * lvl * lvl) allStats[petId].level = lvl + 1;
      allStats[petId].lastTickAt = new Date().toISOString();
      fs.writeFileSync(statsPath, JSON.stringify(allStats, null, 2));
    }
  } catch {}
  res.json({ reply: pick.text, audioUrl, action: pick.action || 'waving' });
});


// ---- Pet Stats & Game System ----

interface PetStats {
  petId: string;
  hunger: number;
  mood: number;
  energy: number;
  xp: number;
  level: number;
  coins: number;
  lastFedAt: string;
  lastPlayedAt: string;
  lastTickAt: string;
  createdAt: string;
  dailyCheckIn: { lastDate: string; streak: number; totalDays: number };
  totalGamesPlayed: number;
  totalGiftsGiven: number;
  totalGiftsReceived: number;
  totalVisitsReceived: number;
}

function readStatsFile(): Record<string, PetStats> {
  const statsPath = path.join(ASSETS_DIR, '..', 'data', 'pet_stats.json');
  try {
    if (fs.existsSync(statsPath)) return JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
  } catch {}
  return {};
}

function writeStatsFile(data: Record<string, PetStats>) {
  const dir = path.join(ASSETS_DIR, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pet_stats.json'), JSON.stringify(data, null, 2));
}

function initStats(petId: string): PetStats {
  const now = new Date().toISOString();
  return {
    petId,
    hunger: 80, mood: 80, energy: 80,
    xp: 0, level: 1, coins: 50,
    lastFedAt: now, lastPlayedAt: now, lastTickAt: now, createdAt: now,
    dailyCheckIn: { lastDate: '', streak: 0, totalDays: 0 },
    totalGamesPlayed: 0, totalGiftsGiven: 0, totalGiftsReceived: 0, totalVisitsReceived: 0,
  };
}

function applyDecay(stats: PetStats): PetStats {
  const now = Date.now();
  const elapsed = (now - new Date(stats.lastTickAt).getTime()) / (60 * 1000); // minutes
  if (elapsed < 1) return stats;
  stats.hunger = Math.max(0, stats.hunger - elapsed * 0.15);
  stats.mood = Math.max(0, stats.mood - elapsed * 0.08);
  stats.energy = Math.max(0, stats.energy - elapsed * 0.05);
  stats.lastTickAt = new Date().toISOString();
  return stats;
}

function xpForLevel(n: number): number { return 100 * n * n; }

function checkLevelUp(stats: PetStats): boolean {
  const needed = xpForLevel(stats.level);
  if (stats.xp >= needed) {
    stats.level++;
    return true;
  }
  return false;
}

// GET pet stats
app.get('/api/pets/:petId/stats', (req, res) => {
  const { petId } = req.params;
  const pets = getPets();
  if (!pets[petId]) return res.status(404).json({ error: 'Pet not found' });

  const allStats = readStatsFile();
  if (!allStats[petId]) allStats[petId] = initStats(petId);
  allStats[petId] = applyDecay(allStats[petId]);
  writeStatsFile(allStats);

  const s = allStats[petId];
  res.json({
    ...s,
    nextLevelXp: xpForLevel(s.level),
  });
});

// POST feed pet
app.post('/api/pets/:petId/feed', (req, res) => {
  const { petId } = req.params;
  const pets = getPets();
  if (!pets[petId]) return res.status(404).json({ error: 'Pet not found' });

  const allStats = readStatsFile();
  if (!allStats[petId]) allStats[petId] = initStats(petId);
  allStats[petId] = applyDecay(allStats[petId]);

  const s = allStats[petId];
  // Cooldown: 2 min between feeds (free feed)
  const sinceLastFed = (Date.now() - new Date(s.lastFedAt).getTime()) / 1000;
  if (sinceLastFed < 30) {
    return res.status(429).json({ error: 'Too soon', cooldownSeconds: Math.ceil(30 - sinceLastFed) });
  }

  s.hunger = Math.min(100, s.hunger + 20);
  s.mood = Math.min(100, s.mood + 5);
  s.xp += 10;
  s.lastFedAt = new Date().toISOString();
  incrementTaskProgress(petId, 'feed_3');
  const leveledUp = checkLevelUp(s);
  writeStatsFile(allStats);

  res.json({ success: true, stats: { ...s, nextLevelXp: xpForLevel(s.level) }, leveledUp });
});

// POST daily check-in
app.post('/api/pets/:petId/checkin', (req, res) => {
  const { petId } = req.params;
  const pets = getPets();
  if (!pets[petId]) return res.status(404).json({ error: 'Pet not found' });

  const allStats = readStatsFile();
  if (!allStats[petId]) allStats[petId] = initStats(petId);
  allStats[petId] = applyDecay(allStats[petId]);

  const s = allStats[petId];
  const today = new Date().toISOString().slice(0, 10);

  if (s.dailyCheckIn.lastDate === today) {
    return res.json({ alreadyCheckedIn: true, stats: { ...s, nextLevelXp: xpForLevel(s.level) } });
  }

  // Check streak
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s.dailyCheckIn.lastDate === yesterday) {
    s.dailyCheckIn.streak++;
  } else {
    s.dailyCheckIn.streak = 1;
  }
  s.dailyCheckIn.lastDate = today;
  s.dailyCheckIn.totalDays++;

  // Rewards based on streak
  let coinsReward = 10;
  let bonusXp = 0;
  if (s.dailyCheckIn.streak >= 30) { coinsReward = 500; bonusXp = 100; }
  else if (s.dailyCheckIn.streak >= 7) { coinsReward = 100; bonusXp = 50; }
  else if (s.dailyCheckIn.streak >= 3) coinsReward = 20;
  s.coins += coinsReward;
  s.xp += 20 + bonusXp;
  s.mood = Math.min(100, s.mood + 10);
  // Increment daily task progress
  incrementTaskProgress(petId, 'checkin');
  const leveledUp = checkLevelUp(s);
  writeStatsFile(allStats);

  res.json({
    success: true,
    coinsReward,
    streak: s.dailyCheckIn.streak,
    leveledUp,
    stats: { ...s, nextLevelXp: xpForLevel(s.level) },
  });
});

// POST game result (feeding frenzy, memory match, quick tap)
app.post('/api/pets/:petId/game/:gameId/result', (req, res) => {
  const { petId, gameId } = req.params;
  const { score } = req.body as { score: number };
  if (typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'Invalid score' });

  const pets = getPets();
  if (!pets[petId]) return res.status(404).json({ error: 'Pet not found' });

  const allStats = readStatsFile();
  if (!allStats[petId]) allStats[petId] = initStats(petId);
  allStats[petId] = applyDecay(allStats[petId]);

  const s = allStats[petId];
  // Cap score to prevent cheating
  const cappedScore = Math.min(score, 200);

  // Rewards vary by game
  let xpReward = cappedScore;
  let coinsReward = Math.floor(cappedScore / 10);
  let hungerBoost = 0;
  let moodBoost = 10;

  if (gameId === 'feeding') {
    hungerBoost = 20;
  } else if (gameId === 'quicktap') {
    xpReward = cappedScore * 2;
    coinsReward = Math.floor(cappedScore / 5);
  } else if (gameId === 'memory') {
    coinsReward = 15;
  }

  s.xp += xpReward;
  s.coins += coinsReward;
  s.hunger = Math.min(100, s.hunger + hungerBoost);
  s.mood = Math.min(100, s.mood + moodBoost);
  s.lastPlayedAt = new Date().toISOString();
  s.totalGamesPlayed++;
  incrementTaskProgress(petId, 'play_2');
  recentActivity.set(petId, { type: 'playing', since: Date.now() });
  const leveledUp = checkLevelUp(s);
  writeStatsFile(allStats);

  // Update leaderboard
  const lbPath = path.join(ASSETS_DIR, '..', 'data', 'leaderboard.json');
  let lb: any = {};
  try { if (fs.existsSync(lbPath)) lb = JSON.parse(fs.readFileSync(lbPath, 'utf-8')); } catch {}

  const weekStart = getWeekStart();
  if (!lb[gameId] || lb[gameId].weekOf !== weekStart) {
    lb[gameId] = { weekOf: weekStart, scores: [] };
  }

  lb[gameId].scores.push({
    petId,
    petName: pets[petId]?.name || petId,
    score: cappedScore,
    playedAt: new Date().toISOString(),
  });

  // Keep top 50 scores
  lb[gameId].scores.sort((a: any, b: any) => b.score - a.score);
  lb[gameId].scores = lb[gameId].scores.slice(0, 50);

  const dir = path.join(ASSETS_DIR, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lbPath, JSON.stringify(lb, null, 2));

  res.json({
    success: true,
    xpReward, coinsReward, hungerBoost, moodBoost, leveledUp,
    stats: { ...s, nextLevelXp: xpForLevel(s.level) },
  });
});

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

// ===== Daily Tasks System =====
const TASK_POOL = [
  { id: 'feed_3', name: '喂宠物3次', target: 3, reward: 20 },
  { id: 'play_2', name: '玩2局游戏', target: 2, reward: 30 },
  { id: 'visit_2', name: '访问2只宠物', target: 2, reward: 25 },
  { id: 'checkin', name: '完成签到', target: 1, reward: 15 },
  { id: 'chat_3', name: '和宠物聊3次', target: 3, reward: 20 },
];

function getDailyTasks(petId: string): any {
  const tasksPath = path.join(ASSETS_DIR, '..', 'data', 'daily_tasks.json');
  let allTasks: any = {};
  try { if (fs.existsSync(tasksPath)) allTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')); } catch {}

  const today = new Date().toISOString().slice(0, 10);
  if (!allTasks[petId] || allTasks[petId].date !== today) {
    // Generate 3 random tasks for today
    const shuffled = [...TASK_POOL].sort(() => Math.random() - 0.5);
    allTasks[petId] = {
      date: today,
      tasks: shuffled.slice(0, 3).map(t => ({ ...t, progress: 0, claimed: false })),
    };
    const dir = path.join(ASSETS_DIR, '..', 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tasksPath, JSON.stringify(allTasks, null, 2));
  }
  return allTasks[petId];
}

function incrementTaskProgress(petId: string, taskId: string) {
  const tasksPath = path.join(ASSETS_DIR, '..', 'data', 'daily_tasks.json');
  let allTasks: any = {};
  try { if (fs.existsSync(tasksPath)) allTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')); } catch {}
  const today = new Date().toISOString().slice(0, 10);
  if (!allTasks[petId] || allTasks[petId].date !== today) return;
  const task = allTasks[petId].tasks.find((t: any) => t.id === taskId);
  if (task && !task.claimed) {
    task.progress = Math.min(task.target, task.progress + 1);
    fs.writeFileSync(tasksPath, JSON.stringify(allTasks, null, 2));
  }
}

app.get('/api/pets/:petId/tasks', (req, res) => {
  const { petId } = req.params;
  const tasks = getDailyTasks(petId);
  res.json(tasks);
});

app.post('/api/pets/:petId/tasks/:taskId/claim', (req, res) => {
  const { petId, taskId } = req.params;
  const tasksPath = path.join(ASSETS_DIR, '..', 'data', 'daily_tasks.json');
  let allTasks: any = {};
  try { if (fs.existsSync(tasksPath)) allTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')); } catch {}

  const today = new Date().toISOString().slice(0, 10);
  if (!allTasks[petId] || allTasks[petId].date !== today) {
    return res.status(400).json({ error: 'No tasks today' });
  }
  const task = allTasks[petId].tasks.find((t: any) => t.id === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.claimed) return res.json({ alreadyClaimed: true });
  if (task.progress < task.target) return res.status(400).json({ error: 'Not completed yet' });

  task.claimed = true;
  fs.writeFileSync(tasksPath, JSON.stringify(allTasks, null, 2));

  // Award coins
  const allStats = readStatsFile();
  if (!allStats[petId]) allStats[petId] = initStats(petId);
  allStats[petId].coins += task.reward;
  writeStatsFile(allStats);

  res.json({ success: true, coinsReward: task.reward, coins: allStats[petId].coins });
});

// ===== Pet Visiting System =====
app.post('/api/pets/:petId/visit', (req, res) => {
  const { petId } = req.params;
  const { visitorPetId } = req.body as { visitorPetId: string };
  if (!visitorPetId || visitorPetId === petId) return res.status(400).json({ error: 'Invalid visit' });

  const pets = getPets();
  if (!pets[petId] || !pets[visitorPetId]) return res.status(404).json({ error: 'Pet not found' });

  // Check daily limit (3 visits per pair per day)
  const visitsPath = path.join(ASSETS_DIR, '..', 'data', 'visits.json');
  let visits: any = {};
  try { if (fs.existsSync(visitsPath)) visits = JSON.parse(fs.readFileSync(visitsPath, 'utf-8')); } catch {}

  const today = new Date().toISOString().slice(0, 10);
  const pairKey = `${visitorPetId}->${petId}`;
  if (!visits[today]) visits[today] = {};
  const todayCount = visits[today][pairKey] || 0;
  if (todayCount >= 3) {
    return res.status(429).json({ error: 'Visit limit reached', todayCount });
  }
  visits[today][pairKey] = todayCount + 1;

  // Clean old days (keep only today)
  for (const d of Object.keys(visits)) {
    if (d !== today) delete visits[d];
  }

  const dir = path.join(ASSETS_DIR, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(visitsPath, JSON.stringify(visits, null, 2));

  // Apply effects
  const allStats = readStatsFile();
  if (!allStats[petId]) allStats[petId] = initStats(petId);
  if (!allStats[visitorPetId]) allStats[visitorPetId] = initStats(visitorPetId);

  allStats[visitorPetId].mood = Math.min(100, allStats[visitorPetId].mood + 5);
  allStats[visitorPetId].xp += 10;
  allStats[petId].mood = Math.min(100, allStats[petId].mood + 5);
  allStats[petId].xp += 5;
  allStats[petId].totalVisitsReceived = (allStats[petId].totalVisitsReceived || 0) + 1;
  checkLevelUp(allStats[visitorPetId]);
  checkLevelUp(allStats[petId]);
  writeStatsFile(allStats);

  // Task progress
  incrementTaskProgress(visitorPetId, 'visit_2');

  // WebSocket notify host
  broadcastToPet(petId, {
    type: 'visit',
    visitorName: pets[visitorPetId]?.name || visitorPetId,
    visitorPetId,
  });

  res.json({
    success: true,
    visitsToday: todayCount + 1,
    visitorXp: 10, visitorMood: 5,
    hostXp: 5, hostMood: 5,
  });
});

// ===== Gift System =====
const GIFT_ITEMS: Record<string, { name: string; price: number; effect: any; dailyLimit?: number }> = {
  snack:       { name: '小零食', price: 10, effect: { hunger: 15 } },
  toy_ball:    { name: '玩具球', price: 20, effect: { mood: 20 } },
  stardust:    { name: '星尘',   price: 50, effect: { xp: 30 } },
  golden_bone: { name: '金骨头', price: 100, effect: { xp: 50, mood: 10 } },
  love_letter: { name: '情书',   price: 0, effect: { mood: 10 }, dailyLimit: 1 },
};

app.get('/api/gifts/items', (_req, res) => {
  res.json(Object.entries(GIFT_ITEMS).map(([id, item]) => ({
    id, name: item.name, price: item.price, effect: item.effect,
  })));
});

app.post('/api/pets/:petId/gift', (req, res) => {
  const { petId } = req.params;
  const { fromPetId, itemId } = req.body as { fromPetId: string; itemId: string };

  const item = GIFT_ITEMS[itemId];
  if (!item) return res.status(400).json({ error: 'Invalid item' });

  const pets = getPets();
  if (!pets[petId] || !pets[fromPetId]) return res.status(404).json({ error: 'Pet not found' });
  if (petId === fromPetId) return res.status(400).json({ error: 'Cannot gift self' });

  const allStats = readStatsFile();
  if (!allStats[fromPetId]) allStats[fromPetId] = initStats(fromPetId);
  if (!allStats[petId]) allStats[petId] = initStats(petId);

  const sender = allStats[fromPetId];
  const receiver = allStats[petId];

  // Check coins
  if (item.price > 0 && sender.coins < item.price) {
    return res.status(400).json({ error: '金币不足' });
  }

  // Check daily limit for love_letter
  if (item.dailyLimit) {
    const today = new Date().toISOString().slice(0, 10);
    if (sender.lastLoveLetterDate === today) {
      return res.status(429).json({ error: '今天已经送过情书了' });
    }
    sender.lastLoveLetterDate = today;
  }

  // Deduct coins
  if (item.price > 0) sender.coins -= item.price;

  // Apply effects to receiver
  if (item.effect.hunger) receiver.hunger = Math.min(100, receiver.hunger + item.effect.hunger);
  if (item.effect.mood) receiver.mood = Math.min(100, receiver.mood + item.effect.mood);
  if (item.effect.xp) receiver.xp += item.effect.xp;
  checkLevelUp(receiver);

  sender.totalGiftsSent = (sender.totalGiftsSent || 0) + 1;
  receiver.totalGiftsReceived = (receiver.totalGiftsReceived || 0) + 1;
  writeStatsFile(allStats);

  // WebSocket notify receiver
  broadcastToPet(petId, {
    type: 'gift',
    itemId, itemName: item.name,
    fromPetId, fromPetName: pets[fromPetId]?.name || fromPetId,
  });

  res.json({ success: true, itemName: item.name, senderCoins: sender.coins });
});

// ===== RPS PvP System =====
interface RPSMatch {
  id: string;
  p1: { petId: string; ws: any; choice?: string };
  p2: { petId: string; ws: any; choice?: string };
  rounds: { p1: string; p2: string; winner: string }[];
  currentRound: number;
  roundTimer?: any;
}

const rpsQueue: { petId: string; ws: any; joinedAt: number }[] = [];
const rpsMatches = new Map<string, RPSMatch>();
let rpsMatchCounter = 0;

function rpsWinner(a: string, b: string): string {
  if (a === b) return 'draw';
  if ((a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock')) return 'p1';
  return 'p2';
}

function rpsEvaluateRound(match: RPSMatch) {
  if (match.roundTimer) { clearTimeout(match.roundTimer); match.roundTimer = null; }
  const p1c = match.p1.choice || ['rock','paper','scissors'][Math.floor(Math.random()*3)];
  const p2c = match.p2.choice || ['rock','paper','scissors'][Math.floor(Math.random()*3)];
  const winner = rpsWinner(p1c, p2c);
  match.rounds.push({ p1: p1c, p2: p2c, winner });

  const roundResult = { type: 'rps_round_result', round: match.currentRound, p1Choice: p1c, p2Choice: p2c, winner };
  try { match.p1.ws.send(JSON.stringify({ ...roundResult, you: 'p1' })); } catch {}
  try { match.p2.ws.send(JSON.stringify({ ...roundResult, you: 'p2' })); } catch {}

  // Check if match is decided (best of 3)
  const p1Wins = match.rounds.filter(r => r.winner === 'p1').length;
  const p2Wins = match.rounds.filter(r => r.winner === 'p2').length;

  if (p1Wins >= 2 || p2Wins >= 2 || match.rounds.length >= 3) {
    // Match over
    const finalWinner = p1Wins > p2Wins ? 'p1' : p2Wins > p1Wins ? 'p2' : 'draw';
    const winXp = 50, winCoins = 20, loseXp = 15, loseCoins = 5, drawXp = 25, drawCoins = 10;

    const allStats = readStatsFile();
    function awardRPS(pid: string, won: boolean, drew: boolean) {
      if (!allStats[pid]) allStats[pid] = initStats(pid);
      if (won) { allStats[pid].xp += winXp; allStats[pid].coins += winCoins; }
      else if (drew) { allStats[pid].xp += drawXp; allStats[pid].coins += drawCoins; }
      else { allStats[pid].xp += loseXp; allStats[pid].coins += loseCoins; }
      allStats[pid].mood = Math.min(100, allStats[pid].mood + 5);
      checkLevelUp(allStats[pid]);
    }

    const isDraw = finalWinner === 'draw';
    awardRPS(match.p1.petId, finalWinner === 'p1', isDraw);
    awardRPS(match.p2.petId, finalWinner === 'p2', isDraw);
    incrementTaskProgress(match.p1.petId, 'play_2');
    incrementTaskProgress(match.p2.petId, 'play_2');
    writeStatsFile(allStats);

    const finalMsg = (you: string) => ({
      type: 'rps_final',
      winner: finalWinner,
      you,
      p1Wins, p2Wins,
      xpReward: (finalWinner === you ? winXp : isDraw ? drawXp : loseXp),
      coinsReward: (finalWinner === you ? winCoins : isDraw ? drawCoins : loseCoins),
    });

    setTimeout(() => {
      try { match.p1.ws.send(JSON.stringify(finalMsg('p1'))); } catch {}
      try { match.p2.ws.send(JSON.stringify(finalMsg('p2'))); } catch {}
      rpsMatches.delete(match.id);
    }, 1500);
  } else {
    // Next round
    match.currentRound++;
    match.p1.choice = undefined;
    match.p2.choice = undefined;
    setTimeout(() => rpsStartRound(match), 2000);
  }
}

function rpsStartRound(match: RPSMatch) {
  const msg = { type: 'rps_round_start', round: match.currentRound, timeout: 5 };
  try { match.p1.ws.send(JSON.stringify(msg)); } catch {}
  try { match.p2.ws.send(JSON.stringify(msg)); } catch {}
  // 5 second timer
  match.roundTimer = setTimeout(() => rpsEvaluateRound(match), 5500);
}

function rpsCreateMatch(p1: any, p2: any) {
  const id = `rps_${++rpsMatchCounter}`;
  const match: RPSMatch = { id, p1: { petId: p1.petId, ws: p1.ws }, p2: { petId: p2.petId, ws: p2.ws }, rounds: [], currentRound: 1 };
  rpsMatches.set(id, match);

  const pets = getPets();
  const matchedMsg = (you: string, opponentName: string) => ({
    type: 'rps_matched', matchId: id, you, opponentName,
  });
  try { p1.ws.send(JSON.stringify(matchedMsg('p1', pets[p2.petId]?.name || '对手'))); } catch {}
  try { p2.ws.send(JSON.stringify(matchedMsg('p2', pets[p1.petId]?.name || '对手'))); } catch {}

  setTimeout(() => rpsStartRound(match), 2000);
}

app.post('/api/game/rps/match', (req, res) => {
  const { petId } = req.body as { petId: string };
  if (!petId) return res.status(400).json({ error: 'Missing petId' });

  // Find WS connection for this pet
  let petWs: any = null;
  for (const [ws, subPetId] of wsSubscriptions.entries()) {
    if (subPetId === petId) { petWs = ws; break; }
  }
  if (!petWs) return res.status(400).json({ error: 'No WebSocket connection' });

  // Remove from queue if already there
  const idx = rpsQueue.findIndex(q => q.petId === petId);
  if (idx >= 0) rpsQueue.splice(idx, 1);

  // Check if someone else is waiting
  if (rpsQueue.length > 0) {
    const opponent = rpsQueue.shift()!;
    rpsCreateMatch(opponent, { petId, ws: petWs });
    res.json({ status: 'matched' });
  } else {
    rpsQueue.push({ petId, ws: petWs, joinedAt: Date.now() });
    // AI fallback after 15s
    setTimeout(() => {
      const qi = rpsQueue.findIndex(q => q.petId === petId);
      if (qi >= 0) {
        rpsQueue.splice(qi, 1);
        // Create AI match
        const aiWs = { send: () => {}, readyState: 1 };
        rpsCreateMatch({ petId, ws: petWs }, { petId: 'AI_BOT', ws: aiWs });
      }
    }, 15000);
    res.json({ status: 'queued' });
  }
});

// Recent activity tracking for badges
const recentActivity = new Map<string, { type: string; since: number }>();

// Game encourage voices - pregenerate TTS for game events
const GAME_ENCOURAGE: Record<string, string[]> = {
  start: ['加油哦！', '准备好了吗？开始啦！', '冲鸭！'],
  combo: ['太棒了！', '连击！好厉害！', '继续保持！', '哇塞！', '你好强呀！'],
  miss_bad: ['小心呀！', '那个不能吃！', '别碰坏东西！'],
  end_high: ['太厉害了！满分！', '你是最棒的！', '好高分呀！'],
  end_low: ['没关系，再来一次！', '下次一定可以的！', '加油，再试试吧！'],
};

// Cache generated encourage audios per pet
const encourageCache: Record<string, Record<string, string[]>> = {};

app.post('/api/pets/:petId/game/encourage', async (req, res) => {
  const { petId } = req.params;
  
  // Check cache (valid for 10 min)
  const cacheKey = petId;
  if (encourageCache[cacheKey]) {
    return res.json({ audios: encourageCache[cacheKey] });
  }

  const audios: Record<string, string[]> = {};
  
  try {
    // Generate one random voice per category in parallel
    const categories = Object.keys(GAME_ENCOURAGE);
    const promises = categories.map(async (cat) => {
      const texts = GAME_ENCOURAGE[cat];
      const text = texts[Math.floor(Math.random() * texts.length)];
      const url = await textToSpeech(text, petId);
      return { cat, url };
    });
    
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.url) audios[r.cat] = [r.url];
    }
    
    encourageCache[cacheKey] = audios;
    // Clear cache after 10 min
    setTimeout(() => { delete encourageCache[cacheKey]; }, 10 * 60 * 1000);
    
    res.json({ audios });
  } catch (e) {
    res.json({ audios: {} });
  }
});

// GET leaderboard
app.get('/api/leaderboard/:gameId', (req, res) => {
  const { gameId } = req.params;
  const lbPath = path.join(ASSETS_DIR, '..', 'data', 'leaderboard.json');
  let lb: any = {};
  try { if (fs.existsSync(lbPath)) lb = JSON.parse(fs.readFileSync(lbPath, 'utf-8')); } catch {}

  const weekStart = getWeekStart();
  if (!lb[gameId] || lb[gameId].weekOf !== weekStart) {
    return res.json({ weekOf: weekStart, scores: [] });
  }
  res.json(lb[gameId]);
});

// ---- Per-pet routes ----

// Middleware to validate petId
function petMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { petId } = req.params;
  const pets = getPets();
  if (!pets[petId]) {
    return res.status(404).json({ error: 'Pet not found' });
  }
  next();
}

// POST /api/pets/:petId/generate
app.post('/api/pets/:petId/generate', petMiddleware, upload.single('photo'), async (req, res) => {
  const { petId } = req.params;
  const inst = getPetInstance(petId)!;

  if (inst.generationState.status === 'generating') {
    return res.status(409).json({ error: 'Generation already in progress' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }

  const petDir = ensurePetDir(petId);
  const photoPath = path.join(petDir, 'pet_photo.jpg');
  fs.renameSync(req.file.path, photoPath);

  // Update pet status
  const pets = getPets();
  pets[petId].status = 'generating';
  savePets(pets);

  // Start generation
  inst.generationState.status = 'generating';
  inst.generationState.stage = 'starting';
  inst.generationState.progress = 0;
  inst.generationState.message = 'Starting...';

  runGeneration(petId, photoPath, petDir);

  res.json({ status: 'started', petId });
});

async function runGeneration(petId: string, photoPath: string, outputDir: string) {
  const inst = getPetInstance(petId);
  if (!inst) return;

  function progressCallback(stage: string, progress: number, message: string) {
    inst.generationState.stage = stage;
    inst.generationState.progress = progress;
    inst.generationState.message = message;
    broadcastToPet(petId, { type: 'progress', stage, progress, message });
  }

  try {
    const manifest = await generatePetAssets(photoPath, outputDir, progressCallback);
    inst.generationState.status = 'ready';
    inst.generationState.manifest = manifest;
    inst.generationState.message = 'Complete!';

    const pets = getPets();
    pets[petId].status = 'ready';
    savePets(pets);

    broadcastToPet(petId, { type: 'ready', manifest });
  } catch (err: any) {
    inst.generationState.status = 'error';
    inst.generationState.message = err.message || String(err);

    const pets = getPets();
    pets[petId].status = 'error';
    savePets(pets);

    broadcastToPet(petId, { type: 'error', message: inst.generationState.message });
  }
}

// GET /api/pets/:petId/status
app.get('/api/pets/:petId/status', petMiddleware, (req, res) => {
  const inst = getPetInstance(req.params.petId);
  if (!inst) return res.status(404).json({ error: 'Pet not found' });
  res.json(inst.generationState);
});

// GET /api/pets/:petId/manifest
app.get('/api/pets/:petId/manifest', petMiddleware, (req, res) => {
  const manifestPath = path.join(PETS_BASE_DIR, req.params.petId, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    res.json(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
  } else {
    res.status(404).json({ error: 'No manifest found' });
  }
});

// GET /api/pets/:petId/assets/*
app.get('/api/pets/:petId/assets/*', petMiddleware, (req, res) => {
  const filepath = req.params[0];
  const fullPath = path.join(PETS_BASE_DIR, req.params.petId, filepath);
  if (fs.existsSync(fullPath)) {
    // Cache videos and images for 7 days — saves bandwidth on repeat visits
    const ext = path.extname(fullPath).toLowerCase();
    if (['.mp4', '.webm', '.jpg', '.jpeg', '.png'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
    res.sendFile(fullPath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ---- Per-pet mock state simulator ----

// POST /api/pets/:petId/mock/start
app.post('/api/pets/:petId/mock/start', petMiddleware, (req, res) => {
  const inst = getPetInstance(req.params.petId)!;
  if (inst.mockTimer) clearInterval(inst.mockTimer);
  console.log(`[Mock:${req.params.petId}] Starting pet state simulator`);
  inst.mockTimer = setInterval(() => {
    const candidates = PET_STATES.filter((s) => s !== inst.currentPetState && s !== 'talking');
    const newState = candidates[Math.floor(Math.random() * candidates.length)];
    const prev = inst.currentPetState;
    inst.currentPetState = newState;
    broadcastToPet(req.params.petId, { type: 'state_change', prev_state: prev, new_state: newState });
  }, 8000 + Math.random() * 7000);
  res.json({ status: 'mock started' });
});

// POST /api/pets/:petId/mock/stop
app.post('/api/pets/:petId/mock/stop', petMiddleware, (req, res) => {
  const inst = getPetInstance(req.params.petId)!;
  if (inst.mockTimer) {
    clearInterval(inst.mockTimer);
    inst.mockTimer = null;
  }
  res.json({ status: 'mock stopped' });
});

// POST /api/pets/:petId/state
app.post('/api/pets/:petId/state', petMiddleware, (req, res) => {
  const { state } = req.body;
  if (!PET_STATES.includes(state)) {
    return res.status(400).json({ error: `Invalid state. Must be one of: ${PET_STATES.join(', ')}` });
  }
  const inst = getPetInstance(req.params.petId)!;
  const prev = inst.currentPetState;
  inst.currentPetState = state;
  broadcastToPet(req.params.petId, { type: 'state_change', prev_state: prev, new_state: state });
  res.json({ prev_state: prev, new_state: state });
});

// GET /api/pets/:petId/pet-state
app.get('/api/pets/:petId/pet-state', petMiddleware, (req, res) => {
  const inst = getPetInstance(req.params.petId)!;
  res.json({ state: inst.currentPetState });
});

// ---- Camera integration (global, unchanged) ----
let cameraProcess: ChildProcess | null = null;
let detectionTimer: ReturnType<typeof setInterval> | null = null;
let cameraState = {
  status: 'disconnected' as 'disconnected' | 'connecting' | 'connected' | 'error',
  lastDetection: '',
  detectionCount: 0,
};

app.post('/api/camera/start', async (req, res) => {
  if (cameraProcess) {
    return res.json({ status: 'already_running', camera: cameraState });
  }

  const useMock = req.query.mock === 'true';
  const cameraScript = useMock
    ? path.join(__dirname, 'camera', 'mock_camera.py')
    : path.join(__dirname, 'camera', 'camera_service.py');
  const framePath = path.join(ASSETS_DIR, 'camera_frame.jpg');

  cameraState.status = 'connecting';

  const scriptArgs = useMock
    ? [cameraScript, '--output', framePath, '--interval', '8', '--frame-interval', '1']
    : [cameraScript, '--output', framePath, '--interval', '1000'];

  cameraProcess = spawn('python3.11', scriptArgs, {
    cwd: path.join(__dirname, 'camera'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  cameraProcess.on('error', (err) => {
    console.error(`[CameraPy] Failed to start: ${err.message}`);
    cameraProcess = null;
    cameraState.status = 'error';
  });

  cameraProcess.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) console.log(`[CameraPy] ${line}`);
    if (line.includes('Status: connected') || line.includes('[MockCam] Playing:')) {
      if (cameraState.status !== 'connected') {
        cameraState.status = 'connected';
      }
    }
  });

  cameraProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[CameraPy] ${data.toString().trim()}`);
  });

  cameraProcess.on('exit', (code) => {
    console.log(`[CameraPy] Exited with code ${code}`);
    cameraProcess = null;
    cameraState.status = 'disconnected';
    if (detectionTimer) {
      clearInterval(detectionTimer);
      detectionTimer = null;
    }
  });

  if (useMock) {
    setTimeout(() => {
      if (cameraState.status === 'connecting') {
        cameraState.status = 'connected';
      }
    }, 2000);
  }

  if (detectionTimer) clearInterval(detectionTimer);
  detectionTimer = setInterval(async () => {
    const detected = await detectPetState();
    // Camera detection is global — not tied to a specific pet for now
    if (detected) {
      console.log(`[Detect] Detected: ${detected}`);
    }
  }, DETECTION_INTERVAL * 1000);

  res.json({ status: 'started', camera: cameraState });
});

app.post('/api/camera/stop', (_req, res) => {
  if (detectionTimer) {
    clearInterval(detectionTimer);
    detectionTimer = null;
  }
  if (cameraProcess) {
    cameraProcess.kill('SIGTERM');
    cameraProcess = null;
  }
  cameraState.status = 'disconnected';
  console.log('[Camera] Stopped');
  res.json({ status: 'stopped' });
});

app.get('/api/camera/status', (_req, res) => {
  res.json(cameraState);
});

// ---- Downloads ----
app.get('/api/download/mac', (_req, res) => {
  const dmgPath = path.join(__dirname, '..', 'dist', 'DesktopPet.dmg');
  if (fs.existsSync(dmgPath)) {
    res.download(dmgPath, 'DesktopPet.dmg');
  } else {
    res.status(404).json({ error: 'Desktop app not available' });
  }
});

app.get('/api/download/win', (_req, res) => {
  const zipPath = path.join(__dirname, '..', 'dist', 'DesktopPet-Setup.exe');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'DesktopPet-Setup.exe');
  } else {
    res.status(404).json({ error: 'Windows app not available' });
  }
});


// ---- Standalone Matting API (for minipet-overlay) ----
const mattingUpload = multer({ dest: '/tmp/matting-uploads/' });
const MATTE_SCRIPT = path.join(__dirname, 'matting', 'matte_video_sam3.py');

app.post('/api/matting', mattingUpload.single('video'), async (req, res) => {
  const file = req.file;
  const description = (req.body?.description as string) || 'a cute pet';
  const state = (req.body?.state as string) || 'sitting';

  if (!file) {
    return res.status(400).json({ error: 'No video uploaded' });
  }

  const outputWebm = file.path + '_matted.webm';
  console.log(`[Matting API] ${file.originalname} desc="${description}" state="${state}"`);

  try {
    const { execSync } = require('child_process');
    execSync(`python3 "${MATTE_SCRIPT}" "${file.path}" "${outputWebm}" "${description}" "${state}"`, {
      stdio: 'inherit',
      timeout: 10 * 60 * 1000,
    });

    if (!fs.existsSync(outputWebm)) {
      throw new Error('Matting produced no output');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="matted.webm"');
    const stream = fs.createReadStream(outputWebm);
    stream.pipe(res);
    stream.on('end', () => {
      // Cleanup temp files
      try { fs.unlinkSync(file.path); } catch {}
      try { fs.unlinkSync(outputWebm); } catch {}
    });
  } catch (err: any) {
    console.error(`[Matting API] Failed:`, err.message);
    try { fs.unlinkSync(file.path); } catch {}
    try { fs.unlinkSync(outputWebm); } catch {}
    res.status(500).json({ error: 'Matting failed', detail: err.message });
  }
});


// ---- DIY Avatar Generation ----

const DIY_TASKS_DIR = path.join(__dirname, "diy_tasks");
fs.mkdirSync(DIY_TASKS_DIR, { recursive: true });

// TTS credentials endpoint
const TTS_ACCESS_KEY = process.env.TTS_ACCESS_KEY || "OX_VMqDAcF-6AHPyOsB5CpchCM_cSfQA";
const TTS_APP_KEY = process.env.TTS_APP_KEY || "4380630105";

app.get("/api/credentials/tts", (req, res) => {
  res.json({ accessKey: TTS_ACCESS_KEY, appKey: TTS_APP_KEY });
});

// DIY queue
const diyQueue: string[] = [];
let diyProcessing = false;

async function enqueueDiy(taskId: string) {
  diyQueue.push(taskId);
  if (!diyProcessing) processDiyQueue();
}

async function processDiyQueue() {
  if (diyProcessing || diyQueue.length === 0) return;
  diyProcessing = true;
  const taskId = diyQueue.shift()!;
  try {
    await runDiyGeneration(taskId);
  } catch (e) {
    console.error("[DIY] Queue error:", e);
  }
  diyProcessing = false;
  processDiyQueue();
}

async function runDiyGeneration(taskId: string) {
  const tasks = getDiyTasks();
  const task = tasks[taskId];
  if (!task) return;

  const taskDir = path.join(DIY_TASKS_DIR, taskId);
  const photoPath = path.join(taskDir, "photo.jpg");

  function updateTask(partial: Partial<DiyTask>) {
    const tasks = getDiyTasks();
    if (!tasks[taskId]) return;
    Object.assign(tasks[taskId], partial, { updatedAt: new Date().toISOString() });
    saveDiyTasks(tasks);
  }

  updateTask({ status: "processing", stage: "describe", message: "Identifying subject..." });

  try {
    const manifest = await generatePetAssets(photoPath, taskDir, (stage, progress, message) => {
      let diyStage: DiyTask["stage"] = "describe";
      if (stage === "vision") diyStage = "describe";
      else if (stage === "seedream") diyStage = "seedream";
      else if (stage === "seedance") diyStage = "seedance";
      else if (stage === "matting") diyStage = "matting";

      updateTask({ stage: diyStage, progress, message });
    });

    const mattedDir = path.join(taskDir, "matted");
    const states = fs.existsSync(mattedDir)
      ? fs.readdirSync(mattedDir).filter(f => f.endsWith(".webm")).map(f => f.replace(".webm", ""))
      : [];

    updateTask({
      status: "done",
      stage: "complete",
      progress: 1,
      message: "Complete!",
      result: { states },
    });
  } catch (err: any) {
    console.error("[DIY] Generation failed for task", taskId, err);
    updateTask({
      status: "failed",
      message: err.message || String(err),
      error: err.message || String(err),
    });
  }
}

// POST /api/diy/generate
app.post("/api/diy/generate", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const taskId = generateTaskId();
  const taskDir = path.join(DIY_TASKS_DIR, taskId);
  fs.mkdirSync(taskDir, { recursive: true });

  const diyUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, taskDir),
      filename: (_req, _file, cb) => cb(null, "photo.jpg"),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
  }).single("photo");

  diyUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: "Upload failed: " + err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No photo uploaded" });
    }

    const name = (req.body?.name || "").trim();
    if (!name) {
      try { fs.unlinkSync(path.join(taskDir, "photo.jpg")); } catch {}
      return res.status(400).json({ error: "Name is required" });
    }

    // Check task limit per user
    const tasks = getDiyTasks();
    const userTasks = Object.values(tasks).filter(t => t.userId === user.id);
    if (userTasks.length >= 5) {
      try { fs.rmSync(taskDir, { recursive: true, force: true }); } catch {}
      return res.status(429).json({ error: "Maximum 5 tasks allowed per user" });
    }

    const now = new Date().toISOString();
    const newTask: DiyTask = {
      id: taskId,
      userId: user.id,
      username: user.username,
      status: "pending",
      stage: "queued",
      progress: 0,
      message: "Queued",
      avatarName: name,
      createdAt: now,
      updatedAt: now,
    };
    tasks[taskId] = newTask;
    saveDiyTasks(tasks);

    enqueueDiy(taskId);
    res.json({ taskId, status: "pending" });
  });
});

// GET /api/diy/tasks
app.get("/api/diy/tasks", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const tasks = getDiyTasks();
  const userTasks = Object.values(tasks)
    .filter(t => t.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json(userTasks);
});

// GET /api/diy/tasks/:taskId
app.get("/api/diy/tasks/:taskId", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const tasks = getDiyTasks();
  const task = tasks[req.params.taskId];
  if (!task || task.userId !== user.id) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(task);
});

// GET /api/diy/tasks/:taskId/download
app.get("/api/diy/tasks/:taskId/download", (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const tasks = getDiyTasks();
  const task = tasks[req.params.taskId];
  if (!task || task.userId !== user.id) {
    return res.status(404).json({ error: "Task not found" });
  }
  if (task.status !== "done") {
    return res.status(400).json({ error: "Task not complete" });
  }

  const taskDir = path.join(DIY_TASKS_DIR, task.id);
  const mattedDir = path.join(taskDir, "matted");
  if (!fs.existsSync(mattedDir)) {
    return res.status(404).json({ error: "No output files" });
  }

  // Use tar since archiver may not have types
  const { execSync } = require("child_process");
  const tarName = `diy_${task.id}.tar.gz`;
  const tarPath = path.join(taskDir, tarName);

  try {
    // Create manifest.json
    const manifestPath = path.join(mattedDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      name: task.avatarName,
      states: task.result?.states || [],
      createdAt: task.createdAt,
    }, null, 2));

    execSync(`tar -czf ${tarPath} -C ${mattedDir} .`);
    res.setHeader("Content-Disposition", `attachment; filename="${tarName}"`);
    res.setHeader("Content-Type", "application/gzip");
    const stream = fs.createReadStream(tarPath);
    stream.pipe(res);
    stream.on("end", () => {
      try { fs.unlinkSync(tarPath); } catch {}
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create archive: " + e.message });
  }
});

// GET /api/diy/tasks/:taskId/preview/:filename
app.get("/api/diy/tasks/:taskId/preview/:filename", (req, res) => {
  const filename = req.params.filename;
  if (!filename.match(/^[\w\-]+\.webm$/)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const filePath = path.join(DIY_TASKS_DIR, req.params.taskId, "matted", filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  res.setHeader("Content-Type", "video/webm");
  fs.createReadStream(filePath).pipe(res);
});

// Serve DIY WebUI
app.use("/diy", express.static(path.join(__dirname, "static", "diy")));

// ---- Serve frontend ----
const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { etag: false, maxAge: 0, setHeaders: (res: any) => { res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); res.setHeader("Pragma", "no-cache"); res.setHeader("Expires", "0"); } }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// ---- Start ----
function main() {
  const port = parseInt(process.env.PORT || String(SERVER_PORT), 10);
  const host = process.env.HOST || SERVER_HOST;

  // Ensure directories
  fs.mkdirSync(PETS_BASE_DIR, { recursive: true });

  migrateExistingPets();
  server.listen(port, host, () => {
    console.log(`Desktop Pet Backend starting on ${host}:${port}`);
  });
}

main();
