// L20 — page « Plan de travail » : ce qui est publié du plan (.cadence/raf.yaml).
// Repris d'evatosorus (L28), modèle finance-tracker : un lot n'apparaît que s'il est
// `visible: true` ET a un titre PUBLIC — son champ `public:`, sinon le titre de son entrée
// Nouveautés, sinon il est masqué ; JAMAIS le titre brut du plan. Liste blanche : id, titre
// public, état, date de livraison, décompte des sous-tâches (abandonnées exclues).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { publicPlan, parsePublicPlan, loadPublicPlan, publicTitleOf, newsTitlesByLot, checkPublicTitle, planSummary, stepsLabel, RECENT_DONE } from '../frontend/src/lib/plan-public.ts';

const { parse } = createRequire(new URL('../frontend/package.json', import.meta.url))('yaml');

const SECRET = 'PRIVE-NE-DOIT-PAS-SORTIR';

const plan = {
  version: 1,
  project: 'demo',
  lots: [
    { id: 'L1', title: `${SECRET} brut L1`, public: 'Ancienne amélioration', visible: true, status: 'done', created: '2026-09-01', finished: '2026-09-02', notes: [{ date: '2026-09-02', text: SECRET }] },
    { id: 'L2', title: `${SECRET} brut L2`, public: 'Ce qui est sur l’établi', visible: true, status: 'doing', created: '2026-09-03', started: '2026-09-04', notes: [{ date: '2026-09-04', text: SECRET }],
      tasks: [{ id: 't1', title: `${SECRET} sous-tâche`, status: 'done' }, { id: 't2', title: 'x', status: 'todo' }, { id: 't3', title: 'y', status: 'dropped' }, { id: 't4', title: 'z', status: 'dropped' }] },
    { id: 'L3', title: `${SECRET} brut L3`, visible: true, status: 'todo', created: '2026-09-05' },
    { id: 'L4', title: `${SECRET} brut L4`, public: 'Abandonné', visible: true, status: 'dropped', created: '2026-09-05', reason: SECRET },
    { id: 'L5', title: `${SECRET} brut L5`, visible: true, status: 'done', created: '2026-09-06', finished: '2026-09-20', ux: { date: '2026-09-20', verdict: SECRET } },
    { id: 'L6', title: `${SECRET} brut L6`, public: 'Invisible au visiteur', status: 'done', created: '2026-09-10', finished: '2026-09-21' },
    { id: 'L7', title: `${SECRET} brut L7`, public: 'La suite prévue', visible: true, status: 'todo', created: '2026-09-07' },
    { id: 'L8', title: 'Revue UX — Codex', visible: true, status: 'todo', created: '2026-09-07' },
  ],
};
// L5 a une Nouveauté ; L8 aussi, mais c'est un lot de processus (revue) : public: exigé.
const news = new Map([['L5', 'Une Nouveauté livrée'], ['L8', 'Le codex revu'], ['L3', undefined]]);

test('un lot n’apparaît que visible ET avec un titre public (public:, sinon titre de sa Nouveauté) ; abandonnés absents', () => {
  const p = publicPlan(plan, { newsTitles: news });
  assert.deepEqual(p.doing.map((l) => l.id), ['L2']);
  assert.deepEqual(p.todo.map((l) => l.id), ['L7'], 'L3 sans titre public, L8 revue sans public: → masqués');
  assert.deepEqual(p.done.map((l) => l.id), ['L5', 'L1'], 'L6 non visible → masqué');
  assert.equal(p.done[0].title, 'Une Nouveauté livrée');
  assert.equal(p.todo[0].title, 'La suite prévue');
});

test('liste blanche : id, titre PUBLIC, état, date de livraison, sous-tâches faites/total (abandonnées exclues des deux nombres)', () => {
  const p = publicPlan(plan, { newsTitles: news });
  assert.deepEqual(p.doing[0], { id: 'L2', title: 'Ce qui est sur l’établi', status: 'doing', tasks: { done: 1, total: 2 } });
  assert.deepEqual(p.done[1], { id: 'L1', title: 'Ancienne amélioration', status: 'done', finished: '2026-09-02' });
  assert.ok(!JSON.stringify(p).includes(SECRET), 'titre brut, note, verdict, raison ou sous-tâche publié');
});

