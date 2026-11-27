#!/usr/bin/env node
// compare.mjs - measures how far each app screen is from its design board.
//
// For every pair of shots written by capture.mjs it:
//   1. matches the texts, controls and icons of both probes and estimates the global offset
//      (device chrome such as the status bar shifts the whole screen; that is not a finding);
//   2. lists every element difference: missing, extra, changed text, typography, color,
//      position and size, with the measured values on both sides;
//   3. diffs the pixels after aligning the app by the offset, outside the ignored regions,
//      and groups the differing pixels into regions;
//   4. draws side-by-side.png (Design | App | Diferença), diff.png and one comparative crop
//      per element difference and per pixel region.
// The images are drawn in Chromium's canvas, so the only dependency is Playwright.
//
// Usage:
//   node compare.mjs run <pairs.json>
//   node compare.mjs crop <out dir> <pair id> <name> <x,y,w,h> [app x,y,w,h]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MAX_ELEMENT_CROPS = 40;
const MAX_REGION_CROPS = 12;
const SIDE_BY_SIDE_MAX_W = 2400;
const POSITION_TOLERANCE = 0.5;
const SIZE_TOLERANCE = 1;

function fail(message) {
  console.error(`compare: ${message}`);
  process.exit(2);
}

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const inBoxes = (b, boxes) => boxes.some(([x, y, w, h]) => b.x >= x && b.y >= y && b.x + b.w <= x + w && b.y + b.h <= y + h);
const overlaps = (b, boxes) => boxes.some(([x, y, w, h]) => b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y);

function parseColor(c) {
  const m = String(c || '').match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
const hex = (c) => {
  const p = parseColor(c);
  if (!p) return String(c);
  const h = '#' + [p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return p.a < 1 ? `${h} ${Math.round(p.a * 100)}%` : h;
};
const sameColor = (a, b) => {
  const x = parseColor(a), y = parseColor(b);
  if (!x || !y) return a === b;
  if (x.a === 0 && y.a === 0) return true;
  return Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b)) <= 2 && Math.abs(x.a - y.a) <= 0.02;
};

function similarity(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// Pairs items with the same key, nearest first after the offset.
function pairByKey(design, app, keyOf, offset) {
  const pairs = [];
  const used = new Set();
  const left = [];
  for (const d of design) {
    let best = null;
    let bestDist = Infinity;
    for (const [j, a] of app.entries()) {
      if (used.has(j) || keyOf(a) !== keyOf(d)) continue;
      const [dx, dy] = center(d.box), [ax, ay] = center(a.box);
      const dist = Math.hypot(ax - dx - offset[0], ay - dy - offset[1]);
      if (dist < bestDist) { best = j; bestDist = dist; }
    }
    if (best === null) left.push(d);
    else { used.add(best); pairs.push([d, app[best]]); }
  }
  return { pairs, leftDesign: left, leftApp: app.filter((_, j) => !used.has(j)) };
}

// The unmatched app item whose label is most similar (at least 60%) within 120px of the design item.
function nearestSimilar(d, candidates, labelOf, offset) {
  let best = -1;
  let bestScore = 0;
  for (const [j, a] of candidates.entries()) {
    const [dx, dy] = center(d.box), [ax, ay] = center(a.box);
    if (Math.hypot(ax - dx - offset[0], ay - dy - offset[1]) > 120) continue;
    const score = similarity(labelOf(d), labelOf(a));
    if (score >= 0.6 && score > bestScore) { best = j; bestScore = score; }
  }
  return best;
}

function styleDiffs(d, a, props) {
  const out = [];
  for (const prop of props) {
    const dv = d.style?.[prop], av = a.style?.[prop];
    if (dv === undefined && av === undefined) continue;
    const isColor = /color/i.test(prop);
    const differs = isColor ? !sameColor(dv, av) : typeof dv === 'number' && typeof av === 'number' ? Math.abs(dv - av) >= 0.5 : dv !== av;
    if (differs) out.push({ prop, design: isColor ? hex(dv) : dv, app: isColor ? hex(av) : av });
  }
  return out;
}

function geometryDiffs(d, a, offset) {
  const out = [];
  const dx = Math.round((a.box.x - d.box.x - offset[0]) * 10) / 10;
  const dy = Math.round((a.box.y - d.box.y - offset[1]) * 10) / 10;
  const dw = Math.round((a.box.w - d.box.w) * 10) / 10;
  const dh = Math.round((a.box.h - d.box.h) * 10) / 10;
  if (Math.abs(dx) > POSITION_TOLERANCE) out.push({ prop: 'x', design: d.box.x, app: a.box.x - offset[0], delta: dx });
  if (Math.abs(dy) > POSITION_TOLERANCE) out.push({ prop: 'y', design: d.box.y, app: a.box.y - offset[1], delta: dy });
  if (Math.abs(dw) > SIZE_TOLERANCE) out.push({ prop: 'width', design: d.box.w, app: a.box.w, delta: dw });
  if (Math.abs(dh) > SIZE_TOLERANCE) out.push({ prop: 'height', design: d.box.h, app: a.box.h, delta: dh });
  if ((d.box.lines || 1) !== (a.box.lines || 1)) out.push({ prop: 'lines', design: d.box.lines || 1, app: a.box.lines || 1 });
  return out;
}

// textAlign is left out: flex centering leaves it at start, and the box position already shows alignment.
const TEXT_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'textTransform', 'textDecoration'];
const MIN_TARGET = 44;
// The input element sits inside the painted field, which is what the person taps.
const TEXT_ENTRY = new Set(['textbox', 'combobox', 'searchbox']);

