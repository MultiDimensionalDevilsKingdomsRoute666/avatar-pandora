/**
 * L20 — ce que la page « Plan de travail » publie du plan (.cadence/raf.yaml, tenu par raf).
 * Repris d'evatosorus (L28, après sa relecture et sa revue UX), règles de finance-tracker :
 *
 *   1. seuls les lots `visible: true` (changements pour le visiteur) et non abandonnés ;
 *   2. TITRE PUBLIC seulement, jamais le titre brut du plan : le champ `public:` du lot,
 *      sinon le titre de son entrée Nouveautés, sinon le lot est masqué ; les lots de
 *      processus (revues, audits, campagnes) exigent un `public:` ;
 *   3. liste blanche : id, titre public, état, date de livraison, décompte des
 *      sous-tâches non abandonnées — jamais les notes, verdicts UX, raisons, titres de
 *      sous-tâches ;
 *   4. un titre public non conforme (> 80 caractères, chemin, fichier, nom de technique,
 *      identifiant de lot, sujet de sécurité) fait échouer le build : on corrige le
 *      plan, on ne publie pas.
 *
 * Module pur, testé par node --test (scripts/plan-public.test.mjs) ; la page l'appelle
 * au build.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export type PublicStatus = 'doing' | 'todo' | 'done';

export interface PublicLot {
  id: string;
  title: string;
  status: PublicStatus;
  /** Lot terminé : date de livraison (YYYY-MM-DD) si le plan la connaît. */
  finished?: string;
  /** Sous-tâches non abandonnées : combien sont faites sur combien. */
  tasks?: { done: number; total: number };
  /** Autres lots du même groupe au même titre public, fondus dans cette ligne. */
  also?: string[];
}

export interface PublicPlan {
  doing: PublicLot[];
  todo: PublicLot[];
  /** Les RECENT_DONE derniers lots terminés publiés, le plus récent en haut. */
  done: PublicLot[];
  counts: { doing: number; todo: number; done: number };
}

/** Nombre de lots livrés affichés (« récemment livré »). */
export const RECENT_DONE = 8;
export const PUBLIC_TITLE_MAX = 80;

const STATUSES: ReadonlySet<string> = new Set(['doing', 'todo', 'done']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: unknown): string | undefined => (typeof v === 'string' && DAY.test(v) ? v : undefined);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Même liste noire que finance-tracker (comparaison sans casse ni accents).
const DENY = [
  /securit/, /faille/, /spoof/, /injection/, /\btoken/, /\bjeton/, /secret/,
  /mot de passe/, /password/, /\bpin\b/, /\bcve\b/, /vulnerab/, /\bxss\b/,
  /\bcsrf\b/, /x-forwarded/, /forgeable/, /\bauth/, /bypass/,
];
const isDenied = (title: unknown) => DENY.some((re) => re.test(fold(String(title ?? ''))));

/** Noms de technique : le visiteur lit ce qui change pour lui, pas comment c'est fait. */
const TECH = [
  /localstorage/, /clientrouter/, /playwright/, /\baria\b/, /\bwcag\b/, /\bjson\b/, /\bya?ml\b/,
  /\bcss\b/, /\bhtml\b/, /\bjavascript\b/, /typescript/, /\bastro\b/, /\bapi\b/, /\bcadence\b/,
  /\braf\b/, /\bgit\b/, /\bcommit/, /\bbuild\b/,
];

/** Lots de processus : jamais publiés sans `public:` explicite. */
const PROCESS = [/^revue\b/, /^audit\b/, /^campagne\b/];
const isProcessLot = (title: unknown) => PROCESS.some((re) => re.test(fold(String(title ?? '')).trim()));