test('public: prime sur le titre de la Nouveauté ; une revue avec public: est publiée', () => {
  const p = publicPlan({ lots: [
    { id: 'L1', title: 'brut', public: 'Titre choisi', visible: true, status: 'todo' },
    { id: 'L2', title: 'Revue UX — Films', public: 'Les pages Films revues', visible: true, status: 'todo' },
  ] }, { newsTitles: new Map([['L1', 'Titre de la Nouveauté']]) });
  assert.deepEqual(p.todo.map((l) => l.title), ['Titre choisi', 'Les pages Films revues']);
});

test('titre public non conforme (trop long, chemin, fichier, technique, identifiant de lot, sécurité) : le build échoue', () => {
  assert.equal(checkPublicTitle('  Un titre clair  ', 'L1'), 'Un titre clair');
  // Mots proches d'un nom de technique mais français courant : acceptés.
  for (const ok of ['Des variantes de couleurs', 'Une rapide visite', 'Le menu du téléphone']) assert.equal(checkPublicTitle(ok, 'L1'), ok);
  for (const bad of ['', 'x'.repeat(81), 'Page /nouveautes/', 'Lu depuis raf.yaml', 'Mémoire localStorage', 'Suite de L14', 'Faille XSS corrigée', 'Rôle ARIA du séparateur', 'Conforme WCAG', 'Généré au build', 'Navigation ClientRouter']) {
    assert.throws(() => checkPublicTitle(bad, 'L1'), /non conforme/, bad);
  }
  assert.throws(() => publicPlan({ lots: [{ id: 'L1', title: 'b', public: 'voir L2', visible: true, status: 'todo' }] }), /non conforme/);
});

test(`récemment livré : les ${RECENT_DONE} derniers lots terminés publiés, avec leur total`, () => {
  const many = { lots: Array.from({ length: RECENT_DONE + 4 }, (_, i) => ({ id: `L${i + 1}`, title: 'b', public: `Titre ${i + 1}`, visible: true, status: 'done', finished: `2026-09-${String(i + 1).padStart(2, '0')}` })) };
  const p = publicPlan(many);
  assert.equal(p.done.length, RECENT_DONE);
  assert.equal(p.done[0].id, `L${RECENT_DONE + 4}`);
  assert.deepEqual(p.counts, { doing: 0, todo: 0, done: RECENT_DONE + 4 });
});

test('plan vide, illisible ou lot incomplet : pas d’exception', () => {
  for (const bad of [null, undefined, {}, { lots: 'x' }, { lots: [null, 3, { id: 'L1' }, { id: 'L2', public: 'Titre', visible: true }] }]) {
    const p = publicPlan(bad);
    assert.deepEqual([p.doing, p.todo, p.done], [[], [], []], JSON.stringify(bad));
  }
});

test('newsTitlesByLot : titre de l’entrée la plus récente (première du JSON) citant le lot', () => {
  const m = newsTitlesByLot([
    { title: 'Récente', lots: ['L2', 'L3'] },
    { title: 'Ancienne', lots: ['L2'] },
    { title: 'Sans lots' },
  ]);
  assert.deepEqual([...m], [['L2', 'Récente'], ['L3', 'Récente']]);
});

