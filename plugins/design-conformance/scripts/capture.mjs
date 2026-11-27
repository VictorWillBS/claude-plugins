#!/usr/bin/env node
// capture.mjs - renders the product-design boards and drives the app with Playwright.
//
// Every shot writes a PNG and a probe (visible texts, controls and icons with their box and
// computed style), so compare.mjs can measure the same screen on both sides. App flows run a
// small list of steps and record each step, the API traffic and the console, which is the
// evidence for flow and use-case findings. Writes to the API are blocked unless a mock answers
// them, their origin is in app.allowWritesTo (the project's local fake API) or the plan sets
// app.allowWrites.
//
// Usage: node capture.mjs <plan.json>   (format in skills/pixel-perfect/references/plan-format.md)

import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const FREEZE = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; '
  + 'animation-iteration-count: 1 !important; animation-fill-mode: both !important; transition: none !important; caret-color: transparent !important; }';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /pass|senha|token|secret|otp|code|codigo|cpf|document/i;
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const FONT_FAMILIES = { inter: 'Inter', 'jetbrains-mono': 'JetBrains Mono' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };

// Runs in the page. Returns what compare.mjs matches between design and app.
const PROBE = ({ clipW, clipH }) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
  const faded = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o < 0.05; };
  const inside = (b) => b.w > 1 && b.h > 1 && b.x < clipW && b.y < clipH && b.x + b.w > 0 && b.y + b.h > 0;
  const boxOf = (rects) => {
    const list = [...rects].filter((r) => r.width > 0 && r.height > 0);
    if (!list.length) return null;
    const l = Math.min(...list.map((r) => r.left)), t = Math.min(...list.map((r) => r.top));
    const r = Math.max(...list.map((q) => q.right)), b = Math.max(...list.map((q) => q.bottom));
    const centers = list.map((q) => (q.top + q.bottom) / 2).sort((a, c) => a - c);
    const lines = centers.filter((c, i) => i === 0 || c - centers[i - 1] > 6).length;
    return { x: Math.round((l + scrollX) * 10) / 10, y: Math.round((t + scrollY) * 10) / 10, w: Math.round((r - l) * 10) / 10, h: Math.round((b - t) * 10) / 10, lines };
  };
  const exempt = (el) => !!el.closest('[data-audit]');
  const textStyle = (cs) => ({
    fontFamily: (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim(),
    fontSize: px(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10), lineHeight: cs.lineHeight === 'normal' ? null : px(cs.lineHeight),
    letterSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing), color: cs.color, textTransform: cs.textTransform,
    textDecoration: cs.textDecorationLine, textAlign: cs.textAlign,
  });

  const texts = [];
  const groups = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!norm(n.nodeValue)) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
    if (!groups.has(el)) groups.set(el, []);
    groups.get(el).push(n);
  }
  for (const [el, nodes] of groups) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || faded(el)) continue;
    const range = document.createRange();
    range.setStartBefore(nodes[0]);
    range.setEndAfter(nodes[nodes.length - 1]);
    const box = boxOf(range.getClientRects());
    if (!box || !inside(box)) continue;
    texts.push({ text: norm(nodes.map((n) => n.nodeValue).join(' ')), box, style: textStyle(cs), exempt: exempt(el) });
  }

  // The area that really answers a tap: a control may draw a small box and extend its hit area
  // with a pseudo-element or a hidden child, so the box alone is not the touch target.
  const tapArea = (el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return null;
    const hits = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!hits(cx, cy)) return null;
    let top = cy, bottom = cy, left = cx, right = cx;
    while (top > Math.max(0, r.top - 30) && hits(cx, top - 1)) top -= 1;
    while (bottom < Math.min(innerHeight - 1, r.bottom + 30) && hits(cx, bottom + 1)) bottom += 1;
    while (left > Math.max(0, r.left - 30) && hits(left - 1, cy)) left -= 1;
    while (right < Math.min(innerWidth - 1, r.right + 30) && hits(right + 1, cy)) right += 1;
    return { w: Math.round(right - left + 1), h: Math.round(bottom - top + 1) };
  };

  const controls = [];
  const CONTROL ='button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=textbox], [role=combobox], [contenteditable=true]';
  for (const el of document.querySelectorAll(CONTROL)) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || faded(el)) continue;
    const box = boxOf([el.getBoundingClientRect()]);
    if (!box || !inside(box)) continue;
    const labelled = el.getAttribute('aria-labelledby');
    const labelText = labelled ? labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ') : '';
    const forLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
    const name = norm(el.getAttribute('aria-label') || labelText || forLabel || el.closest('label')?.textContent || el.getAttribute('placeholder') || el.textContent || el.getAttribute('title')).slice(0, 80);
    controls.push({
      role: el.getAttribute('role') || ({ A: 'link', BUTTON: 'button', INPUT: 'textbox', TEXTAREA: 'textbox', SELECT: 'combobox' }[el.tagName] || el.tagName.toLowerCase()),
      name, box, tap: tapArea(el), disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true', exempt: exempt(el),
      style: { backgroundColor: cs.backgroundColor, color: cs.color, borderRadius: px(cs.borderTopLeftRadius), borderWidth: px(cs.borderTopWidth), borderColor: cs.borderTopColor },
    });
  }

  const icons = [];
  for (const el of document.querySelectorAll('img, svg, [role=img]')) {
    if (el.parentElement?.closest('svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || faded(el)) continue;
    const box = boxOf([el.getBoundingClientRect()]);
    if (!box || !inside(box)) continue;
    icons.push({ kind: el.tagName.toLowerCase(), name: norm(el.getAttribute('alt') || el.getAttribute('aria-label') || el.querySelector?.('title')?.textContent || ''), box, exempt: exempt(el) });
  }
  // Full-width blocks touching the top or the bottom edge: on a phone board, the status bar and the
  // home indicator, whose heights are the safe area the app must be given (flow.safeArea).
  const edges = { top: new Set(), bottom: new Set() };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < clipW - 1 || r.height < 8 || r.height > 120) continue;
    if (Math.abs(r.top) < 1) edges.top.add(Math.round(r.height));
    if (Math.abs(r.bottom - clipH) < 1) edges.bottom.add(Math.round(r.height));
  }
  return { size: { w: clipW, h: clipH }, texts, controls, icons, edges: { top: [...edges.top].sort((a, b) => a - b), bottom: [...edges.bottom].sort((a, b) => a - b) } };
};

