// L20 — page « Plan de travail » (/plan-de-travail/) : en cours, prévu, récemment livré,
// générée AU BUILD depuis .cadence/raf.yaml. Titres et états seulement : AUCUN texte de
// note (ni verdict UX, ni raison d'abandon, ni titre de sous-tâche) ne doit sortir dans
// le site construit — vérifié sur TOUS les fichiers de frontend/dist (formes échappées
// HTML et JSON comprises). Repris d'evatosorus après sa relecture et sa revue UX.
//
// Lit le site CONSTRUIT : lancer `npx astro build` avant. Tests navigateur en « skip »
// sans playwright-core ni Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { DIST, setupBrowser } from './lib/e2e-dist.mjs';
import { RECENT_DONE, newsTitlesByLot, publicTitleOf } from '../frontend/src/lib/plan-public.ts';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { parse } = require('yaml');
const RAF = parse(readFileSync(new URL('../.cadence/raf.yaml', import.meta.url), 'utf8'));
const PAGE = join(DIST, 'plan-de-travail', 'index.html');
const html = () => readFileSync(PAGE, 'utf8');

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ')
  .replaceAll('&amp;', '&');

// Tous les fichiers texte d'un dossier construit.
function distFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (['.html', '.js', '.mjs', '.json', '.css', '.txt', '.xml', '.svg', '.map', '.webmanifest'].includes(extname(e.name))) files.push(p);
    }
  };
  walk(root);
  return files;
}

// Cherche chaque texte privé dans chaque fichier : texte brut, entités HTML décodées
// (&#39; &amp; &laquo; …) et échappements JSON/JS (\u00e9) ramenés au caractère.
const NAMED = { quot: '"', lt: '<', gt: '>', nbsp: '\u00a0', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', hellip: '…', mdash: '—', ndash: '–', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', apos: "'" };
const fullDecode = (s) => decode(s)
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
  .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const squash = (s) => s.replace(/[\s\u00a0\u202f]+/g, ' ');
function findLeaks(files, needles, root) {
  const leaks = [];
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    const forms = [raw, decode(raw), fullDecode(raw), fullDecode(fullDecode(raw))].map(squash);
    for (const [k, s] of needles) if (forms.some((t) => t.includes(squash(s)))) leaks.push(`${k} → ${f.slice(root.length - (root.endsWith('/') ? 1 : 0))}`);
  }
  return leaks;
}

const lots = RAF.lots;
const NEWS = JSON.parse(readFileSync(new URL('../frontend/public/nouveautes-data/nouveautes.json', import.meta.url), 'utf8')).entries;
// Titre public attendu : la MÊME règle que le code (importée, pas recopiée) — public:, sinon
// titre de Nouveauté pour un lot livré hors lots de processus (revue, audit, campagne).
const NEWS_TITLES = newsTitlesByLot(NEWS);
const publicTitle = (l) => {
  const t = publicTitleOf(l, NEWS_TITLES);
  return typeof t === 'string' ? t.trim() : undefined;
};
const published = lots.filter((l) => l.visible === true && ['doing', 'todo', 'done'].includes(l.status) && publicTitle(l));
const shown = (status) => published.filter((l) => l.status === status);

