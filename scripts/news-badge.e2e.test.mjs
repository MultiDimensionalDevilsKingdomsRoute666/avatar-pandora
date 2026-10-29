// L14 — pastille du lien « Nouveautés » (entrées non vues depuis la dernière visite,
// localStorage) et séparateur « Déjà vu lors de ta visite du … » sur la page, comme
// AetherWX. Lit frontend/dist (lancer `npx astro build` avant) ; skip sans Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupBrowser } from './lib/e2e-dist.mjs';
import { badgeLabel } from '../frontend/src/lib/news-seen.ts';

const DATA = JSON.parse(readFileSync(new URL('../frontend/public/nouveautes-data/nouveautes.json', import.meta.url), 'utf8'));
const KEY = 'eywa.news.seen-v1';
const [newest, older] = DATA.entries;

const badge = (page) => page.evaluate(() => {
  const link = document.querySelector('#eywa-sidebar a[href="/nouveautes/"]');
  const b = link.querySelector('.news-badge');
  const dot = document.querySelector('#eywa-burger .eywa-burger__dot');
  return {
    shown: !!b && !b.hidden && getComputedStyle(b).display !== 'none',
    digits: b?.querySelector('[aria-hidden="true"]')?.textContent.trim() ?? '',
    text: link.textContent.replace(/\s+/g, ' ').trim(),
    dot: !!dot && !dot.hidden,
  };
});

test('pastille : rien au premier passage, nombre d’entrées non vues ensuite, remise à zéro par la visite', { timeout: 90_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  assert.ok(newest && older, 'il faut au moins deux nouveautés');
  const context = await env.browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();

  // Premier visiteur : rien en mémoire, aucune pastille.
  await page.goto(`${env.base}/pandora/`, { waitUntil: 'load' });
  assert.equal((await badge(page)).shown, false, 'pastille pour un premier visiteur');

  // Dernière visite avant toutes les entrées : toutes non vues.
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ date: '2026-09-01', slugs: [], at: '2026-09-01T10:00:00Z' })]);
  await page.reload({ waitUntil: 'load' });
  let b = await badge(page);
  const n = DATA.entries.length;
  assert.ok(b.shown, 'pastille absente');
  assert.equal(b.digits, badgeLabel(n));
  // Nom accessible du lien (le chiffre de la pastille est masqué, la phrase est lue).
  assert.equal(await page.getByRole('link', { name: new RegExp(`^Nouveautés \\(${n} nouveautés non vues\\)$`) }).count(), 1, `nom accessible : ${b.text}`);

  // Même date, une entrée déjà vue : une seule non vue.
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ date: older.date, slugs: DATA.entries.slice(1).map((e) => e.slug), at: '2026-10-01T18:30:00Z' })]);
  await page.reload({ waitUntil: 'load' });
  b = await badge(page);
  assert.equal(b.digits, '1');
  assert.equal(await page.getByRole('link', { name: /^Nouveautés \(1 nouveauté non vue\)$/ }).count(), 1, `nom accessible : ${b.text}`);

  // Visite par le menu (navigation ClientRouter) : séparateur avant la première entrée déjà
  // vue, mémoire mise à jour, pastille remise à zéro.
  await Promise.all([page.waitForURL((u) => u.pathname === '/nouveautes/'), page.locator('#eywa-sidebar a[href="/nouveautes/"]').click()]);
  await page.waitForSelector('.news-seen-sep');
  const sep = await page.evaluate((slug) => {
    const s = document.querySelector('.news-seen-sep');
    const next = s.nextElementSibling?.querySelector('article')?.id;
    // L21 : séparateur entre deux listes (hors liste) — les nouvelles au-dessus.
    const before = s.previousElementSibling?.querySelectorAll('article').length ?? -1;
    return { text: s.textContent.replace(/\s+/g, ' ').trim(), next, before, count: document.querySelectorAll('.news-seen-sep').length, hiddenFromAT: s.getAttribute('aria-hidden') };
  }, older.slug);
  assert.equal(sep.count, 1);
  assert.equal(sep.next, older.slug, 'séparateur mal placé');
  assert.equal(sep.before, 1);
  assert.match(sep.text, /Déjà vu lors de ta visite du 1er octobre 2026/);
  assert.notEqual(sep.hiddenFromAT, 'true', 'séparateur caché aux lecteurs d’écran');
  assert.equal((await badge(page)).shown, false, 'pastille après la visite');
  const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
  // L21 : tous les slugs vus sont mémorisés (all: true), pas seulement ceux de la date la plus récente.
  assert.deepEqual(stored.slugs.sort(), DATA.entries.map((e) => e.slug).sort());
  assert.equal(stored.all, true);
  assert.equal(stored.date, newest.date);

  // Visite suivante : tout est vu, plus de séparateur ni de pastille.
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.locator('.news-seen-sep').count(), 0);
  await page.goto(`${env.base}/langue/`, { waitUntil: 'load' });
  assert.equal((await badge(page)).shown, false);
  await context.close();
});

test('téléphone : point sur le bouton menu tant qu’il reste des nouveautés non vues', { timeout: 60_000 }, async (t) => {
  const env = await setupBrowser(t);
  if (!env) return;
  const context = await env.browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${env.base}/pandora/`, { waitUntil: 'load' });
  assert.equal((await badge(page)).dot, false);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ date: '2026-09-01', slugs: [] })]);
  await page.reload({ waitUntil: 'load' });
  assert.equal((await badge(page)).dot, true, 'point absent sur le bouton menu');
  await page.click('#eywa-burger');
  await Promise.all([page.waitForURL((u) => u.pathname === '/nouveautes/'), page.locator('#eywa-sidebar a[href="/nouveautes/"]').click()]);
  await page.waitForTimeout(300);
  assert.equal((await badge(page)).dot, false, 'point après la visite');
  // Sans date de visite mémorisée : séparateur générique.
  assert.match(await page.locator('.news-seen-sep').count() ? await page.locator('.news-seen-sep').textContent() : '', /^$|Déjà vu lors de ta visite précédente/);
  await context.close();
});