function fail(message) {
  console.error(`capture: ${message}`);
  process.exit(2);
}

function readPlan(file) {
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!plan.out) fail('plan.out é obrigatório');
  const ids = [...(plan.designShots || []).map((s) => s.id), ...(plan.flows || []).map((f) => f.id)];
  for (const id of ids) if (!ID_RE.test(id || '')) fail(`id inválido: ${id}`);
  if (new Set(ids).size !== ids.length) fail('ids repetidos no plano');
  if ((plan.designShots || []).length && !plan.design?.artifact) fail('design.artifact é obrigatório quando há designShots');
  if ((plan.flows || []).length && !plan.app?.baseURL) fail('app.baseURL é obrigatório quando há flows');
  return plan;
}

// A board for one state of a screen component, in the same shape the canvas build writes, so a state
// that only appears inside a gallery board can be rendered alone at the screen size.
function wrapperHtml({ component, props = {}, theme = 'light' }, w, h) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const attrs = Object.entries(props).map(([k, v]) => `${kebab(k)}="${esc(v)}"`).join(' ');
  const dataProps = esc(JSON.stringify({ theme: { editor: 'enum', options: ['light', 'dark'], default: theme }, $preview: { width: w, height: h } }));
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>body{margin:0}</style></helmet>
<div style="width: ${w}px; height: ${h}px; overflow: hidden; background: #FFFFFF; font-family: Inter, system-ui, sans-serif; color: #262422">
  <dc-import name="${esc(component)}" theme="{{ theme }}" ${attrs} hint-size="${w}px,${h}px"></dc-import>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="${dataProps}">
