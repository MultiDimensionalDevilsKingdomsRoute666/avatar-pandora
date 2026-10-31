// L10 — revue UX de la page Langue. Lit frontend/dist ; skip sans playwright-core/Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBrowser, worstPixelContrast } from './lib/e2e-dist.mjs';

async function open(t, width = 1440) {
  const env = await setupBrowser(t);
  if (!env) return null;
  const page = await env.browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${env.base}/langue/`, { waitUntil: 'load' });
  return page;
}

test('R1 — les liens du texte se distinguent autrement que par la couleur : soulignés (WCAG 1.4.1)', { timeout: 60_000 }, async (t) => {
  const page = await open(t);
  if (!page) return;
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('article a')].map((a) => ({ t: a.textContent.trim(), u: getComputedStyle(a).textDecorationLine })));
  assert.ok(links.length >= 5, `liens trouvés : ${links.length}`);
  assert.deepEqual(links.filter((l) => !l.u.includes('underline')), []);
});

test('R2 — un lien qui ouvre un nouvel onglet le dit dans son nom accessible (WCAG 3.2.5 / G201)', { timeout: 60_000 }, async (t) => {
  const page = await open(t);
  if (!page) return;
  const links = await page.locator('article a[target="_blank"]').all();
  assert.ok(links.length >= 5, `liens externes : ${links.length}`);
  for (const link of links) {
    assert.match(await link.textContent(), /\(nouvel onglet\)/, `lien « ${(await link.textContent()).trim()} »`);
    assert.equal(await link.locator('.sr-only').count(), 1, 'la mention est lue, pas affichée');
  }
});

test('R3 — le lexique est un tableau nommé, à en-têtes de colonne déclarés (WCAG 1.3.1)', { timeout: 60_000 }, async (t) => {
  const page = await open(t);
  if (!page) return;
  const info = await page.evaluate(() => {
    const table = document.querySelector('article table');
    const ref = table.getAttribute('aria-labelledby');
    return {
      name: ref ? document.getElementById(ref)?.textContent.trim() : null,
      scopes: [...table.querySelectorAll('th')].map((th) => th.getAttribute('scope')),
    };
  });
  assert.equal(info.name, 'Lexique de base');
  assert.deepEqual(info.scopes, ['col', 'col']);
});

test('R4 — les mots Na\'vi sont balisés comme une autre langue (WCAG 3.1.2) : le lexique, les exemples de grammaire', { timeout: 60_000 }, async (t) => {
  const page = await open(t);
  if (!page) return;
  const r = await page.evaluate(() => ({
    lexicon: [...document.querySelectorAll('article table tbody td:first-child em')].map((e) => e.getAttribute('lang')),
    grammar: [...document.querySelectorAll('article section:nth-of-type(3) li em')].filter((e) => /^(Oel ngati|Ngati oel|Eveng|Tar-ol|tar|oeng|moe)/.test(e.textContent))
      .map((e) => [e.textContent, e.getAttribute('lang')]),
    french: [...document.querySelectorAll('article em[lang]')].filter((e) => e.textContent === 'Avatar').length,
  }));
  assert.equal(r.lexicon.length, 13);
  assert.deepEqual(r.lexicon.filter((l) => l !== 'art-x-navi'), []);
  assert.equal(r.grammar.length, 7, JSON.stringify(r.grammar));
  assert.deepEqual(r.grammar.filter(([, l]) => l !== 'art-x-navi'), []);
  assert.equal(r.french, 0, 'le titre « Avatar » reste en français');
});

for (const width of [1440, 390]) {
  test(`R5 — la ligne de source garde ≥ 4,5:1 au pire pixel du fond @${width}px (WCAG 1.4.3)`, { timeout: 120_000 }, async (t) => {
    const page = await open(t, width);
    if (!page) return;
    await page.evaluate(() => document.fonts.ready);
    const sel = 'article > p:last-child';
    const color = await page.locator(sel).evaluate((n) => getComputedStyle(n).color);
    assert.doesNotMatch(color, /\//, `couleur translucide (${color}) : le contraste dépendrait du fond`);
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    const { worst, glyphs } = await worstPixelContrast(page, sel);
    assert.ok(glyphs > 20, 'glyphes non détectés');
    assert.ok(worst >= 4.5, `${worst.toFixed(2)}:1`);
  });
}

for (const width of [1440, 390, 320]) {
  test(`R6 — page Langue @${width}px : aucun débordement horizontal, tableau compris`, { timeout: 60_000 }, async (t) => {
    const page = await open(t, width);
    if (!page) return;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    const right = await page.evaluate(() => document.querySelector('article table').getBoundingClientRect().right);
    assert.ok(right <= width, `tableau jusqu'à ${right}px`);
  });
}