test('le vrai raf.yaml : aucun titre brut (sauf s’il est aussi le titre public), aucune note ni sous-tâche publiée', () => {
  const text = readFileSync(new URL('../.cadence/raf.yaml', import.meta.url), 'utf8');
  const entries = JSON.parse(readFileSync(new URL('../frontend/public/nouveautes-data/nouveautes.json', import.meta.url), 'utf8')).entries;
  const p = parsePublicPlan(text, entries);
  const shown = [...p.doing, ...p.todo, ...p.done];
  assert.ok(shown.length > 0);
  const raf = parse(text);
  const titles = new Set(shown.map((l) => l.title));
  const out = JSON.stringify(p);
  for (const l of raf.lots) {
    if (!titles.has(l.title)) assert.ok(!out.includes(l.title), `${l.id} : titre brut publié`);
    for (const n of l.notes ?? []) assert.ok(!out.includes(n.text), `${l.id} : note publiée`);
    for (const t of l.tasks ?? []) if (!titles.has(t.title)) assert.ok(!out.includes(t.title), `${l.id}/${t.id} publié`);
  }
  for (const l of shown) assert.equal(raf.lots.find((x) => x.id === l.id).visible, true, `${l.id} non visible publié`);
});

test('bandeau de décomptes : accordé, espaces insécables, sans les groupes vides (« 0 prévu » n’est pas affiché)', () => {
  assert.deepEqual(planSummary({ doing: 2, todo: 0, done: 9 }), ['2\u00a0travaux en cours', '9\u00a0livrés']);
  assert.deepEqual(planSummary({ doing: 1, todo: 1, done: 1 }), ['1\u00a0travail en cours', '1\u00a0prévu', '1\u00a0livré']);
  assert.deepEqual(planSummary({ doing: 0, todo: 6, done: 0 }), ['6\u00a0prévus']);
  assert.deepEqual(planSummary({ doing: 0, todo: 0, done: 0 }), []);
});

test('lots au même titre public (une Nouveauté pour deux lots) : une seule ligne par groupe, date la plus récente, étapes additionnées', () => {
  const p = publicPlan({ lots: [
    { id: 'L19', title: 'b', visible: true, status: 'done', finished: '2026-10-01', tasks: [{ id: 't1', status: 'done' }] },
    { id: 'L20', title: 'b', visible: true, status: 'done', finished: '2026-10-03', tasks: [{ id: 't1', status: 'todo' }, { id: 't2', status: 'done' }] },
    { id: 'L21', title: 'b', visible: true, status: 'done', finished: '2026-10-02' },
    { id: 'L22', title: 'b', public: 'Même suite', visible: true, status: 'todo' },
    { id: 'L23', title: 'b', public: 'Même suite', visible: true, status: 'todo' },
  ] }, { newsTitles: new Map([['L19', 'Le codex se lit mieux'], ['L20', 'Le codex se lit mieux'], ['L21', 'Autre'], ['L22', 'Même suite'], ['L23', 'Même suite']]) });
  assert.deepEqual(p.done, [
    { id: 'L20', title: 'Le codex se lit mieux', status: 'done', finished: '2026-10-03', tasks: { done: 2, total: 3 }, also: ['L19'] },
    { id: 'L21', title: 'Autre', status: 'done', finished: '2026-10-02' },
  ]);
  assert.deepEqual(p.todo, [{ id: 'L22', title: 'Même suite', status: 'todo', also: ['L23'] }]);
  assert.deepEqual(p.counts, { doing: 0, todo: 1, done: 2 });
  // Même titre mais états différents : deux lignes (une en cours, une livrée).
  const q = publicPlan({ lots: [
    { id: 'A1', title: 'b', public: 'Même titre', visible: true, status: 'done', finished: '2026-10-01' },
    { id: 'A2', title: 'b', public: 'Même titre', visible: true, status: 'doing' },
  ] });
  assert.equal(q.done.length + q.doing.length, 2);
});

test('avancement : accord sur le nombre d’étapes faites (0 et 1 au singulier), espaces insécables', () => {
  const nb = (x) => x.replaceAll('\u00a0', ' ');
  assert.equal(nb(stepsLabel({ done: 0, total: 1 })), '0 étape faite sur 1');
  assert.equal(nb(stepsLabel({ done: 1, total: 2 })), '1 étape faite sur 2');
  assert.equal(nb(stepsLabel({ done: 2, total: 3 })), '2 étapes faites sur 3');
  assert.equal(nb(stepsLabel({ done: 13, total: 13 })), '13 étapes faites sur 13');
  assert.doesNotMatch(stepsLabel({ done: 2, total: 3 }), / /, 'espace sécable : le nombre peut se retrouver seul en fin de ligne');
});