// Lots livrés que la page montre : « récemment livré » = les RECENT_DONE plus récents, dans l'ordre
// de la page — date de livraison (à défaut début, à défaut création) décroissante, puis rang dans le
// plan décroissant — un seul lot par titre public (le premier de cet ordre ; les autres sont fondus).
const sortKey = (l) => [l.finished, l.started, l.created].find((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ?? '';
function recentDone(all = published) {
  const byRecency = all
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.status === 'done')
    .sort((a, b) => sortKey(b.l).localeCompare(sortKey(a.l)) || b.i - a.i)
    .map(({ l }) => l);
  const firsts = byRecency.filter((l, i) => byRecency.findIndex((x) => publicTitle(x) === publicTitle(l)) === i);
  return { shown: firsts.slice(0, RECENT_DONE), all: byRecency };
}
const RECENT = recentDone();

test('dist/plan-de-travail/index.html est construit, titré « Plan de travail »', () => {
  assert.ok(existsSync(PAGE), 'page absente : lancer `npx astro build`');
  assert.match(html(), /<title>Plan de travail — Eywa<\/title>/);
  assert.match(html(), /<h1[^>]*>[^<]+<\/h1>/);
});

test('trois sections titrées ; tous les lots en cours et prévus, dans l’ordre du plan, avec leur état écrit', () => {
  const page = decode(html());
  for (const h of ['En cours', 'Prévu', 'Récemment livré']) assert.match(page, new RegExp(`<h2[^>]*>${h}`), `section « ${h} » absente`);
  for (const status of ['doing', 'todo']) {
    const ids = [...page.matchAll(new RegExp(`<li[^>]*class="plan-lot" data-status="${status}"[^>]*data-id="([^"]+)"`, 'g'))].map((m) => m[1]);
    // Ordre du plan, un lot par titre public (le premier).
    const firsts = shown(status).filter((l, i, all) => all.findIndex((x) => publicTitle(x) === publicTitle(l)) === i);
    assert.deepEqual(ids, firsts.map((l) => l.id), status);
    for (const l of shown(status)) assert.ok(page.includes(publicTitle(l).replace(/'/g, '’')), `${l.id} : titre public absent`);
  }
  const done = [...page.matchAll(/<li[^>]*class="plan-lot" data-status="done"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(done.length > 0 && done.length <= RECENT_DONE, `${done.length} lots livrés affichés`);
  assert.ok(done.every((id) => shown('done').some((l) => l.id === id)));
  const ids = [...page.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id) => !published.some((l) => l.id === id)), [], 'lot masqué (non visible, sans titre public ou abandonné) publié');
});

test('« Récemment livré » : exactement les RECENT_DONE lots livrés les plus récents, dans l’ordre de la page', () => {
  const ids = [...decode(html()).matchAll(/<li[^>]*class="plan-lot" data-status="done"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(RECENT.all.length > RECENT_DONE, 'moins de lots livrés que le plafond : le test ne prouverait pas la borne');
  assert.equal(ids.length, RECENT_DONE, `la page montre ${ids.length} lots livrés, attendu ${RECENT_DONE}`);
  assert.deepEqual(ids, RECENT.shown.map((l) => l.id));
});

test('le calcul des lots livrés attendus borne au plafond, trie par date puis rang, et fond les titres égaux', () => {
  const mk = (id, finished, title = `Titre ${id}`) => ({ id, status: 'done', visible: true, finished, public: title });
  const lots9 = Array.from({ length: 9 }, (_, i) => mk(`A${i}`, `2026-10-${String(10 + i).padStart(2, '0')}`));
  const r = recentDone(lots9);
  assert.deepEqual(r.shown.map((l) => l.id), ['A8', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1']);
  const same = recentDone([mk('B0', '2026-10-01'), mk('B1', '2026-10-01')]);
  assert.deepEqual(same.shown.map((l) => l.id), ['B1', 'B0'], 'à date égale, le plus loin dans le plan d’abord');
  const merged = recentDone([mk('C0', '2026-10-01', 'Même'), mk('C1', '2026-10-02', 'Même')]);
  assert.deepEqual(merged.shown.map((l) => l.id), ['C1']);
});

test('AUCUN texte privé du plan dans le site construit : titres bruts, notes, verdicts UX, raisons, sous-tâches, lots abandonnés', () => {
  // Public par construction : les titres publics affichés (public: ou titre de Nouveauté).
  const allowed = new Set(published.map(publicTitle));
  const secrets = [];
  for (const l of lots) {
    secrets.push([`${l.id} titre brut${l.status === 'dropped' ? ' (abandonné)' : ''}`, l.title]);
    for (const n of l.notes ?? []) secrets.push([`${l.id} note`, n.text]);
    if (l.ux?.verdict) secrets.push([`${l.id} ux`, l.ux.verdict]);
    if (l.reason) secrets.push([`${l.id} raison`, l.reason]);
    for (const t of l.tasks ?? []) secrets.push([`${l.id}/${t.id} titre`, t.title]);
    // public: d'un lot NON publié (non visible, abandonné…) : privé lui aussi.
    if (typeof l.public === 'string' && !published.includes(l)) secrets.push([`${l.id} public: non publié`, l.public]);
  }
  assert.ok(secrets.filter(([k]) => k.endsWith('note')).length > 0, 'aucune note dans raf.yaml : le test ne prouverait rien');
  // Texte entier (60 premiers caractères pour les longs). Plancher de 12 caractères : en
  // dessous, un texte n'est qu'un mot ou deux qui peuvent légitimement figurer ailleurs
  // (aucun texte du plan actuel n'est aussi court : le plancher ne cache rien aujourd'hui).
  const needles = secrets
    .filter(([, s]) => !allowed.has(String(s).trim()))
    .map(([k, s]) => [k, String(s).trim().slice(0, 60)]);
  const short = needles.filter(([, s]) => s.length < 12);
  assert.deepEqual(short, [], 'texte privé trop court pour être cherché sans faux positif : relever le plancher en conscience');
  const files = distFiles(DIST);
  assert.ok(files.length > 100, `dist presque vide (${files.length} fichiers)`);
  assert.deepEqual(findLeaks(files, needles, DIST), []);
});

test('le test de fuite cherche aussi le public: des lots non publiés (non visibles ou abandonnés)', () => {
  const fake = [
    { id: 'X1', title: 'Titre brut assez long', public: 'Titre public d’un lot caché', visible: false, status: 'todo' },
    { id: 'X2', title: 'Titre brut assez long', public: 'Titre public d’un lot abandonné', visible: true, status: 'dropped' },
  ];
  const pub = fake.filter((l) => l.visible === true && ['doing', 'todo', 'done'].includes(l.status) && publicTitle(l));
  assert.deepEqual(pub, []);
  const needles = fake.filter((l) => typeof l.public === 'string' && !pub.includes(l)).map((l) => l.public);
  assert.deepEqual(needles, ['Titre public d’un lot caché', 'Titre public d’un lot abandonné']);
});

test('le détecteur de fuites trouve un texte privé planté, en clair, échappé HTML ou JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-fuite-'));
  try {
    const secret = 'Note privée « l’abandon » & co — 01-10';
    writeFileSync(join(dir, 'clair.html'), `<p>${secret}</p>`);
    writeFileSync(join(dir, 'html.html'), `<p>${secret.replaceAll('&', '&amp;').replaceAll('’', '&#8217;').replaceAll('«', '&laquo;')}</p>`);
    writeFileSync(join(dir, 'hexa.html'), `<p data-x="${secret.replaceAll('&', '&#x26;').replaceAll('é', '&#xe9;')}"></p>`);
    writeFileSync(join(dir, 'json.js'), `const a = ${JSON.stringify(secret).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)};`);
    writeFileSync(join(dir, 'propre.html'), '<p>rien à voir</p>');
    const leaks = findLeaks(distFiles(dir), [['planté', secret]], dir);
    assert.deepEqual(leaks.map((l) => l.split(' → ')[1]).sort(), ['/clair.html', '/hexa.html', '/html.html', '/json.js']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dates de livraison en français, « 1er » le premier du mois (ordinal en exposant, jamais « 1ER »)', () => {
  const page = decode(html().replace(/<(?!\/?li\b)[^>]+>/g, ''));
  assert.doesNotMatch(html(), />1ER</, 'ordinal en capitales');
  if (RECENT.shown.some((l) => String(l.finished).endsWith('-01'))) assert.match(html(), />1<\/span><sup class="fr-ordinal[^"]*"[^>]*>er<\/sup> /);
  assert.ok(!/>1 octobre/.test(page), '« 1 octobre » au lieu de « 1er »');
  for (const l of RECENT.shown.filter((x) => x.finished)) assert.match(html(), new RegExp(`<time[^>]*datetime="${l.finished}"`), `${l.id} : date de livraison absente`);
  if (RECENT.shown.some((l) => String(l.finished).endsWith('-01'))) assert.match(page, /1er octobre/);
});

test('section vide : texte honnête (« Prévu » vide → « Les prochains travaux seront annoncés ici. ») ; jamais « 0 » dans le bandeau', () => {
  const page = decode(html());
  assert.doesNotMatch(page, /<span>0\u00a0/, 'décompte nul affiché');
  assert.doesNotMatch(page, /\(0\)/, '« (0) » affiché dans un titre de section');
  if (shown('todo').length === 0) assert.ok(page.includes('Les prochains travaux seront annoncés ici.'));
  else assert.ok(!page.includes('Les prochains travaux seront annoncés ici.'));
});

test('aucun identifiant de lot (« L14 »…) dans le texte visible ; il reste en data-id et id', () => {
  const page = html();
  const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
  const text = decode(main.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' '));
  assert.doesNotMatch(text, /\bL\d+\b/, 'identifiant de lot visible');
  // Chaque lot publié a sa ligne (id lot-<id>), ou est fondu dans celle d'un lot au même titre (data-also).
  const onPage = published.filter((l) => l.status !== 'done' || RECENT.shown.some((r) => publicTitle(r) === publicTitle(l)));
  for (const l of onPage) {
    const own = new RegExp(`<li[^>]*data-id="${l.id}" id="lot-${l.id}"`).test(page);
    const merged = new RegExp(`<li[^>]*data-also="[^"]*\\b${l.id}\\b`).test(page);
    assert.ok(own || merged, `${l.id} : ni ligne ni fusion`);
  }
});

test('un titre public n’apparaît qu’une fois par section (lots fondus, date la plus récente)', () => {
  const page = decode(html());
  for (const status of ['doing', 'todo', 'done']) {
    const titles = [...page.matchAll(new RegExp(`<li[^>]*class="plan-lot" data-status="${status}"[\\s\\S]*?<p class="plan-lot-title"[^>]*>([^<]*)<`, 'g'))].map((m) => m[1]);
    assert.equal(new Set(titles).size, titles.length, `${status} : titre en double (${titles.join(' | ')})`);
  }
});

// Liens de la barre latérale (bureau) / du tiroir (téléphone) d'une page construite.
const sidebarLinks = (page) => {
  const aside = page.slice(page.indexOf('<aside id="eywa-sidebar"'), page.indexOf('</aside>'));
  return [...aside.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => ({ href: m[1], tag: m[0] }));
};

test('le menu de toutes les pages du codex propose « Plan de travail » juste après « Nouveautés », actif sur la page', () => {
  for (const p of ['pandora', 'pandora/eywa', 'bestiaire', 'langue', 'videos', 'nouveautes', 'plan-de-travail']) {
    const links = sidebarLinks(readFileSync(join(DIST, p, 'index.html'), 'utf8'));
    const i = links.findIndex((l) => l.href === '/nouveautes/');
    assert.ok(i >= 0, `${p} : lien Nouveautés absent`);
    assert.equal(links[i + 1]?.href, '/plan-de-travail/', `${p} : « Plan de travail » n’est pas juste après « Nouveautés »`);
    if (p !== 'plan-de-travail') assert.doesNotMatch(links[i + 1].tag, /aria-current/, p);
  }
  assert.match(sidebarLinks(html()).find((l) => l.href === '/plan-de-travail/').tag, /aria-current="page"/);
});

// ── Navigateur ──────────────────────────────────────────────────────────────
// Contraste WCAG du texte des sections sur leur fond, composé dans le PIRE cas (fond blanc
// sous la carte translucide : l'image de fond peut être claire).
const worstContrast = (page) => page.evaluate(() => {
  const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
  const out = [];
  for (const card of document.querySelectorAll('.plan-section, .plan-summary')) {
    const bg = over(rgba(getComputedStyle(card).backgroundColor), [255, 255, 255]);
    for (const el of card.querySelectorAll('h2, p, span, li')) {
      if (!el.textContent.trim()) continue;
      const fg = over(rgba(getComputedStyle(el).color), bg);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      out.push({ sel: `${card.className} ${el.tagName}.${el.className}`, ratio: (a + 0.05) / (b + 0.05) });
    }
  }
  return out;
});

test('reflow 320/390/1440 px : aucun défilement horizontal, contraste ≥ 4,5:1', { timeout: 120_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  for (const width of [320, 390, 1440]) {
    const context = await env.browser.newContext({ viewport: { width, height: width > 1000 ? 900 : 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${env.base}/plan-de-travail/`, { waitUntil: 'load' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `${width}px : débordement horizontal de ${overflow}px`);
    const results = await worstContrast(page);
    assert.ok(results.length > 0, 'aucun texte mesuré');
    for (const { sel, ratio } of results) assert.ok(ratio >= 4.5, `${width}px ${sel} : ${ratio.toFixed(2)}:1`);
    await context.close();
  }
});

test('bureau 1440 px, au clavier : Tab atteint « Plan de travail » dans la barre latérale (contour visible), Entrée y mène', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const context = await env.browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${env.base}/pandora/`, { waitUntil: 'load' });
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.getAttribute('href') === '/plan-de-travail/');
  }
  assert.ok(reached, 'lien Plan de travail hors de l’ordre de tabulation');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, 'none', 'contour de focus invisible');
  await Promise.all([page.waitForURL((u) => u.pathname === '/plan-de-travail/'), page.keyboard.press('Enter')]);
  await context.close();
});

test('téléphone 390 px : le tiroir propose « Plan de travail » sous « Nouveautés » et y mène', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const context = await env.browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${env.base}/pandora/`, { waitUntil: 'load' });
  await page.click('#eywa-burger');
  const link = page.locator('#eywa-sidebar a[href="/plan-de-travail/"]');
  await link.scrollIntoViewIfNeeded();
  assert.ok(await link.isVisible(), 'lien absent du tiroir');
  const box = await link.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, `lien hors de l’écran (${box.x}…${box.x + box.width})`);
  await Promise.all([page.waitForURL((u) => u.pathname === '/plan-de-travail/'), link.click()]);
  await page.waitForSelector('.plan-section');
  await context.close();
});

test('320/390 px : le sur-titre des pages méta ne passe pas sous le bouton menu fixe', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  for (const width of [320, 390]) {
    const context = await env.browser.newContext({ viewport: { width, height: 700 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const path of ['/nouveautes/', '/plan-de-travail/']) {
      await page.goto(`${env.base}${path}`, { waitUntil: 'load' });
      const { text, burger } = await page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('.meta-eyebrow'));
        const rects = [...range.getClientRects()];
        const b = document.getElementById('eywa-burger').getBoundingClientRect();
        return { text: rects.map((r) => ({ right: r.right, top: r.top, bottom: r.bottom })), burger: { left: b.left, top: b.top, bottom: b.bottom } };
      });
      for (const r of text) {
        const sameRow = r.bottom > burger.top && r.top < burger.bottom;
        assert.ok(!sameRow || r.right <= burger.left - 4, `${path} @${width}px : sur-titre jusqu’à ${r.right}px, bouton menu dès ${burger.left}px`);
      }
    }
    await context.close();
  }
});

test('320 px : le sur-titre des pages méta ne laisse jamais « · » en fin de ligne (« · Eywa » insécable)', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const context = await env.browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const path of ['/nouveautes/', '/plan-de-travail/']) {
    await page.goto(`${env.base}${path}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const lines = await page.evaluate(() => {
      // Texte de chaque ligne rendue : caractères groupés par ordonnée.
      const node = document.querySelector('.meta-eyebrow').firstChild;
      const rows = new Map();
      for (let i = 0; i < node.textContent.length; i++) {
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
        const rect = r.getClientRects()[0];
        if (!rect) continue;
        const y = Math.round(rect.top);
        rows.set(y, (rows.get(y) ?? '') + node.textContent[i]);
      }
      return [...rows.values()].map((s) => s.trim());
    });
    for (const l of lines) assert.doesNotMatch(l, /·$/, `${path} : ligne « ${l} »`);
    assert.match(lines.at(-1), /·\s*Eywa$/, `${path} : « · Eywa » séparé`);
  }
  await context.close();
});

test('ordinal « 1ᵉʳ » dans les lignes en capitales espacées : sans espacement de lettres, sans dépasser le haut des capitales', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const context = await env.browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const [path, line] of [['/nouveautes/', '.news-date time'], ['/plan-de-travail/', '.plan-lot-meta']]) {
    await page.goto(`${env.base}${path}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const sup = page.locator(`${line} .fr-ordinal`).first();
    if (!(await sup.count())) continue;
    const m = await sup.evaluate((s) => {
      const digit = document.createRange();
      const text = s.previousElementSibling.firstChild; // « 1 »
      digit.setStart(text, text.textContent.length - 1); digit.setEnd(text, text.textContent.length);
      const d = digit.getBoundingClientRect(); const b = s.getBoundingClientRect();
      return { ls: getComputedStyle(s).letterSpacing, supMid: (b.top + b.bottom) / 2, digitTop: d.top, digitH: d.height, gap: b.left - d.right };
    });
    assert.ok(m.ls === '0px' || m.ls === 'normal', `${path} : letter-spacing ${m.ls}`);
    // Le milieu de l'exposant reste dans la moitié haute du « 1 » (pas au-dessus de la ligne).
    assert.ok(m.supMid >= m.digitTop && m.supMid <= m.digitTop + m.digitH / 2, `${path} : milieu de l’exposant à ${(m.supMid - m.digitTop).toFixed(1)} px du haut du « 1 » (haut ${m.digitH.toFixed(1)} px)`);
    assert.ok(m.gap < 1, `${path} : exposant détaché du chiffre de ${m.gap.toFixed(1)} px`);
  }
  await context.close();
});

// Revue UX L20 : l'état du groupe (« En cours », « Prévu », « Livré ») n'est pas répété sous
// chaque ligne ; sous une ligne : l'avancement s'il y en a un, la date pour un lot livré.
test('sous chaque ligne : ni l’état du groupe répété, ni ligne vide ; apostrophes typographiques', () => {
  const page = html();
  const items = [...page.matchAll(/<li[^>]*class="plan-lot"[^>]*data-status="(\w+)"[\s\S]*?<\/li>/g)];
  assert.ok(items.length > 0);
  for (const [li, status] of items) {
    const text = decode(li.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /\b(en cours|prévu|livré)\b/i, `état répété : ${text}`);
    const meta = li.match(/<p class="plan-lot-meta"[^>]*>([\s\S]*?)<\/p>/);
    if (meta) assert.ok(decode(meta[1].replace(/<[^>]+>/g, '')).trim(), `ligne d’état vide : ${text}`);
    if (status === 'done') assert.match(li, /<time[^>]*datetime=/, 'date absente sous un lot livré');
  }
  const main = decode(page.slice(page.indexOf('<main'), page.indexOf('</main>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' '));
  assert.doesNotMatch(main, /'/, 'apostrophe droite dans le texte de la page');
});
