/**
 * Prüfstand (#1679): einen Prüfsatz lesen – Aufbau wie der Satz „Lebensläufe“ (FORMAT.md dort):
 *
 *   gemeinsam/organisationen.yaml            Absender (Schlüssel → name, …)
 *   <persona>/<lebenslauf>/lebenslauf.yaml   erwartete Mappen (typ, schluessel, werte)
 *   <persona>/<lebenslauf>/NN-<name>.md      YAML-Kopf = richtige Antwort, darunter der Text
 *   ausgabe/<persona>/<lebenslauf>/NN-<name>.<endung>   die Datei, die hochgeladen wird
 *   pruefstand.yaml (freiwillig)             paketAlias, typAlias, pakete – siehe README.md
 *
 * Die Zahl der Dokumente steht nirgends fest: gelesen wird, was da ist. Reihenfolge nach `datum`, dann `id`.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

const yaml = (datei) => parse(readFileSync(datei, 'utf8')) ?? {};
const ordner = (d) =>
  existsSync(d)
    ? readdirSync(d)
        .filter((n) => !n.startsWith('.') && statSync(join(d, n)).isDirectory())
        .sort()
    : [];

/** YAML-Kopf und Text eines Dokuments. */
export function liesDokument(text) {
  const teile = text.split(/^---\s*$/m);
  if (teile.length < 3 || teile[0].trim()) throw new Error('kein YAML-Kopf');
  return { kopf: parse(teile[1]) ?? {}, text: teile.slice(2).join('---').trim() };
}

/** Commit des Satzes (für den Bericht), leer ohne git. */
function commitVon(wurzel) {
  try {
    return execFileSync('git', ['-C', wurzel, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Datei zum Dokument unter ausgabe/ (beliebige Endung); null, wenn es keine gibt. */
function dateiZu(wurzel, persona, lauf, name) {
  const d = join(wurzel, 'ausgabe', persona, lauf);
  if (!existsSync(d)) return null;
  const f = readdirSync(d).find((n) => n.replace(/\.[^.]+$/, '') === name);
  return f ? join(d, f) : null;
}

/** Den ganzen Satz lesen; `fehler` sammelt, was nicht passt (das Dokument fällt dann weg). */
export function liesSatz(wurzel) {
  const fehler = [];
  const orgPfad = join(wurzel, 'gemeinsam', 'organisationen.yaml');
  const organisationen = existsSync(orgPfad) ? yaml(orgPfad) : {};
  const einstellungen = existsSync(join(wurzel, 'pruefstand.yaml')) ? yaml(join(wurzel, 'pruefstand.yaml')) : {};
  const mappen = new Map();
  const dokumente = [];
  for (const persona of ordner(wurzel).filter((p) => p !== 'ausgabe' && p !== 'gemeinsam')) {
    for (const lauf of ordner(join(wurzel, persona))) {
      const llPfad = join(wurzel, persona, lauf, 'lebenslauf.yaml');
      if (!existsSync(llPfad)) continue;
      const ll = yaml(llPfad);
      for (const m of ll.mappen ?? []) {
        const da = mappen.get(m.schluessel);
        if (da && da.typ !== m.typ) fehler.push(`${persona}/${lauf}: Mappe ${m.schluessel} mit anderem Typ als in ${da.lebenslauf}`);
        if (!da) mappen.set(m.schluessel, { ...m, werte: m.werte ?? {}, lebenslauf: `${persona}/${lauf}` });
      }
      const namen = readdirSync(join(wurzel, persona, lauf)).filter((n) => /^\d\d-.*\.md$/.test(n));
      for (const n of namen.sort()) {
        const name = n.slice(0, -3);
        try {
          const { kopf } = liesDokument(readFileSync(join(wurzel, persona, lauf, n), 'utf8'));
          const datei = dateiZu(wurzel, persona, lauf, name);
          if (!datei) throw new Error('Datei unter ausgabe/ fehlt');
          if (!kopf.id || !kopf.erwartung?.mappe) throw new Error('id oder erwartung.mappe fehlt');
          dokumente.push({
            ...kopf,
            datum: String(kopf.datum ?? ''),
            lebenslauf: `${persona}/${lauf}`,
            datei,
            md: join(wurzel, persona, lauf, n),
          });
        } catch (e) {
          fehler.push(`${persona}/${lauf}/${n}: ${e.message}`);
        }
      }
    }
  }
  dokumente.sort((a, b) => a.datum.localeCompare(b.datum) || String(a.id).localeCompare(String(b.id)));
  return { wurzel, commit: commitVon(wurzel), organisationen, einstellungen, mappen, dokumente, fehler };
}

/**
 * Wann jede Mappe entsteht: mit dem ersten Dokument (nach Datum), das sie als `mappe` oder in `weitere_mappen` nennt –
 * nach dessen Messung. Mappen, die kein Dokument nennt (Organisationen, Haus, Personen …), sind Grundmappen und
 * stehen von Anfang an da.
 */
export function entstehung(satz) {
  const mitDokument = new Map();
  for (const d of satz.dokumente)
    for (const s of [d.erwartung.mappe, ...(d.erwartung.weitere_mappen ?? [])])
      if (satz.mappen.has(s) && !mitDokument.has(s)) mitDokument.set(s, d.id);
  const grund = [...satz.mappen.keys()].filter((s) => !mitDokument.has(s));
  return { grund, mitDokument };
}

/** Schlüssel der Mappe, die für einen Absender steht: org_<a>, person_<a> oder eine Organisation gleichen Namens. */
export function absenderMappe(satz, absender) {
  if (!absender) return null;
  for (const s of [`org_${absender}`, `person_${absender}`]) if (satz.mappen.has(s)) return s;
  const name = satz.organisationen[absender]?.name;
  if (!name) return null;
  for (const [s, m] of satz.mappen) if (/:(organisation|person)$/.test(m.typ) && m.werte?.name === name) return s;
  return null;
}

/** Typ-Kennung in Ablago: erst typAlias (ganzer Typ), dann paketAlias (Teil vor dem Doppelpunkt). */
export function typKennung(satz, typ) {
  const e = satz.einstellungen ?? {};
  if (e.typAlias?.[typ]) return e.typAlias[typ];
  const [p, s] = String(typ).split(':');
  return s && e.paketAlias?.[p] ? `${e.paketAlias[p]}:${s}` : typ;
}

/** Pakete, die der Satz braucht: aus den Typen, dazu `pakete` aus pruefstand.yaml. */
export function noetigePakete(satz) {
  const ids = new Set(satz.einstellungen?.pakete ?? []);
  for (const m of satz.mappen.values()) ids.add(typKennung(satz, m.typ).split(':')[0]);
  return [...ids].sort();
}
