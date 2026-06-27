const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY_BYTES = 1024 * 32;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STATS_FILE = process.env.STATS_FILE || path.join(DATA_DIR, 'scan-stats.json');
const STATS_TIME_ZONE = process.env.STATS_TIME_ZONE || 'Asia/Shanghai';

loadDotEnv(path.join(ROOT, '.env'));

const PROGRAMS = {
  EMIF: {
    name: '高级国际金融硕士',
    tags: '#金融硕士 #金融'
  },
  EMAP: {
    name: '应用心理学管理硕士',
    tags: '#心理学硕士 #心理学'
  },
  EMLF: {
    name: '奢侈品与时尚管理硕士',
    tags: '#奢侈品与时尚管理硕士 #时尚管理硕士'
  },
  EMEM: {
    name: '教育管理硕士',
    tags: '#教育管理硕士 #教育管理'
  }
};

const MODES = {
  opening: '开学典礼',
  graduation: '毕业典礼'
};

const GENERAL_TAGS = '#巴黎商学院 #布克在职研 #布克硕博 #在职研究生 #在职硕士';

const AI_PROMPT_RULES = [
  '标题控制在18-20个字之间。',
  '正文必须是小红书风格、真实学员视角。',
  '根据用户选择的开学典礼或毕业典礼输出对应场景文案。',
  '正文控制在250-300字之间，并明确提及学制1年。',
  '不得提及身在法国巴黎、去巴黎、塞纳河畔、上海等地点表达，只写参加典礼。',
  '内容保持真实，只使用巴黎商学院给定事实。',
  '必须带通用标签和所选专业对应标签。'
];

const PSB_FACTS = [
  '巴黎商学院（Paris School of Business, 简称PSB）是一所国家认可的法国商科管理学院。',
  '巴黎商学院成立于1974年，是法国精英制商学院大学校联盟成员之一。',
  '巴黎商学院同时拥有AACSB、EQUIS、AMBA三大认证。',
  '巴黎商学院在法国《费加罗报》全法商学院排名第4位。',
  '巴黎商学院在法国《巴黎人报》全法POST-BAC项目排名全法第4位。',
  '项目为线上学习的在职硕士，学制1年。'
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/scan') {
      return handleScan(req, res, url);
    }

    if (req.method === 'GET' && url.pathname === '/api/scan-stats') {
      return handleScanStats(req, res, url);
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      return handleGenerate(req, res);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    }

    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: 'SERVER_ERROR' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PSB check-in copywriter running on http://${HOST}:${PORT}`);
});

function handleScan(req, res, url) {
  try {
    recordScan(url);
  } catch (err) {
    console.error('Failed to record scan:', err);
  }

  const target = normalizeRedirectPath(url.searchParams.get('to')) || '/';
  res.writeHead(302, {
    Location: target,
    'Cache-Control': 'no-store'
  });
  res.end();
}

function handleScanStats(req, res, url) {
  if (!isStatsRequestAuthorized(req, url)) {
    return sendJson(res, 401, { error: 'UNAUTHORIZED' });
  }

  const stats = readScanStats();
  const todayKey = getDateKey();
  return sendJson(res, 200, {
    total: stats.total,
    today: stats.byDate[todayKey] || 0,
    todayKey,
    timeZone: STATS_TIME_ZONE,
    byDate: stats.byDate,
    byCampaign: stats.byCampaign,
    lastScannedAt: stats.lastScannedAt,
    updatedAt: stats.updatedAt
  });
}