// A control paints when its own element draws the background or the border. The app often wraps
// the painted box (or the label) in another element, so fill, border and size are only compared
// when both sides paint on the control itself; the label's color is measured by the text pair.
const paints = (c) => { const bg = parseColor(c.style?.backgroundColor); return (bg && bg.a > 0.02) || (c.style?.borderWidth || 0) > 0; };

function controlDiffs(d, a) {
  const out = [];
  if (paints(d) && paints(a)) {
    out.push(...styleDiffs(d, a, ['backgroundColor', 'borderRadius']));
    if (d.style.borderWidth > 0 && a.style.borderWidth > 0) out.push(...styleDiffs(d, a, ['borderWidth', 'borderColor']));
    out.push(...geometryDiffs(d, a, [0, 0]).filter((g) => g.prop === 'width' || g.prop === 'height'));
  }
  // The touch target is the measured tap area (capture.mjs), not the drawn box; without it, no claim.
  if (!TEXT_ENTRY.has(d.role) && !TEXT_ENTRY.has(a.role) && d.tap && a.tap) {
    if (d.tap.h >= MIN_TARGET && a.tap.h < MIN_TARGET) out.push({ prop: 'targetHeight', design: d.tap.h, app: a.tap.h });
    if (d.tap.w >= MIN_TARGET && a.tap.w < MIN_TARGET) out.push({ prop: 'targetWidth', design: d.tap.w, app: a.tap.w });
  }
  if (d.disabled !== a.disabled) out.push({ prop: 'disabled', design: d.disabled, app: a.disabled });
  return out;
}

