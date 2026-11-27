/**
 * Angebote beim Ausfüllen (#1724): Ein Paket meldet unter `code.angebote` an, dass es zu einem bestimmten Code auf einem
 * Dokument (#1723) Daten holen kann – z. B. `fahrzeuge.kba` zum QR-Code des Digitalen Untersuchungsberichts. Steht so
 * ein Code auf dem Dokument, zeigt Ablago beim „Aus Dokument ausfüllen“ im vorhandenen Hinweis („3 Felder als Vorschlag
 * eingetragen – bitte prüfen“) einen Knopf. Erst der Klick ruft das Paket (Paket-Aktion `dms:angebot`, #1039); die Werte
 * kommen als Vorschläge. Eigene Datei ohne Abhängigkeiten zur Laufzeit außer Kennungen, Codes und Sprache, damit Paket-
 * prüfung, Server und Oberfläche sie ohne Kreis nutzen.
 *
 * Regeln: kein Abruf im Hintergrund, kein Stapel, ein Abruf je Klick; Daten gehen erst nach dem Klick hinaus.
 */
import { SCHLUESSEL, TYPVERWEIS } from './kennungen';
import { type CodeAngaben, liesCodeAngaben } from './codes';
import { AUSGANGSSPRACHE, sprache } from './sprache';
import { t } from './texte';

/** Ab dieser Version kennt Ablago `code.angebote` (#1724); ältere übergehen die Angabe (kein Knopf). */
export const DMS_ANGEBOTE_AB = '0.338.0';
/** Höchstens so viele Angebote je Paket, so lang Text und Knopf (Zeichen). */
const ANGEBOTE_MAX = 10;
const ANGEBOT_TEXT_MAX = 200;
const ANGEBOT_KNOPF_MAX = 40;
const SPRACHE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** Ein Angebot, wie Ablago es aus dem Manifest liest und mit dem Code des Pakets speichert. */
export interface AusfuellAngebot {
  schluessel: string;
  /** Mappentypen als Verweis wie in `code.rechte` (eigener Schlüssel, `paket:typ`). */
  mappentypen: string[];
  /** Welcher Code passt: `muster` (Pflicht, Anfang des Inhalts) und optional `codeart` – wie an einem Feld (#1723). */
  code: CodeAngaben & { muster: string };
  /** Frage im Hinweis, z. B. „QR-Code zum Digitalen Untersuchungsbericht erkannt. Daten beim KBA abrufen und eintragen?“ */
  text: string;
  /** Beschriftung des Knopfs; fehlt = „Abrufen und eintragen“. */
  knopf?: string;
  /** Übersetzungen: Sprache → { text, knopf }. */
  beschriftungen?: Record<string, { text?: string; knopf?: string }>;
}

/** Ein Angebot an einem Ergebnis von „Aus Dokument ausfüllen“ – für den Knopf im Hinweis. */
export interface AngebotBeimAusfuellen {
  paket: { id: string; name: string };
  schluessel: string;
  text: string;
  knopf?: string;
  beschriftungen?: AusfuellAngebot['beschriftungen'];
  /** Das Dokument mit dem passenden Code. */
  dokument: string;
}

const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Übersetzungen lesen: je Sprache Text und Knopf in den Grenzen; Ungültiges fällt still weg. */
function liesBeschriftungen(v: unknown): AusfuellAngebot['beschriftungen'] | undefined {
  if (!istObjekt(v)) return undefined;
  const r: NonNullable<AusfuellAngebot['beschriftungen']> = {};
  for (const [spr, b] of Object.entries(v).slice(0, 30)) {
    if (!SPRACHE.test(spr) || !istObjekt(b)) continue;
    const text = str(b.text).slice(0, ANGEBOT_TEXT_MAX);
    const knopf = str(b.knopf).slice(0, ANGEBOT_KNOPF_MAX);
    if (text || knopf) r[spr] = { ...(text ? { text } : {}), ...(knopf ? { knopf } : {}) };
  }
  return Object.keys(r).length ? r : undefined;
}

/** Ein Angebot lesen; Fehler mit der Stelle. */
function liesEines(a: unknown, nr: number, gesehen: Set<string>, fehler: string[]): AusfuellAngebot | null {
  const f = (grund: string) => fehler.push(t('gemeinsam.pakete.code-angebot', { nr, grund }));
  if (!istObjekt(a)) return (f(t('gemeinsam.pakete.code-angebot-objekt')), null);
  const schluessel = str(a.schluessel);
  if (!SCHLUESSEL.test(schluessel) || gesehen.has(schluessel)) f(t('gemeinsam.pakete.code-angebot-schluessel', { schluessel }));
  gesehen.add(schluessel);
  const mappentypen = (Array.isArray(a.mappentypen) ? a.mappentypen : []).map(str);
  if (!mappentypen.length || mappentypen.some((v) => !TYPVERWEIS.test(v) || v.startsWith('dms:')))
    f(t('gemeinsam.pakete.code-angebot-mappentypen'));
  const code = liesCodeAngaben(istObjekt(a.code) ? a.code : {});
  if (!code.muster) f(t('gemeinsam.pakete.code-angebot-muster'));
  const text = str(a.text);
  const knopf = str(a.knopf);
  if (!text || text.length > ANGEBOT_TEXT_MAX || knopf.length > ANGEBOT_KNOPF_MAX)
    f(t('gemeinsam.pakete.code-angebot-text', { text: ANGEBOT_TEXT_MAX, knopf: ANGEBOT_KNOPF_MAX }));
  const beschriftungen = liesBeschriftungen(a.beschriftungen);
  return {
    schluessel,
    mappentypen: [...new Set(mappentypen)],
    code: { ...code, muster: code.muster ?? '' },
    text,
    ...(knopf ? { knopf } : {}),
    ...(beschriftungen ? { beschriftungen } : {}),
  };
}

/**
 * `code.angebote` lesen (Paketprüfung, `liesCode`): eine Liste mit höchstens {@link ANGEBOTE_MAX} Einträgen. Gibt
 * `{ angebote }` nur zurück, wenn es welche gibt – so bleibt der Code ohne Angebote, wie er war.
 */
export function liesAngebote(roh: unknown, fehler: string[]): { angebote?: AusfuellAngebot[] } {
  if (roh === undefined || roh === null) return {};
  if (!Array.isArray(roh) || roh.length > ANGEBOTE_MAX) {
    fehler.push(t('gemeinsam.pakete.code-angebote-liste', { max: ANGEBOTE_MAX }));
    return {};
  }
  const gesehen = new Set<string>();
  const angebote = roh.map((a, i) => liesEines(a, i + 1, gesehen, fehler)).filter((a): a is AusfuellAngebot => !!a);
  return angebote.length ? { angebote } : {};
}

/** Text und Knopf eines Angebots in der Sprache der Person – sonst der Ausgangstext; ohne Knopf der Standard. */
export function angebotTexte(a: Pick<AusfuellAngebot, 'text' | 'knopf' | 'beschriftungen'>, spr = sprache()) {
  const b = spr === AUSGANGSSPRACHE ? undefined : a.beschriftungen?.[spr];
  return { text: b?.text ?? a.text, knopf: b?.knopf ?? a.knopf ?? t('gemeinsam.pakete.angebot-knopf') };
}
