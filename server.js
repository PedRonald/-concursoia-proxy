const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ── API KEY ──────────────────────────────────────────────
// Coloque sua key da DeepSeek aqui OU use variável de ambiente:
//   Windows: set DEEPSEEK_API_KEY=sk-xxxx
//   Linux/Mac: export DEEPSEEK_API_KEY=sk-xxxx
//   Railway/Render: adicione DEEPSEEK_API_KEY nas env vars do painel
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-COLOQUE-SUA-KEY-AQUI';

if (DEEPSEEK_API_KEY === 'sk-COLOQUE-SUA-KEY-AQUI') {
  console.warn('⚠️  ATENÇÃO: Configure a variável DEEPSEEK_API_KEY antes de usar!');
  console.warn('   Windows: set DEEPSEEK_API_KEY=sk-xxxx && node server.js');
  console.warn('   Linux:   DEEPSEEK_API_KEY=sk-xxxx node server.js');
}

const server = http.createServer(async (req, res) => {
  // ── CORS ─────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Health check ──────────────────────────────────────
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // ── Proxy para DeepSeek ───────────────────────────────
  // Aceita ambas as rotas:
  //   /api/chat  — legacy (versão anterior do app)
  //   /chat      — atual (Firebase Functions compatível)
  if (req.method === 'POST' && (req.url === '/api/chat' || req.url === '/chat')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);

        // Compatibilidade: aceita _apiKey do body (HTML) ou usa a do env (Android)
        const apiKey = payload._apiKey || DEEPSEEK_API_KEY;
        delete payload._apiKey;

        const postData = JSON.stringify(payload);
        const isStream = payload.stream === true;

        const options = {
          hostname: 'api.deepseek.com',
          path: '/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const proxyReq = https.request(options, (proxyRes) => {
          if (isStream) {
            // Streaming: repassa SSE diretamente
            res.writeHead(proxyRes.statusCode, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
          } else {
            res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          }
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (e) => {
          console.error('Erro proxy:', e.message);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ error: { message: e.message } }));
        });

        proxyReq.write(postData);
        proxyReq.end();

      } catch(e) {
        console.error('Erro parse:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    });
    return;
  }

  // ── Servir arquivos estáticos ─────────────────────────
  let filePath = path.join(__dirname, req.url === '/' ? 'concurso-ia-v3.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css'
    }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`✅ ConCurso.IA proxy rodando em http://localhost:${PORT}`);
  console.log(`   API Key configurada: ${DEEPSEEK_API_KEY !== 'sk-COLOQUE-SUA-KEY-AQUI' ? '✅ Sim' : '❌ NÃO - configure DEEPSEEK_API_KEY'}`);
  console.log('');
  console.log('   ℹ️  Para desenvolvimento local apenas.');
  console.log('   Em produção, a Firebase Cloud Function (functions/index.js) substitui este servidor.');
  console.log('   A API key NUNCA deve ser exposta no cliente Android.');
});
