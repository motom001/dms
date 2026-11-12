/**
 * Inhaltlicher Vergleich eines Mappentyps mit dem Stand, den ein Paket mitgebracht hat (#653).
 * Statt „irgendwann nach der Installation gespeichert“ zählt nur, was sich wirklich unterscheidet:
 * Felder (hinzugefügt, entfernt, geändert), Register, Beschreibung, Titel.
 */
import type { Anzeigeregel, Feld, Mappentyp } from './model';
import { t } from './texte';

/** Was vom Mappentyp verglichen wird – ohne Ids anderer Typen (Verweisziele bleiben als Id, die bleibt im selben DMS gleich). */
export interface TypBild {
  name: string; beschreibung: string; titelVorlage: string;
  /** Name und Beschreibung je Sprache (#728); fehlt in älteren Ständen. */
  beschriftungen?: Mappentyp['beschriftungen'];
  felder: Array<{ key: string; label: string; werte: Record<string, unknown> }>;
  register: Array<{ key: string; name: string; werte: Record<string, unknown> }>;
}

/** Eigenschaften eines Felds, die eine inhaltliche Änderung sind (Name extra, damit „umbenannt“ lesbar wird). */
const FELD = ['typ', 'pflicht', 'eindeutig', 'hilfe', 'standard', 'minLen', 'maxLen', 'muster', 'min', 'max', 'nachkomma', 'waehrung', 'optionen', 'mehrfach', 'zielTyp', 'zielTypen', 'gleicherTyp', 'zielOptional', 'verweisart', 'frist', 'auswahlFilter', 'folgtAus', 'vorbelegen', 'erkennung', 'format', 'landFeld', 'beschriftungen', 'ausgeblendet', 'quelle'] as const;
const NAMEN: Record<string, string> = {
  typ: 'Art', pflicht: 'Pflicht', eindeutig: 'eindeutig', hilfe: t('gemeinsam.typvergleich.hilfetext'), standard: 'Vorgabe', minLen: 'Mindestlänge', maxLen: 'Höchstlänge', muster: 'Muster',
  min: 'Untergrenze', max: 'Obergrenze', nachkomma: 'Nachkommastellen', waehrung: 'Währung', optionen: 'Auswahlwerte', mehrfach: 'Mehrfachauswahl', zielTyp: 'Ziel', zielTypen: 'Ziel', gleicherTyp: t('gemeinsam.typvergleich.gleicher-typ'), zielOptional: t('gemeinsam.typvergleich.ziel-optional'),
  verweisart: 'Verweisart', frist: 'Frist', auswahlFilter: 'Auswahlfilter', folgtAus: t('gemeinsam.typvergleich.folgt-aus'), vorbelegen: t('gemeinsam.typvergleich.vorbelegen'), erkennung: 'Aus Dokument füllen', format: 'Format', landFeld: t('gemeinsam.typvergleich.land-feld'), beschriftungen: t('gemeinsam.typvergleich.beschriftungen'),
  name: 'Name', art: 'Art', felder: 'Felder', quellen: 'Quellen', quelle: t('gemeinsam.typvergleich.tabelle'),
  ausgeblendet: t('gemeinsam.typvergleich.ausgeblendet'), abschnitte: t('gemeinsam.typvergleich.abschnitte'),
};
/** Name einer Eigenschaft eines Felds oder Registers, z. B. „Auswahlwerte“ (auch für die Fassungen, #1006). */
export const eigenschaftName = (k: string): string => NAMEN[k] ?? k;
/** Leere Werte (undefined, null, false, '', []) gelten als „nicht gesetzt“ – Speichern ohne Änderung zählt nicht. */
const leer = (v: unknown) => v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && !v.length);
const sauber = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => !leer(v)).sort(([a], [b]) => a.localeCompare(b)));
const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Bild eines Mappentyps. Ziele (#1036): ein fester Zieltyp steht wie in älteren Ständen unter `zielTyp`, mehrere unter
 * `zielTypen`; Typen, die über `zielOptional` dazukamen (`kennungVon` kennt ihre Kennung), zählen nicht – dass ein anderes
 * Paket später kam, ist keine eigene Änderung.
 */
export function typBild(t: Mappentyp, kennungVon?: (typId: string) => string | undefined): TypBild {
  const ziele = (f: Feld): Record<string, unknown> => {
    if (f.typ !== 'referenz') return {};
    const fest = (f.zielTypen ?? []).filter((id) => !f.zielOptional?.includes(kennungVon?.(id) ?? ''));
    return fest.length === 1 ? { zielTyp: fest[0], zielTypen: undefined } : { zielTyp: undefined, zielTypen: fest };
  };
  const feld = (f: Feld) => { const x = { ...f, ...ziele(f) } as unknown as Record<string, unknown>; return { key: f.key, label: f.label, werte: sauber(Object.fromEntries(FELD.map((k) => [k, x[k]]))) }; };
  return {
    name: t.name, beschreibung: t.beschreibung ?? '', titelVorlage: t.titelVorlage ?? '',
    ...(t.beschriftungen ? { beschriftungen: t.beschriftungen } : {}),
    felder: t.felder.filter((f) => !f.system).map(feld),
    register: t.register.map((r) => ({ key: r.key, name: r.name, werte: sauber({ art: r.art, felder: r.felder, quellen: r.quellen, beschriftungen: r.beschriftungen, abschnitte: r.abschnitte?.map((a) => (a.anzeigen ? { ...a, anzeigen: optionaleAlsKennung(a.anzeigen, t, kennungVon) } : a)), ausgeblendet: r.ausgeblendet }) })),
  };
}

/**
 * Anzeige-Bedingungen „zeigt auf Mappe vom Typ …“ auf ein optionales Ziel (#1122): Bis das Paket da ist, steht die
 * Kennung darin, danach die Id – für den Vergleich gilt beides als die Kennung, das spätere Paket ist keine eigene Änderung.
 */
function optionaleAlsKennung(a: Anzeigeregel, typ: Mappentyp, kennungVon?: (typId: string) => string | undefined): Anzeigeregel {
  if (!kennungVon) return a;
  const k = (feld: string, id: string) => { const opt = typ.felder.find((f) => f.key === feld)?.zielOptional; const x = kennungVon(id); return x && opt?.includes(x) ? x : id; };
  return { ...a, bedingungen: a.bedingungen.map((b) => {
    if (b.art === 'verweistyp') return { ...b, typ: k(b.feld, b.typ) };
    if (b.art !== 'feld' || b.bedingung.op !== 'zeigtAufTyp' || b.bedingung.wert?.art !== 'fest' || !Array.isArray(b.bedingung.wert.wert)) return b;
    return { ...b, bedingung: { ...b.bedingung, wert: { ...b.bedingung.wert, wert: b.bedingung.wert.wert.map((x) => k(b.bedingung.feld, String(x))) } } };
  }) };
}

export interface TypUnterschiede {
  /** Kurzfassung, z. B. „+2 Felder · 1 Feld geändert“. */
  kurz: string;
  /** Je Unterschied ein lesbarer Satz. */
  liste: string[];
}

/** Unterschiede vom Paketstand zum heutigen Stand; null = inhaltlich gleich. */
export function typUnterschiede(alt: TypBild, neu: TypBild): TypUnterschiede | null {
  const liste: string[] = [];
  let plus = 0, minus = 0, anders = 0, register = 0;
  const altF = new Map(alt.felder.map((f) => [f.key, f] as const));
  const neuF = new Map(neu.felder.map((f) => [f.key, f] as const));
  for (const f of neu.felder) if (!altF.has(f.key)) { plus++; liste.push(t('gemeinsam.typvergleich.feld-hinzugefuegt', { label: f.label })); }
  for (const f of alt.felder) if (!neuF.has(f.key)) { minus++; liste.push(t('gemeinsam.typvergleich.feld-entfernt', { label: f.label })); }
  for (const f of neu.felder) {
    const a = altF.get(f.key);
    if (!a) continue;
    const was: string[] = [];
    if (a.label !== f.label) was.push(t('gemeinsam.typvergleich.umbenannt-von', { label: a.label }));
    for (const k of new Set([...Object.keys(a.werte), ...Object.keys(f.werte)])) if (!gleich(a.werte[k], f.werte[k])) was.push(NAMEN[k] ?? k);
    if (was.length) { anders++; liste.push(t('gemeinsam.typvergleich.feld', { label: f.label, was: was.join(', ') })); }
  }
  const altR = new Map(alt.register.map((r) => [r.key, r] as const));
  const neuR = new Map(neu.register.map((r) => [r.key, r] as const));
  for (const r of neu.register) {
    const a = altR.get(r.key);
    if (!a) { register++; liste.push(t('gemeinsam.typvergleich.register-hinzugefuegt', { name: r.name })); continue; }
    const was = [...(a.name !== r.name ? [t('gemeinsam.typvergleich.umbenannt-von-2', { name: a.name })] : []), ...[...new Set([...Object.keys(a.werte), ...Object.keys(r.werte)])].filter((k) => !gleich(a.werte[k], r.werte[k])).map((k) => NAMEN[k] ?? k)];
    if (was.length) { register++; liste.push(t('gemeinsam.typvergleich.register', { name: r.name, was: was.join(', ') })); }
  }
  for (const r of alt.register) if (!neuR.has(r.key)) { register++; liste.push(t('gemeinsam.typvergleich.register-entfernt', { name: r.name })); }
  if (alt.name !== neu.name) liste.push(t('gemeinsam.typvergleich.name', { name: alt.name, name2: neu.name }));
  if (alt.beschreibung !== neu.beschreibung) liste.push(t('gemeinsam.typvergleich.beschreibung-geaendert'));
  if (alt.titelVorlage !== neu.titelVorlage) liste.push(t('gemeinsam.typvergleich.titel-geaendert'));
  if (!gleich(alt.beschriftungen, neu.beschriftungen)) liste.push(t('gemeinsam.typvergleich.beschriftungen-geaendert'));
  if (!liste.length) return null;
  const teile = [
    plus ? `+${plus} ${t('gemeinsam.typvergleich.felder', { anzahl: plus })}` : '',
    minus ? `−${minus} ${t('gemeinsam.typvergleich.felder', { anzahl: minus })}` : '',
    anders ? `${anders} ${t('gemeinsam.typvergleich.felder', { anzahl: anders })} geändert` : '',
    register ? `${register} ${t('gemeinsam.typvergleich.register-2', { anzahl: register })} geändert` : '',
  ].filter(Boolean);
  return { kurz: teile.length ? teile.join(' · ') : t('gemeinsam.typvergleich.angaben-geaendert'), liste };
}