function matchElements(design, app, pair) {
  const ignore = pair.ignore || [];
  // data-audit only exempts brand graphics from the product-design's own audit: the app still has to match them.
  const keep = (list) => (list || []).filter((e) => !inBoxes(e.box, ignore));
  const dTexts = keep(design.texts), aTexts = keep(app.texts);
  const dControls = keep(design.controls), aControls = keep(app.controls);
  const dIcons = keep(design.icons), aIcons = keep(app.icons);

  let offset = pair.offset;
  let offsetSource = 'plano';
  if (!offset) {
    const exact = pairByKey(dTexts, aTexts, (e) => e.text, [0, 0]).pairs;
    offset = exact.length >= 3
      ? [Math.round(median(exact.map(([d, a]) => a.box.x - d.box.x))), Math.round(median(exact.map(([d, a]) => a.box.y - d.box.y)))]
      : [0, 0];
    offsetSource = exact.length >= 3 ? `mediana de ${exact.length} textos iguais` : 'sem textos iguais suficientes';
  }

  const issues = [];
  const texts = pairByKey(dTexts, aTexts, (e) => e.text, offset);
  for (const [d, a] of texts.pairs) {
    const diffs = [...styleDiffs(d, a, TEXT_PROPS), ...geometryDiffs(d, a, offset)];
    if (diffs.length) issues.push({ kind: 'text_style', text: d.text, design: d.box, app: a.box, diffs });
  }
  const leftApp = [...texts.leftApp];
  for (const d of texts.leftDesign) {
    const best = nearestSimilar(d, leftApp, (e) => e.text, offset);
    if (best >= 0) {
      const a = leftApp.splice(best, 1)[0];
      issues.push({ kind: 'text_changed', text: d.text, appText: a.text, similarity: Math.round(similarity(d.text, a.text) * 100) / 100, design: d.box, app: a.box, diffs: [...styleDiffs(d, a, TEXT_PROPS), ...geometryDiffs(d, a, offset)] });
    } else {
      issues.push({ kind: 'text_missing', text: d.text, design: d.box, app: null, diffs: [] });
    }
  }
  for (const a of leftApp) issues.push({ kind: 'text_extra', text: a.text, design: null, app: a.box, diffs: [] });

  const controlKey = (e) => `${e.name.toLowerCase()}`;
  const controls = pairByKey(dControls.filter((c) => c.name), aControls.filter((c) => c.name), controlKey, offset);
  for (const [d, a] of controls.pairs) {
    const diffs = controlDiffs(d, a);
    if (diffs.length) issues.push({ kind: 'control_style', text: d.name, role: d.role, design: d.box, app: a.box, diffs });
  }
  const leftControls = [...controls.leftApp];
  for (const d of controls.leftDesign) {
    const j = nearestSimilar(d, leftControls, (e) => e.name, offset);
    if (j < 0) { issues.push({ kind: 'control_missing', text: d.name, role: d.role, design: d.box, app: null, diffs: [] }); continue; }
    const a = leftControls.splice(j, 1)[0];
    const diffs = [{ prop: 'name', design: d.name, app: a.name }, ...controlDiffs(d, a)];
    issues.push({ kind: 'control_style', text: d.name, role: d.role, design: d.box, app: a.box, diffs });
  }
  for (const a of leftControls) issues.push({ kind: 'control_extra', text: a.name, role: a.role, design: null, app: a.box, diffs: [] });

  const usedIcons = new Set();
  for (const d of dIcons) {
    const [dx, dy] = center(d.box);
    const j = aIcons.findIndex((a, k) => {
      if (usedIcons.has(k)) return false;
      const [ax, ay] = center(a.box);
      return Math.hypot(ax - dx - offset[0], ay - dy - offset[1]) <= 12 && Math.abs(a.box.w - d.box.w) <= 6 && Math.abs(a.box.h - d.box.h) <= 6;
    });
    if (j >= 0) usedIcons.add(j);
    else issues.push({ kind: 'icon_missing', text: d.name || d.kind, design: d.box, app: null, diffs: [], confidence: 'low' });
  }
  aIcons.forEach((a, k) => { if (!usedIcons.has(k)) issues.push({ kind: 'icon_extra', text: a.name || a.kind, design: null, app: a.box, diffs: [], confidence: 'low' }); });

  const matched = texts.pairs.length + controls.pairs.length + usedIcons.size;
  return { offset, offsetSource, matched, counts: { design: { texts: dTexts.length, controls: dControls.length, icons: dIcons.length }, app: { texts: aTexts.length, controls: aControls.length, icons: aIcons.length } }, issues };
}