/** Titre montré au visiteur ; non conforme → erreur (le build échoue). */
export function checkPublicTitle(title: unknown, where: string): string {
  // Un `public:` YAML mal écrit peut être un objet ({a: b}) ou une liste ([x, y]) : publié tel
  // quel, il donnerait « [object Object] » ou « x,y ». Texte d'une seule ligne exigé.
  if (typeof title !== 'string') {
    throw new Error(`titre public de ${where} non conforme (pas un texte : ${JSON.stringify(title)})`);
  }
  const t = title.trim();
  const why =
    !t ? 'vide'
      : /[\r\n]/.test(t) ? 'plusieurs lignes'
      : t.length > PUBLIC_TITLE_MAX ? `${t.length} caractères (> ${PUBLIC_TITLE_MAX})`
        : t.includes('/') ? 'contient « / »'
          : /\.ya?ml\b/i.test(t) ? 'cite un fichier'
            : TECH.some((re) => re.test(fold(t))) ? 'nom de technique'
              : /\bL\d+\b/.test(t) ? 'cite un identifiant de lot'
                : isDenied(t) ? 'liste noire sécurité'
                  : null;
  if (why) throw new Error(`titre public de ${where} non conforme (${why}) : « ${t} »`);
  return t;
}

/** Entrées Nouveautés (du plus récent au plus ancien) → titre de la plus récente citant chaque lot. */
export function newsTitlesByLot(entries: readonly { title?: unknown; lots?: unknown }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of entries) {
    if (typeof e?.title !== 'string' || !Array.isArray(e.lots)) continue;
    for (const id of e.lots) if (!m.has(String(id))) m.set(String(id), e.title);
  }
  return m;
}

/**
 * Titre public brut d'un lot (non vérifié) : son `public:`, sinon — pour un lot LIVRÉ
 * seulement, hors lots de processus — le titre de la Nouveauté la plus récente qui le cite.
 * Un lot prévu ou en cours ne prend jamais le titre d'une Nouveauté (elle raconte ce qui est
 * livré, souvent avec un autre lot) : sans `public:`, il reste masqué. Partagé avec le test
 * de fuite (scripts/plan-page.e2e.test.mjs), pour qu'il applique la même règle.
 */
export function publicTitleOf(r: Record<string, unknown>, newsTitles: ReadonlyMap<string, string | undefined>): unknown {
  if (r.public != null) return r.public;
  if (r.status !== 'done' || isProcessLot(r.title)) return undefined;
  return newsTitles.get(String(r.id)) ?? undefined;
}

function toPublic(raw: unknown, newsTitles: ReadonlyMap<string, string | undefined>): (PublicLot & { sortKey: string }) | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.visible !== true || typeof r.id !== 'string') return null;
  if (typeof r.status !== 'string' || !STATUSES.has(r.status)) return null;
  if (isDenied(r.title)) return null;
  const title = publicTitleOf(r, newsTitles);
  if (title === undefined) return null;
  const lot: PublicLot & { sortKey: string } = {
    id: r.id,
    title: checkPublicTitle(title, r.id),
    status: r.status as PublicStatus,
    sortKey: day(r.finished) ?? day(r.started) ?? day(r.created) ?? '',
  };
  if (lot.status === 'done' && day(r.finished)) lot.finished = day(r.finished);
  if (Array.isArray(r.tasks)) {
    const states = r.tasks
      .filter((t) => typeof t === 'object' && t !== null && !isDenied((t as Record<string, unknown>).title))
      .map((t) => (t as Record<string, unknown>).status)
      .filter((s) => s !== 'dropped');
    if (states.length) lot.tasks = { done: states.filter((s) => s === 'done').length, total: states.length };
  }
  return lot;
}

const strip = ({ sortKey: _sortKey, ...lot }: PublicLot & { sortKey: string }): PublicLot => lot;

/**
 * Revue UX evatosorus L28 : deux lots d'un même groupe au même titre public (une Nouveauté qui en
 * raconte deux) ne font qu'une ligne — la première de la liste reçue (la plus récente
 * pour les livrés), étapes additionnées, les autres identifiants en `also`.
 */