class Component extends DCLogic {
  renderVals() { return { theme: this.props.theme || '${theme}' }; }
}
</script>
</body>
</html>`;
}

// Serves canvas/<product>/artifact with support.js and the fonts of tools/qa/assets, like tools/qa/serve.sh.
function serveDesign(artifact, support, wrappers) {
  const roots = [artifact];
  const fontsDir = support ? path.join(support, 'fonts') : null;
  const within = (root, rel) => { const f = path.join(root, rel); return f.startsWith(root + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (wrappers.has(rel)) { res.writeHead(200, { 'content-type': TYPES['.html'] }); res.end(wrappers.get(rel)); return; }
    let file = null;
    if (support && rel === 'support.js') file = path.join(support, 'support.js');
    else if (fontsDir && rel.startsWith('fonts/')) file = within(fontsDir, rel.slice(6));
    else for (const root of roots) { file = within(root, rel); if (file) break; }
    if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (file.endsWith('.html') && url.searchParams.get('theme') === 'dark') {
      body = Buffer.from(body.toString('utf8').replaceAll('&quot;default&quot;:&quot;light&quot;', '&quot;default&quot;:&quot;dark&quot;').replaceAll('"default":"light"', '"default":"dark"'));
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function fontFaces(support) {
  const dir = support ? path.join(support, 'fonts') : null;
  if (!dir || !fs.existsSync(dir)) return '';
  return fs.readdirSync(dir).map((name) => {
    const m = name.match(/^(.+?)-(latin|latin-ext)-(\d{3})-(normal|italic)\.woff2$/);
    if (!m) return '';
    const family = FONT_FAMILIES[m[1]] || m[1];
    const range = m[2] === 'latin-ext' ? 'unicode-range:U+0100-024F,U+1E00-1EFF;' : '';
    return `@font-face{font-family:'${family}';font-weight:${m[3]};font-style:${m[4]};src:url(/fonts/${name}) format('woff2');${range}}`;
  }).join('');
}

async function settle(page, ms) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
  await page.waitForTimeout(ms);
}

async function shoot(page, out, id, { fullPage = false, clip } = {}) {
  await page.mouse.move(0, 0).catch(() => {});
  await page.addStyleTag({ content: FREEZE }).catch(() => {});
  await page.waitForTimeout(100);
  const png = path.join(out, 'shots', `${id}.png`);
  const vp = page.viewportSize();
  const height = fullPage ? await page.evaluate(() => document.documentElement.scrollHeight) : vp.height;
  const clipBox = clip || { w: vp.width, h: height };
  await page.screenshot({ path: png, fullPage, animations: 'disabled', caret: 'hide' });
  const probe = await page.evaluate(PROBE, { clipW: clipBox.w, clipH: clipBox.h });
  const probePath = path.join(out, 'shots', `${id}.json`);
  fs.writeFileSync(probePath, JSON.stringify(probe, null, 1));
  return { png: path.relative(out, png), probe: path.relative(out, probePath) };
}

function boardSize(artifact, board) {
  const canvas = JSON.parse(fs.readFileSync(path.join(artifact, 'canvas.json'), 'utf8'));
  const info = canvas.boards?.[board];
  if (!info) throw new Error(`quadro ${board} não está em canvas.json`);
  return [info.w, info.h];
}

async function captureDesign(browser, plan, entries) {
  const { artifact, support } = plan.design;
  const wrappers = new Map();
  const { server, port } = await serveDesign(path.resolve(artifact), support ? path.resolve(support) : null, wrappers);
  const faces = fontFaces(support);
  try {
    for (const shot of plan.designShots) {
      const entry = { id: shot.id, side: 'design', board: shot.board, component: shot.component, props: shot.props, theme: shot.theme || 'light' };
      let page = null;
      try {
        if (shot.component && !shot.viewport) throw new Error('quadro de componente precisa de viewport');
        if (shot.component && !fs.existsSync(path.join(artifact, `${shot.component}.dc.html`))) throw new Error(`componente ${shot.component} não existe no canvas`);
        if (!shot.component && !shot.board) throw new Error('print de design precisa de board ou component');
        const [w, h] = shot.viewport || boardSize(artifact, shot.board);
        entry.viewport = [w, h];
        let file = shot.board;
        if (shot.component) {
          file = `__wrap-${shot.id}.dc.html`;
          wrappers.set(file, wrapperHtml(shot, w, h));
        }
        page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: plan.scale || 1 });
        entry.errors = [];
        page.on('pageerror', (e) => entry.errors.push(String(e).slice(0, 200)));
        const url = `http://127.0.0.1:${port}/${file}${shot.theme === 'dark' && !shot.component ? '?theme=dark' : ''}`;
        await page.goto(url);
        await page.waitForTimeout(w * h > 4e6 ? 3500 : 1500);
        if (faces) await page.addStyleTag({ content: faces });
        await settle(page, 200);
        Object.assign(entry, await shoot(page, plan.out, shot.id, { clip: { w, h } }));
      } catch (e) {
        entry.exception = String(e).slice(0, 300);
      }
      entries.push(entry);
      if (page) await page.close();
      console.log(`design ${shot.id}: ${entry.exception ? 'falhou' : 'ok'}`);
    }
  } finally {
    server.close();
  }
}