test('raf.yaml absent ou illisible au build : erreur explicite (le build échoue), jamais une page vide', () => {
  assert.throws(() => loadPublicPlan('/nexiste/pas/raf.yaml', []), /raf\.yaml/);
  assert.throws(() => parsePublicPlan('version: 1\nproject: x\n', []), /lots/, 'plan sans liste de lots');
});

test('le vrai plan : tout lot en cours, visible et avec public: est publié en cours sous son titre public (vrai quel que soit l’état du plan)', () => {
  const text = readFileSync(new URL('../.cadence/raf.yaml', import.meta.url), 'utf8');
  const entries = JSON.parse(readFileSync(new URL('../frontend/public/nouveautes-data/nouveautes.json', import.meta.url), 'utf8')).entries;
  const raf = parse(text);
  const p = parsePublicPlan(text, entries);
  for (const lot of raf.lots.filter((l) => l.status === 'doing' && l.visible === true && l.public)) {
    const shown = p.doing.find((l) => l.id === lot.id || l.also?.includes(lot.id));
    assert.ok(shown, `${lot.id} en cours non publié en cours`);
    assert.equal(shown.title, lot.public.trim());
  }
});

test('le plan publié : les lots en cours visibles avec public: sont publiés en cours (plan de fixture, fait foi sans le vrai plan)', () => {
  const text = [
    'version: 1', 'project: demo', 'lots:',
    '  - { id: A1, title: brut, public: "Chantier un", visible: true, status: doing }',
    '  - { id: A2, title: brut, public: "Chantier deux", visible: true, status: doing }',
    '  - { id: A3, title: brut, public: "Caché", status: doing }',
  ].join('\n');
  const p = parsePublicPlan(text, []);
  assert.deepEqual(p.doing.map((l) => [l.id, l.title]), [['A1', 'Chantier un'], ['A2', 'Chantier deux']]);
});

test('public: qui n’est pas un texte d’une ligne (objet, liste, nombre, saut de ligne) : le build échoue', () => {
  for (const bad of [{ a: 'b' }, ['x', 'y'], 42, true, 'Deux\nlignes', 'Retour\r chariot']) {
    assert.throws(() => publicPlan({ lots: [{ id: 'L1', title: 'b', public: bad, visible: true, status: 'todo' }] }), /non conforme/, JSON.stringify(bad));
  }
  assert.throws(() => checkPublicTitle({ a: 'b' }, 'L1'), /non conforme/);
  assert.throws(() => checkPublicTitle(['x', 'y'], 'L1'), /non conforme/);
});

test('titre de Nouveauté en repli : pour un lot LIVRÉ seulement ; un lot prévu ou en cours qui partage la Nouveauté d’un lot livré reste masqué sans public:', () => {
  const news = new Map([['L1', 'Le codex se lit mieux'], ['L2', 'Le codex se lit mieux'], ['L3', 'Le codex se lit mieux']]);
  const p = publicPlan({ lots: [
    { id: 'L1', title: 'b', visible: true, status: 'done', finished: '2026-10-01' },
    { id: 'L2', title: 'b', visible: true, status: 'todo' },
    { id: 'L3', title: 'b', visible: true, status: 'doing' },
  ] }, { newsTitles: news });
  assert.deepEqual(p.done.map((l) => l.id), ['L1']);
  assert.deepEqual([p.todo, p.doing], [[], []]);
  assert.equal(publicTitleOf({ id: 'L2', title: 'b', status: 'todo' }, news), undefined);
  assert.equal(publicTitleOf({ id: 'L2', title: 'b', public: 'La suite', status: 'todo' }, news), 'La suite');
  assert.equal(publicTitleOf({ id: 'L1', title: 'b', status: 'done' }, news), 'Le codex se lit mieux');
  assert.equal(publicTitleOf({ id: 'L1', title: 'Audit des pages', status: 'done' }, news), undefined, 'lot de processus');
});
