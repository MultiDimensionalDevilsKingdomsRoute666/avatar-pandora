// L43 — docs/qa/expectations.md : le fichier existe, porte les pages attendues, et ses deux
// mesures sur les fiches (corps non vide, vide ≥ 16 px entre deux paragraphes) tiennent sur le site
// construit. Le volet navigateur lit frontend/dist ; skip sans playwright-core/Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIST, setupBrowser } from './lib/e2e-dist.mjs';

const DOC = fileURLToPath(new URL('../docs/qa/expectations.md', import.meta.url));
const SECTIONS = ['pandora', 'clans', 'bestiaire', 'flore', 'personnages', 'films', 'engins'];

function titresDeSections(md) {
  return [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

test('R1 — expectations.md décrit l\'accueil, Nouveautés et une section par rubrique du codex', () => {
  assert.ok(existsSync(DOC), 'docs/qa/expectations.md est absent');
  const titres = titresDeSections(readFileSync(DOC, 'utf8'));
  for (const attendu of ['/', '/nouveautes/', ...SECTIONS.map((s) => `/${s}/<fiche>/`)]) {
    assert.ok(titres.includes(attendu), `section « ## ${attendu} » absente (trouvées : ${titres.join(', ')})`);
  }
});

test('R2 — chaque section de la page porte au moins une ligne « shows: » ou « never: »', () => {
  const md = readFileSync(DOC, 'utf8');
  const blocs = md.split(/^## /m).slice(1);
  assert.ok(blocs.length >= 9, `${blocs.length} sections`);
  for (const b of blocs) {
    const titre = b.split('\n')[0];
    assert.match(b, /^- (shows|never): /m, `« ## ${titre} » sans attendu`);
  }
});

test('R3 — la règle du seuil écrite dans expectations.md est celle que le test mesure (16 px, 390 et 1440)', () => {
  const md = readFileSync(DOC, 'utf8');
  assert.match(md, /16 px/);
  assert.match(md, /390/);
  assert.match(md, /1440/);
  assert.match(md, /\.entry-body/);
});

function fiches() {
  const out = [];
  for (const s of SECTIONS) {
    for (const d of readdirSync(join(DIST, s), { withFileTypes: true })) {
      if (d.isDirectory() && existsSync(join(DIST, s, d.name, 'index.html'))) out.push(`/${s}/${d.name}/`);
    }
  }
  return out;
}

for (const width of [390, 1440]) {
  test(`R4 — toutes les fiches @${width}px : .entry-body non vide et vide ≥ 16 px entre deux paragraphes voisins`, { timeout: 300_000 }, async (t) => {
    const env = await setupBrowser(t);
    if (!env) return;
    const page = await env.browser.newPage({ viewport: { width, height: 900 } });
    const urls = fiches();
    assert.ok(urls.length >= 60, `fiches trouvées : ${urls.length}`);
    for (const url of urls) {
      await page.goto(`${env.base}${url}`, { waitUntil: 'load' });
      const m = await page.evaluate(() => {
        const body = document.querySelector('article .entry-body');
        const ps = body ? [...body.querySelectorAll(':scope > p')] : [];
        return {
          present: !!body,
          texte: body ? body.textContent.trim().length : 0,
          gaps: ps.slice(1).map((p, i) => p.getBoundingClientRect().top - ps[i].getBoundingClientRect().bottom),
        };
      });
      assert.ok(m.present, `${url} : pas de .entry-body`);
      assert.ok(m.texte > 0, `${url} : .entry-body vide`);
      for (const g of m.gaps) assert.ok(g >= 16, `${url} : vide ${g.toFixed(1)} px entre deux paragraphes`);
    }
  });
}