function resolveValue(value, secrets) {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  const name = value.slice(1);
  if (!(name in process.env)) throw new Error(`variável de ambiente ${name} não definida`);
  secrets.set(process.env[name], value);
  return process.env[name];
}

function scrub(text, secrets) {
  let out = String(text ?? '');
  for (const [secret, label] of secrets) if (secret) out = out.split(secret).join(label);
  return out;
}

function redactBody(body, secrets) {
  if (!body) return null;
  try {
    const walk = (v) => (Array.isArray(v) ? v.map(walk) : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SENSITIVE_KEY.test(k) && typeof x !== 'object' ? '***' : walk(x)])) : v);
    return walk(JSON.parse(body));
  } catch {
    return scrub(body, secrets).slice(0, 300);
  }
}

function locator(page, target) {
  if (typeof target === 'string') return page.getByText(target, { exact: true });
  const opts = target.exact === false ? {} : { exact: true };
  let loc;
  if (target.role) loc = page.getByRole(target.role, target.name ? { name: target.name, ...opts } : {});
  else if (target.label) loc = page.getByLabel(target.label, opts);
  else if (target.placeholder) loc = page.getByPlaceholder(target.placeholder, opts);
  else if (target.text) loc = page.getByText(target.text, opts);
  else if (target.testId) loc = page.getByTestId(target.testId);
  else if (target.css) loc = page.locator(target.css);
  else throw new Error(`alvo sem seletor: ${JSON.stringify(target)}`);
  return target.nth !== undefined ? loc.nth(target.nth) : loc;
}

function urlMatches(current, expected, baseURL) {
  const here = new URL(current);
  if (expected.startsWith('/')) {
    const want = new URL(expected, baseURL);
    const pattern = new RegExp(`^${want.pathname.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*')}/?$`);
    return pattern.test(here.pathname) && (!want.search || here.search === want.search);
  }
  return new RegExp(expected).test(current);
}

async function runStep(page, step, ctx) {
  const [kind] = Object.keys(step).filter((k) => !['optional', 'timeout', 'note'].includes(k));
  const arg = step[kind];
  const timeout = step.timeout;
  switch (kind) {
    case 'goto': await page.goto(new URL(arg, ctx.baseURL).href); await settle(page, ctx.settle); return null;
    case 'click': await locator(page, arg).click({ timeout }); await settle(page, ctx.settle); return null;
    case 'fill': await locator(page, arg).fill(String(resolveValue(arg.value, ctx.secrets)), { timeout }); return null;
    case 'type': await locator(page, arg).pressSequentially(String(resolveValue(arg.value, ctx.secrets)), { timeout, delay: 20 }); return null;
    case 'press': if (typeof arg === 'string') await page.keyboard.press(arg); else await locator(page, arg).press(arg.key, { timeout }); await settle(page, ctx.settle); return null;
    case 'check': await locator(page, arg).check({ timeout }); return null;
    case 'select': await locator(page, arg).selectOption(String(resolveValue(arg.value, ctx.secrets)), { timeout }); return null;
    case 'hover': await locator(page, arg).hover({ timeout }); return null;
    case 'focus': await locator(page, arg).focus({ timeout }); return null;
    case 'scroll': await page.evaluate((y) => window.scrollTo(0, y), arg); await page.waitForTimeout(200); return null;
    case 'wait': await page.waitForTimeout(arg); return null;
    case 'advanceTime':
      if (!ctx.fakeTimers) throw new Error('advanceTime exige fakeTimers: true no fluxo');
      await page.clock.runFor(arg); await page.waitForTimeout(200); return null;
    case 'back': await page.goBack(); await settle(page, ctx.settle); return null;
    case 'reload': await page.reload(); await settle(page, ctx.settle); return null;
    case 'offline': await page.context().setOffline(Boolean(arg)); return null;
    case 'waitForURL': await page.waitForURL((u) => urlMatches(u.href, arg, ctx.baseURL), { timeout: timeout || 10000 }); return null;
    case 'expectURL':
      if (!urlMatches(page.url(), arg, ctx.baseURL)) throw new Error(`esperava a rota ${arg}, está em ${new URL(page.url()).pathname}`);
      return null;
    case 'expectVisible': await locator(page, arg).first().waitFor({ state: 'visible', timeout: timeout || 5000 }); return null;
    case 'expectHidden': await locator(page, arg).first().waitFor({ state: 'hidden', timeout: timeout || 5000 }); return null;
    case 'expectText': await page.getByText(arg, { exact: false }).first().waitFor({ state: 'visible', timeout: timeout || 5000 }); return null;
    case 'expectRequest': {
      const hit = ctx.requests.find((r) => r.method === (arg.method || 'GET').toUpperCase() && new RegExp(arg.url).test(r.url));
      if (!hit) throw new Error(`nenhuma requisição ${arg.method || 'GET'} ${arg.url}`);
      return null;
    }
    case 'saveStorageState': await page.context().storageState({ path: arg }); return null;
    case 'shot': {
      const id = typeof arg === 'string' ? arg : arg.id;
      if (!ID_RE.test(id)) throw new Error(`id de print inválido: ${id}`);
      const files = await shoot(page, ctx.out, id, { fullPage: typeof arg === 'object' && arg.fullPage });
      ctx.shots.push({ id, side: 'app', flow: ctx.flowId, step: ctx.index, url: new URL(page.url()).pathname, theme: ctx.theme, viewport: ctx.viewport, ...files });
      return id;
    }
    default: throw new Error(`passo desconhecido: ${kind}`);
  }
}