// Runs in the page: aligns, diffs and draws. Images arrive as data URLs and leave as data URLs.
const DRAW = async ({ dUrl, aUrl, offset, ignore, threshold, crops, sideMaxW, diffOnly }) => {
  const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const D = await load(dUrl), A = await load(aUrl);
  const W = D.width, H = D.height;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const [cd, xd] = canvas(W, H); xd.fillStyle = '#fff'; xd.fillRect(0, 0, W, H); xd.drawImage(D, 0, 0);
  const [ca, xa] = canvas(W, H); xa.fillStyle = '#fff'; xa.fillRect(0, 0, W, H); xa.drawImage(A, -offset[0], -offset[1]);
  const out = {};
  let regions = [];
  let mismatch = 0;
  let compared = 0;
  if (!diffOnly || diffOnly === 'diff') {
    const pd = xd.getImageData(0, 0, W, H).data, pa = xa.getImageData(0, 0, W, H).data;
    const [cdiff, xdiff] = canvas(W, H);
    const img = xdiff.createImageData(W, H);
    const px = img.data;
    const ignored = new Uint8Array(W * H);
    for (const [x, y, w, h] of ignore) for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) ignored[j * W + i] = 1;
    const coveredW = Math.min(W, A.width - offset[0]), coveredH = Math.min(H, A.height - offset[1]);
    const maxDelta = 35215 * threshold * threshold;
    const CELL = 8;
    const cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    const cells = new Uint32Array(cw * ch);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const gray = 255 - (255 - (pd[k] * 0.299 + pd[k + 1] * 0.587 + pd[k + 2] * 0.114)) * 0.25;
        if (ignored[y * W + x]) { px[k] = 200; px[k + 1] = 214; px[k + 2] = 235; px[k + 3] = 255; continue; }
        compared++;
        let differs = x >= coveredW || y >= coveredH || x < -offset[0] || y < -offset[1];
        if (!differs) {
          const r1 = pd[k], g1 = pd[k + 1], b1 = pd[k + 2], r2 = pa[k], g2 = pa[k + 1], b2 = pa[k + 2];
          const y1 = r1 * 0.29889531 + g1 * 0.58662247 + b1 * 0.11448223, y2 = r2 * 0.29889531 + g2 * 0.58662247 + b2 * 0.11448223;
          const i1 = r1 * 0.59597799 - g1 * 0.2741761 - b1 * 0.32180189, i2 = r2 * 0.59597799 - g2 * 0.2741761 - b2 * 0.32180189;
          const q1 = r1 * 0.21147017 - g1 * 0.52261711 + b1 * 0.31114694, q2 = r2 * 0.21147017 - g2 * 0.52261711 + b2 * 0.31114694;
          const delta = 0.5053 * (y1 - y2) ** 2 + 0.299 * (i1 - i2) ** 2 + 0.1957 * (q1 - q2) ** 2;
          differs = delta > maxDelta;
        }
        if (differs) {
          mismatch++;
          cells[Math.floor(y / CELL) * cw + Math.floor(x / CELL)]++;
          px[k] = 230; px[k + 1] = 20; px[k + 2] = 60; px[k + 3] = 255;
        } else { px[k] = gray; px[k + 1] = gray; px[k + 2] = gray; px[k + 3] = 255; }
      }
    }
    xdiff.putImageData(img, 0, 0);
    const seen = new Uint8Array(cw * ch);
    for (let s = 0; s < cells.length; s++) {
      if (seen[s] || cells[s] < 4) continue;
      const stack = [s]; seen[s] = 1;
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, count = 0;
      while (stack.length) {
        const c = stack.pop();
        const cx = c % cw, cy = (c / cw) | 0;
        count += cells[c];
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const n = ny * cw + nx;
          if (!seen[n] && cells[n] >= 4) { seen[n] = 1; stack.push(n); }
        }
      }
      if (count >= 24) regions.push({ box: { x: x0 * CELL, y: y0 * CELL, w: Math.min(W, (x1 + 1) * CELL) - x0 * CELL, h: Math.min(H, (y1 + 1) * CELL) - y0 * CELL }, pixels: count });
    }
    regions.sort((a, b) => b.pixels - a.pixels);
    out.diff = cdiff.toDataURL('image/png');
    const scale = Math.min(1, sideMaxW / (3 * W + 48));
    const LABEL = 36;
    const [cs, xs] = canvas(Math.round((3 * W + 48) * scale), Math.round((H + LABEL) * scale));
    xs.scale(scale, scale);
    xs.fillStyle = '#F3F2EF'; xs.fillRect(0, 0, 3 * W + 48, H + LABEL);
    xs.font = '600 20px Inter, system-ui, sans-serif'; xs.fillStyle = '#262422';
    [['Design', cd], ['App', ca], ['Diferença', cdiff]].forEach(([label, c], i) => {
      xs.fillText(label, i * (W + 24) + 4, 26);
      xs.drawImage(c, i * (W + 24), LABEL);
    });
    out.side = cs.toDataURL('image/png');
  }
  out.crops = crops.map(({ dBox, aBox, label }) => {
    const M = 24;
    const grow = (b, maxW, maxH) => { const x = Math.max(0, Math.floor(b.x - M)), y = Math.max(0, Math.floor(b.y - M)); return { x, y, w: Math.min(maxW, Math.ceil(b.x + b.w + M)) - x, h: Math.min(maxH, Math.ceil(b.y + b.h + M)) - y }; };
    const dc = dBox ? grow(dBox, W, H) : null;
    const ac = aBox ? grow(aBox, A.width, A.height) : null;
    const w = Math.max(dc?.w || 0, ac?.w || 0, 120), h = Math.max(dc?.h || 0, ac?.h || 0, 60);
    const zoom = w < 240 ? 2 : 1;
    const LABEL = 28, GAP = 16;
    const [cc, xc] = canvas((2 * w + GAP) * zoom, (h + LABEL) * zoom);
    xc.scale(zoom, zoom);
    xc.fillStyle = '#F3F2EF'; xc.fillRect(0, 0, 2 * w + GAP, h + LABEL);
    xc.font = '600 13px Inter, system-ui, sans-serif'; xc.fillStyle = '#262422';
    xc.fillText('Design', 2, 18); xc.fillText('App', w + GAP + 2, 18);
    const panel = (img, crop, box, ox) => {
      xc.fillStyle = '#fff'; xc.fillRect(ox, LABEL, w, h);
      if (!crop) { xc.fillStyle = '#9A3412'; xc.fillText('ausente', ox + 8, LABEL + 20); return; }
      xc.drawImage(img, crop.x, crop.y, crop.w, crop.h, ox, LABEL, crop.w, crop.h);
      xc.strokeStyle = '#E11D48'; xc.lineWidth = 2;
      xc.strokeRect(ox + box.x - crop.x - 1, LABEL + box.y - crop.y - 1, box.w + 2, box.h + 2);
    };
    panel(D, dc, dBox, 0);
    panel(A, ac, aBox, w + GAP);
    return { label, url: cc.toDataURL('image/png') };
  });
  return { ...out, regions, mismatch, compared, size: { design: [W, H], app: [A.width, A.height] } };
};

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const writeDataUrl = (file, url) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); };
const slug = (s) => norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