async function handleGenerate(req, res) {
  if (!process.env.ARK_API_KEY || !process.env.ARK_MODEL) {
    return sendJson(res, 503, {
      error: 'ARK_NOT_CONFIGURED',
      message: 'Please set ARK_API_KEY and ARK_MODEL.'
    });
  }

  const body = await readJsonBody(req);
  const mode = body.mode;
  const program = body.program;

  if (!MODES[mode] || !PROGRAMS[program]) {
    return sendJson(res, 400, { error: 'INVALID_SELECTION' });
  }

  try {
    const content = await callArk(buildPrompt(mode, program));
    return sendJson(res, 200, { content, source: 'ark' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 502, {
      error: 'ARK_REQUEST_FAILED',
      message: 'Ark API request failed.'
    });
  }
}

function buildPrompt(mode, program) {
  const programInfo = PROGRAMS[program];
  return [
    `为巴黎商学院PSB${programInfo.name}生成一篇${MODES[mode]}小红书打卡文案。`,
    ...AI_PROMPT_RULES.map((rule) => `- ${rule}`),
    `通用标签：${GENERAL_TAGS}`,
    `专业标签：${programInfo.tags}`,
    '可用事实：',
    ...PSB_FACTS.map((fact) => `- ${fact}`),
    '格式：第一行标题；第二行起正文；最后两行分别放通用标签和专业标签。不要解释，不要 Markdown。'
  ].join('\n');
}

async function callArk(prompt) {
  const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ARK_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.ARK_MODEL,
        messages: [
          {
            role: 'system',
            content: '你只按用户给定规则生成中文小红书文案。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.85,
        max_tokens: 700,
        thinking: {
          type: 'disabled'
        }
      })
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || data.message || response.statusText;
    throw new Error(`Ark API error: ${detail}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Ark API returned empty content.');
  }
  return String(content).trim();
}

function serveStatic(req, res, pathname) {
  const safePath = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, safePath);

  if (!target.startsWith(ROOT) || isHiddenOrIgnored(target)) {
    return sendText(res, 404, 'Not found');
  }

  let filePath = target;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendText(res, 404, 'Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function isHiddenOrIgnored(filePath) {
  const rel = path.relative(ROOT, filePath);
  const parts = rel.split(path.sep);
  return rel.startsWith('.') || parts.includes('node_modules') || parts.includes('data') || rel === 'server.js' || rel === 'package.json';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function recordScan(url) {
  const campaign = sanitizeCounterKey(url.searchParams.get('campaign') || 'default');
  const stats = readScanStats();
  const now = new Date().toISOString();
  const dateKey = getDateKey(new Date(now));

  stats.createdAt ||= now;
  stats.total = Number(stats.total || 0) + 1;
  stats.byDate[dateKey] = Number(stats.byDate[dateKey] || 0) + 1;
  stats.byCampaign[campaign] = Number(stats.byCampaign[campaign] || 0) + 1;
  stats.lastScannedAt = now;
  stats.updatedAt = now;

  writeScanStats(stats);
  return stats;
}

function readScanStats() {
  const fallback = {
    total: 0,
    byDate: {},
    byCampaign: {},
    createdAt: null,
    updatedAt: null,
    lastScannedAt: null
  };

  if (!fs.existsSync(STATS_FILE)) return fallback;

  try {
    const parsed = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    return {
      ...fallback,
      ...parsed,
      total: Number(parsed.total || 0),
      byDate: parsed.byDate && typeof parsed.byDate === 'object' ? parsed.byDate : {},
      byCampaign: parsed.byCampaign && typeof parsed.byCampaign === 'object' ? parsed.byCampaign : {}
    };
  } catch (err) {
    console.error('Failed to read scan stats:', err);
    return fallback;
  }
}

function writeScanStats(stats) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${STATS_FILE}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(stats, null, 2)}\n`);
  fs.renameSync(tempFile, STATS_FILE);
}

function getDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STATS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function sanitizeCounterKey(value) {
  const normalized = String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 64) || 'default';
}

function normalizeRedirectPath(value) {
  if (!value) return '/';
  const trimmed = String(value).trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
}

function isStatsRequestAuthorized(req, url) {
  const token = process.env.STATS_TOKEN;
  if (!token) return true;

  const queryToken = url.searchParams.get('token');
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return queryToken === token || bearerToken === token;
}