async function installRoutes(context, flow, plan, flags) {
  const blocked = [];
  const writableOrigins = new Set((plan.app.allowWritesTo || []).map((o) => new URL(o).origin));
  if (!plan.app.allowWrites) {
    await context.route('**/*', (route) => {
      const req = route.request();
      if (WRITE_METHODS.has(req.method()) && ['fetch', 'xhr'].includes(req.resourceType()) && !writableOrigins.has(new URL(req.url()).origin)) {
        flags.set(req, 'blocked');
        blocked.push(`${req.method()} ${req.url()}`);
        return route.abort('blockedbyclient');
      }
      return route.fallback();
    });
  }
  for (const rule of [...(plan.app.requestHeaders || []), ...(flow.requestHeaders || [])]) {
    await context.route(rule.url, (route) => route.fallback({ headers: { ...route.request().headers(), ...rule.headers } }));
  }
  for (const mock of [...(plan.app.mocks || []), ...(flow.mocks || [])]) {
    const responses = mock.responses || [mock];
    let calls = 0;
    await context.route(mock.url, (route) => {
      const req = route.request();
      const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true' };
      if (req.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*' } });
      }
      if (mock.method && req.method() !== mock.method.toUpperCase()) return route.fallback();
      const r = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      flags.set(req, 'mocked');
      const body = r.json !== undefined ? JSON.stringify(r.json) : r.body || '';
      const headers = { 'content-type': r.json !== undefined ? 'application/json' : 'text/plain', ...cors, 'access-control-expose-headers': '*', ...(r.headers || {}) };
      const fulfil = () => route.fulfill({ status: r.status || 200, headers, body });
      return r.delay ? new Promise((ok) => setTimeout(() => ok(fulfil()), r.delay)) : fulfil();
    });
  }
  return blocked;
}