function loadShot(out, index, id) {
  const shot = index.shots.find((s) => s.id === id);
  if (!shot) throw new Error(`print ${id} não está em capture.json`);
  if (!shot.png) throw new Error(`print ${id} não tem imagem (${shot.exception || 'falhou'})`);
  return { shot, png: path.join(out, shot.png), probe: JSON.parse(fs.readFileSync(path.join(out, shot.probe), 'utf8')) };
}

async function runPairs(file) {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = path.resolve(spec.dir);
  const index = JSON.parse(fs.readFileSync(path.join(out, 'capture.json'), 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const summary = [];
  try {
    for (const pair of spec.pairs) {
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(pair.id || '')) throw new Error(`id de par inválido: ${pair.id}`);
      const design = loadShot(out, index, pair.design);
      const app = loadShot(out, index, pair.app);
      const elements = matchElements(design.probe, app.probe, pair);
      const ignore = pair.ignore || [];
      const ranked = [...elements.issues].sort((a, b) => (b.design ? 1 : 0) - (a.design ? 1 : 0));
      const elementCrops = ranked.slice(0, MAX_ELEMENT_CROPS).map((issue, i) => ({
        dBox: issue.design, aBox: issue.app || (issue.design && { ...issue.design, x: issue.design.x + elements.offset[0], y: issue.design.y + elements.offset[1] }),
        label: `e${String(i + 1).padStart(2, '0')}-${issue.kind}-${slug(issue.text)}`, issue,
      }));
      const drawn = await page.evaluate(DRAW, {
        dUrl: dataUrl(design.png), aUrl: dataUrl(app.png), offset: elements.offset, ignore, threshold: pair.threshold ?? 0.1,
        crops: elementCrops.map(({ dBox, aBox, label }) => ({ dBox, aBox, label })), sideMaxW: SIDE_BY_SIDE_MAX_W, diffOnly: false,
      });
      const regionCrops = drawn.regions.slice(0, MAX_REGION_CROPS).filter((r) => !overlaps(r.box, ignore)).map((r, i) => ({
        dBox: r.box, aBox: { ...r.box, x: r.box.x + elements.offset[0], y: r.box.y + elements.offset[1] }, label: `r${String(i + 1).padStart(2, '0')}-regiao`, region: r,
      }));
      const regionDrawn = regionCrops.length ? await page.evaluate(DRAW, {
        dUrl: dataUrl(design.png), aUrl: dataUrl(app.png), offset: elements.offset, ignore, threshold: 0.1,
        crops: regionCrops.map(({ dBox, aBox, label }) => ({ dBox, aBox, label })), sideMaxW: SIDE_BY_SIDE_MAX_W, diffOnly: 'crops',
      }) : { crops: [] };

      const dir = path.join(out, 'compare', pair.id);
      fs.rmSync(dir, { recursive: true, force: true });
      writeDataUrl(path.join(dir, 'side-by-side.png'), drawn.side);
      writeDataUrl(path.join(dir, 'diff.png'), drawn.diff);
      drawn.crops.forEach((c, i) => { const f = path.join(dir, 'crops', `${c.label}.png`); writeDataUrl(f, c.url); elementCrops[i].issue.crop = path.relative(out, f); });
      regionDrawn.crops.forEach((c, i) => { const f = path.join(dir, 'crops', `${c.label}.png`); writeDataUrl(f, c.url); regionCrops[i].region.crop = path.relative(out, f); });

      const result = {
        id: pair.id, design: pair.design, app: pair.app, board: design.shot.board, route: app.shot.url, theme: app.shot.theme,
        viewport: app.shot.viewport, ignore, offset: elements.offset, offsetSource: elements.offsetSource,
        size: drawn.size, heightDelta: drawn.size.app[1] - drawn.size.design[1],
        pixels: { mismatch: drawn.mismatch, compared: drawn.compared, ratio: drawn.compared ? Math.round((drawn.mismatch / drawn.compared) * 10000) / 10000 : 0 },
        regions: drawn.regions.slice(0, 40), elements: { matched: elements.matched, counts: elements.counts, issues: elements.issues },
        images: { sideBySide: path.relative(out, path.join(dir, 'side-by-side.png')), diff: path.relative(out, path.join(dir, 'diff.png')) },
      };
      fs.writeFileSync(path.join(out, 'compare', `${pair.id}.json`), JSON.stringify(result, null, 1));
      const byKind = {};
      for (const issue of elements.issues) byKind[issue.kind] = (byKind[issue.kind] || 0) + 1;
      summary.push({ id: pair.id, ratio: result.pixels.ratio, regions: drawn.regions.length, offset: elements.offset, matched: elements.matched, issues: byKind });
      console.log(`${pair.id}: ${(result.pixels.ratio * 100).toFixed(2)}% de pixels diferentes, ${drawn.regions.length} regiões, deslocamento ${elements.offset.join(',')}, ${elements.issues.length} diferenças de elemento`);
    }
  } finally {
    await browser.close();
  }
  const summaryFile = path.join(out, 'compare', 'summary.json');
  const previous = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : [];
  const ids = new Set(summary.map((s) => s.id));
  fs.writeFileSync(summaryFile, JSON.stringify([...previous.filter((s) => !ids.has(s.id)), ...summary], null, 1));
}

async function crop(outDir, pairId, name, box, appBox) {
  const out = path.resolve(outDir);
  const result = JSON.parse(fs.readFileSync(path.join(out, 'compare', `${pairId}.json`), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(out, 'capture.json'), 'utf8'));
  const design = loadShot(out, index, result.design);
  const app = loadShot(out, index, result.app);
  const parse = (s) => { const [x, y, w, h] = s.split(',').map(Number); if ([x, y, w, h].some((v) => !Number.isFinite(v))) fail(`caixa inválida: ${s}`); return { x, y, w, h }; };
  const dBox = parse(box);
  const aBox = appBox ? parse(appBox) : { ...dBox, x: dBox.x + result.offset[0], y: dBox.y + result.offset[1] };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const drawn = await page.evaluate(DRAW, { dUrl: dataUrl(design.png), aUrl: dataUrl(app.png), offset: result.offset, ignore: [], threshold: 0.1, crops: [{ dBox, aBox, label: slug(name) }], sideMaxW: SIDE_BY_SIDE_MAX_W, diffOnly: 'crops' });
    const file = path.join(out, 'compare', pairId, 'crops', `${slug(name)}.png`);
    writeDataUrl(file, drawn.crops[0].url);
    console.log(path.relative(out, file));
  } finally {
    await browser.close();
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'run' && rest[0]) runPairs(rest[0]).catch((e) => fail(e.stack || String(e)));
else if (command === 'crop' && rest.length >= 4) crop(...rest).catch((e) => fail(e.stack || String(e)));
else fail('uso: node compare.mjs run <pairs.json> | crop <out> <par> <nome> <x,y,w,h> [x,y,w,h do app]');
