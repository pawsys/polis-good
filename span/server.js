const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./db');
const { createCore, UserError } = require('./core');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };

function createServer(core) {
  const routes = [];
  const route = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler, opts });
  };

  const needUser = { user: true };

  route('POST', '/api/session', ({ body }) => {
    const user = core.createUser({ name: body.name, email: body.email, isAi: false });
    return { token: user.token, user: core.publicUser(user) };
  });
  // AI agents register once, then use the same API as people. They are labelled as AI everywhere.
  route('POST', '/api/agents', ({ body }) => {
    const user = core.createUser({ name: body.name || 'Unnamed agent', isAi: true });
    return { token: user.token, user: core.publicUser(user), usage: 'Send the token as "Authorization: Bearer <token>". See /api for endpoints.' };
  });
  route('GET', '/api/me', ({ user }) => ({ user: core.publicUser(user) }), needUser);
  route('PATCH', '/api/me', ({ user, body }) => ({ user: core.publicUser(core.updateUser(user, body)) }), needUser);

  route('GET', '/api/polls', () => ({ polls: core.listPolls() }));
  route('POST', '/api/polls', ({ user, body }) => ({ poll: core.pollSummary(core.createPoll(user, body)) }), needUser);
  route('GET', '/api/polls/:id', ({ params }) => {
    const poll = core.getPoll(params.id);
    if (!poll) throw new UserError('This poll does not exist.', 404);
    return { poll: core.pollSummary(poll) };
  });
  route('GET', '/api/polls/:id/next', ({ user, params }) => core.nextStatement(user, params.id), needUser);
  route('POST', '/api/polls/:id/votes', ({ user, params, body }) => {
    core.castVote(user, params.id, body.statementId, body.vote);
    return { ok: true, ...core.nextStatement(user, params.id) };
  }, needUser);
  route('POST', '/api/polls/:id/statements', ({ user, params, body }) => ({ statement: core.addStatement(user, params.id, body.text) }), needUser);
  route('GET', '/api/polls/:id/results', ({ user, params }) => core.results(params.id, user));

  route('GET', '/api/dev/outbox', () => ({ emails: core.outbox() }));

  const page = (file) => (_ctx, res) => sendFile(res, path.join(PUBLIC, file));
  route('GET', '/', page('index.html'));
  route('GET', '/p/:id', page('poll.html'));
  route('GET', '/embed/:id', page('poll.html'));
  route('GET', '/api', page('api.html'));
  route('GET', '/dev/outbox', page('outbox.html'));

  function sendFile(res, file) {
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    });
  }

  function sendJson(res, status, obj) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 64 * 1024) { reject(new UserError('Request too large.', 413)); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed && typeof parsed === 'object' ? parsed : {});
        } catch { reject(new UserError('Body must be JSON.')); }
      });
      req.on('error', reject);
    });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const isApi = url.pathname.startsWith('/api/');
    if (isApi) {
      // The JSON API is open to other origins so embeds and AI agents can use it. Auth is by bearer token, not cookies.
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', 'content-type, authorization');
      res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    }
    try {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const auth = req.headers.authorization || '';
        const user = core.userByToken(auth.startsWith('Bearer ') ? auth.slice(7) : null);
        if (r.opts.user && !user) throw new UserError('Start a session first: POST /api/session.', 401);
        const body = req.method === 'GET' ? {} : await readBody(req);
        const out = await r.handler({ params, body, user, url }, res);
        if (out !== undefined) sendJson(res, 200, out);
        return;
      }
      if (req.method === 'GET' && !isApi) {
        const file = path.normalize(path.join(PUBLIC, url.pathname));
        if (file.startsWith(PUBLIC + path.sep)) return sendFile(res, file);
      }
      sendJson(res, 404, { error: 'Not found.' });
    } catch (err) {
      if (err instanceof UserError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      sendJson(res, 500, { error: 'Something broke on our side.' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4100;
  const core = createCore(openDb());
  createServer(core).listen(port, () => console.log(`Span is running at http://localhost:${port}`));
  setInterval(() => { try { core.tick(); } catch (e) { console.error(e); } }, 60 * 1000).unref();
  core.tick();
}

module.exports = { createServer };