async function captureFlows(browser, plan, entries, flowsOut) {
  for (const flow of plan.flows) {
    const [w, h] = flow.viewport;
    const theme = flow.theme || 'light';
    const context = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: plan.scale || 1, colorScheme: theme, hasTouch: w < 768,
      locale: plan.app.locale || 'pt-BR', timezoneId: plan.app.timezoneId || 'America/Sao_Paulo',
      storageState: flow.storageState && fs.existsSync(flow.storageState) ? flow.storageState : undefined,
    });
    context.setDefaultTimeout(flow.timeout || 10000);
    const storage = { ...(plan.app.localStorage || {}), ...(flow.localStorage || {}) };
    if (Object.keys(storage).length) {
      await context.addInitScript((entries) => { for (const [k, v] of Object.entries(entries)) window.localStorage.setItem(k, v); }, storage);
    }
    const flags = new WeakMap();
    const blocked = await installRoutes(context, flow, plan, flags);
    const page = await context.newPage();
    if (flow.fakeTimers) await page.clock.install(flow.clock ? { time: new Date(flow.clock) } : {});
    else if (flow.clock) await page.clock.setFixedTime(new Date(flow.clock));
    const safeArea = flow.safeArea || plan.app.safeArea;
    if (safeArea) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0, ...safeArea } });
    }
    const secrets = new Map();
    const requests = [];
    const byRequest = new Map();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(scrub(m.text(), secrets).slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push(scrub(String(e), secrets).slice(0, 300)));
    page.on('request', (r) => {
      if (!['fetch', 'xhr'].includes(r.resourceType())) return;
      const entry = { method: r.method(), url: scrub(r.url(), secrets), status: null, request: r };
      requests.push(entry);
      byRequest.set(r, entry);
    });
    page.on('response', (resp) => { const e = byRequest.get(resp.request()); if (e) e.status = resp.status(); });
    page.on('requestfailed', (r) => { const e = byRequest.get(r); if (e) e.failure = r.failure()?.errorText; });

    const ctx = { baseURL: plan.app.baseURL, out: plan.out, secrets, requests, shots: [], flowId: flow.id, theme, viewport: [w, h], settle: plan.app.settleMs ?? 400, index: 0, fakeTimers: Boolean(flow.fakeTimers) };
    const steps = [];
    let failed = false;
    for (const [index, step] of flow.steps.entries()) {
      ctx.index = index;
      const started = Date.now();
      const record = { i: index, step: JSON.parse(scrub(JSON.stringify(step), secrets)), ok: true };
      try {
        await runStep(page, step, ctx);
      } catch (e) {
        record.ok = false;
        record.error = scrub(String(e.message || e), secrets).split('\n')[0].slice(0, 300);
      }
      record.url = new URL(page.url() === 'about:blank' ? plan.app.baseURL : page.url()).pathname;
      record.ms = Date.now() - started;
      steps.push(record);
      if (!record.ok && !step.optional) {
        failed = true;
        const id = `${flow.id}__fail`;
        const files = await shoot(page, plan.out, id).catch(() => null);
        if (files) ctx.shots.push({ id, side: 'app', flow: flow.id, step: index, url: record.url, theme, viewport: [w, h], failure: true, ...files });
        break;
      }
    }
    for (const r of requests) {
      r.flag = flags.get(r.request) || null;
      r.body = redactBody(r.request.postData(), secrets);
      delete r.request;
    }
    flowsOut.push({ id: flow.id, viewport: [w, h], theme, ok: !failed, steps, requests, blockedWrites: blocked.map((b) => scrub(b, secrets)), consoleErrors });
    entries.push(...ctx.shots);
    console.log(`fluxo ${flow.id}: ${failed ? 'parou no passo ' + steps[steps.length - 1].i : 'ok'} (${ctx.shots.length} prints)`);
    await context.close();
  }
}

function merge(existing, fresh, key = 'id') {
  const ids = new Set(fresh.map((x) => x[key]));
  return [...existing.filter((x) => !ids.has(x[key])), ...fresh];
}

async function main() {
  const planFile = process.argv[2];
  if (!planFile) fail('uso: node capture.mjs <plan.json>');
  const plan = readPlan(planFile);
  plan.out = path.resolve(plan.out);
  fs.mkdirSync(path.join(plan.out, 'shots'), { recursive: true });
  const browser = await chromium.launch({ headless: plan.headless !== false });
  const shots = [];
  const flows = [];
  try {
    if (plan.designShots?.length) await captureDesign(browser, plan, shots);
    if (plan.flows?.length) await captureFlows(browser, plan, shots, flows);
  } finally {
    await browser.close();
  }
  const indexFile = path.join(plan.out, 'capture.json');
  const previous = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { shots: [], flows: [] };
  const index = { updated: new Date().toISOString(), shots: merge(previous.shots, shots), flows: merge(previous.flows, flows) };
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
  const broken = shots.filter((s) => s.exception);
  console.log(`capture.json: ${shots.length} prints, ${flows.length} fluxos${broken.length ? `, ${broken.length} com falha` : ''}`);
  process.exit(broken.length ? 1 : 0);
}

main().catch((e) => fail(e.stack || String(e)));