function mergeSameTitle(group: (PublicLot & { sortKey: string })[]): (PublicLot & { sortKey: string })[] {
  const byTitle = new Map<string, PublicLot & { sortKey: string }>();
  for (const l of group) {
    const kept = byTitle.get(l.title);
    if (!kept) {
      byTitle.set(l.title, { ...l });
      continue;
    }
    kept.also = [...(kept.also ?? []), l.id];
    if (l.tasks) {
      const t = kept.tasks ?? { done: 0, total: 0 };
      kept.tasks = { done: t.done + l.tasks.done, total: t.total + l.tasks.total };
    }
  }
  return [...byTitle.values()];
}

export function publicPlan(
  plan: unknown,
  { newsTitles = new Map() }: { newsTitles?: ReadonlyMap<string, string | undefined> } = {},
): PublicPlan {
  const rawLots = typeof plan === 'object' && plan !== null ? (plan as { lots?: unknown }).lots : null;
  const lots = (Array.isArray(rawLots) ? rawLots : []).map((l) => toPublic(l, newsTitles)).filter((l) => l !== null);
  const doing = mergeSameTitle(lots.filter((l) => l.status === 'doing'));
  const todo = mergeSameTitle(lots.filter((l) => l.status === 'todo'));
  // Tri stable : à date égale, le lot le plus loin dans le plan (le plus récent) d'abord.
  const done = mergeSameTitle(lots
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.status === 'done')
    .sort((a, b) => b.l.sortKey.localeCompare(a.l.sortKey) || b.i - a.i)
    .map(({ l }) => l));
  return {
    doing: doing.map(strip),
    todo: todo.map(strip),
    done: done.slice(0, RECENT_DONE).map(strip),
    counts: { doing: doing.length, todo: todo.length, done: done.length },
  };
}

/**
 * Lit le texte de raf.yaml (schéma YAML 1.2 core : dates laissées en texte). Strict : un
 * plan sans liste de lots est une erreur (le build échoue), pas une page vide.
 */
export function parsePublicPlan(
  yamlText: string,
  newsEntries: readonly { title?: unknown; lots?: unknown }[] = [],
): PublicPlan {
  const plan: unknown = parse(yamlText);
  if (typeof plan !== 'object' || plan === null || !Array.isArray((plan as { lots?: unknown }).lots)) {
    throw new Error('.cadence/raf.yaml : pas de liste « lots » — plan illisible, build arrêté');
  }
  return publicPlan(plan, { newsTitles: newsTitlesByLot(newsEntries) });
}

/**
 * Lit raf.yaml sur disque au build. Fichier absent = erreur explicite (le build échoue) :
 * une page « rien de prévu » publiée par erreur serait un mensonge silencieux.
 */
export function loadPublicPlan(
  rafPath: string,
  newsEntries: readonly { title?: unknown; lots?: unknown }[] = [],
): PublicPlan {
  let text: string;
  try {
    text = readFileSync(rafPath, 'utf8');
  } catch (e) {
    throw new Error(`.cadence/raf.yaml introuvable (${rafPath}) : build arrêté — ${(e as Error).message}`);
  }
  return parsePublicPlan(text, newsEntries);
}

const count = (n: number, one: string, many: string) => `${n}\u00a0${n > 1 ? many : one}`;

/** Bandeau de décomptes de la page : groupes vides omis (pas de « 0 prévu »). */
export function planSummary(counts: PublicPlan['counts']): string[] {
  return [
    counts.doing ? count(counts.doing, 'travail en cours', 'travaux en cours') : '',
    counts.todo ? count(counts.todo, 'prévu', 'prévus') : '',
    counts.done ? count(counts.done, 'livré', 'livrés') : '',
  ].filter(Boolean);
}

/** Avancement d'un lot : « 1 étape faite sur 2 », « 2 étapes faites sur 3 » (0 et 1 au singulier). */
export function stepsLabel({ done, total }: { done: number; total: number }): string {
  return `${done}\u00a0${done > 1 ? 'étapes faites' : 'étape faite'}\u00a0sur\u00a0${total}`.replace(/ /g, '\u00a0');
}
