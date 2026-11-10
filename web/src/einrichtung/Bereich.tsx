import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../sprache';

/** Auf- und Zuklappen eines Bereichs im Mappentyp-Editor (#144). */
export interface Klappe { offen: boolean; umschalten(): void; fehler?: boolean }

/**
 * Ein einklappbarer Bereich: Kopf mit Titel und Kurzinfo, darunter der Inhalt.
 * Der Inhalt bleibt eingeklappt erhalten (nur verborgen), damit Eingaben und Ergebnisse nicht verloren gehen.
 */
export function Bereich({ id, titel, hilfe, kurz, beschreibung, klappe, children }: {
  id: string; titel: string; hilfe?: ReactNode; kurz?: ReactNode; beschreibung?: ReactNode; klappe: Klappe; children: ReactNode;
}) {
  const { offen, umschalten, fehler } = klappe;
  return (
    <section className={`blatt bereich${offen ? '' : ' zu'}${fehler ? ' mitfehler' : ''}`} id={id} aria-labelledby={`${id}-kopf`}>
      <div className="bereichkopf">
        <h2 className="h3">
          <button type="button" id={`${id}-kopf`} className="bereichknopf" aria-expanded={offen} aria-controls={`${id}-inhalt`} onClick={umschalten}>
            <span className="pfeil" aria-hidden="true">▸</span>{titel}
            {fehler && <span className="chip schlecht">{t('mappentypen.bereich.fehler')}</span>}
          </button>
          {hilfe}
        </h2>
        {!offen && kurz ? <p className="bereichkurz leise">{kurz}</p> : null}
      </div>
      <div id={`${id}-inhalt`} className="bereichinhalt" hidden={!offen}>
        {beschreibung && <p className="leise bereichtext">{beschreibung}</p>}
        {children}
      </div>
    </section>
  );
}

export const TYP_BEREICHE = [
  ['grunddaten', t('mappentypen.bereich.grunddaten')], ['felder', t('mappentypen.bereich.felder')], ['titel', t('mappentypen.bereich.titel')], ['trefferlisten', t('mappentypen.bereich.trefferlisten')],
  ['register', t('mappentypen.bereich.register')], ['archiv', t('mappentypen.bereich.archivmodus')], ['stempel', t('mappentypen.bereich.stempel-beim-weitergeben')], ['erkennung', t('mappentypen.bereich.erkennung')], ['berechtigungen', t('mappentypen.bereich.berechtigungen')], ['testlauf', t('mappentypen.bereich.testlauf')], ['pakete', t('mappentypen.bereich.pakete')], ['ki', t('mappentypen.bereich.ki')],
] as const;
export type TypBereich = (typeof TYP_BEREICHE)[number][0];

export const SICHT_BEREICHE = [
  ['grunddaten', t('mappentypen.bereich.grunddaten')], ['mappentypen', t('mappentypen.bereich.mappentypen')], ['trefferliste', t('mappentypen.bereich.trefferliste')], ['bedingungen', t('mappentypen.bereich.bedingungen')],
  ['berechtigungen', t('mappentypen.bereich.berechtigungen')], ['testlauf', t('mappentypen.bereich.testlauf')],
] as const;
export type SichtBereich = (typeof SICHT_BEREICHE)[number][0];

/** Mappentypen (#144) und Sichten (#148) merken sich getrennt, was offen ist. */
const SPEICHER = { typ: 'dms.typeditor.offen', sicht: 'dms.sichteditor.offen' } as const;

/** Welche Bereiche eines Mappentyps (bzw. einer Sicht) auf diesem Gerät offen sind; null = noch nichts gemerkt. */
export function liesOffen<T extends string = TypBereich>(id: string, art: keyof typeof SPEICHER = 'typ'): T[] | null {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER[art]) ?? '{}') as Record<string, unknown>;
    return Array.isArray(x[id]) ? (x[id] as T[]) : null;
  } catch { return null; }
}

export function merkeOffen(typId: string, offen: Iterable<string>, art: keyof typeof SPEICHER = 'typ') {
  try {
    const x = JSON.parse(localStorage.getItem(SPEICHER[art]) ?? '{}') as Record<string, unknown>;
    delete x[typId];
    x[typId] = [...offen];
    // Nicht endlos wachsen: die zuletzt bearbeiteten 200 Mappentypen.
    const keys = Object.keys(x);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete x[k];
    localStorage.setItem(SPEICHER[art], JSON.stringify(x));
  } catch { /* privates Fenster o. Ä. – dann eben nicht merken */ }
}

/**
 * Auf- und Zuklappen samt Sprungleiste für einen Editor (#144, #148): neu = alles offen,
 * bestehend = wie zuletzt auf diesem Gerät (sonst zu); ein Anker in der Adresse öffnet seinen Bereich.
 */
export function useBereiche<K extends string>(liste: ReadonlyArray<readonly [K, string]>, art: 'typ' | 'sicht', id: string | null) {
  const [auf, setAuf] = useState<Set<K>>(() => {
    const x = new Set<K>(!id ? liste.map(([k]) => k) : liesOffen<K>(id, art) ?? []);
    const h = location.hash.slice(1);
    if (liste.some(([k]) => k === h)) x.add(h as K);
    return x;
  });
  const stelle = (n: Set<K>) => { if (id) merkeOffen(id, n, art); return n; };
  const springe = (k: K) => setTimeout(() => document.getElementById(k)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  useEffect(() => { const h = location.hash.slice(1); if (liste.some(([k]) => k === h)) springe(h as K); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Sprungziel aus der Adresse nur beim ersten Anzeigen
  const oeffne = (ks: K[], springen = true) => {
    setAuf((x) => stelle(new Set([...x, ...ks])));
    if (springen && ks[0]) springe(ks[0]);
  };
  const klappe = (k: K, fehler?: boolean): Klappe => ({
    offen: auf.has(k), fehler,
    umschalten: () => setAuf((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return stelle(n); }),
  });
  const alle = auf.size === liste.length;
  const leiste = (fehler: (k: K) => boolean = () => false, label = t('mappentypen.bereich.bereiche')) => (
    <nav className="sprungleiste" aria-label={label}>
      {liste.map(([k, name]) => (
        <button key={k} type="button" className={`sprung${auf.has(k) ? ' an' : ''}${fehler(k) ? ' fehler' : ''}`} onClick={() => oeffne([k])}
          title={fehler(k) ? t('mappentypen.bereich.fehler-2', { name }) : name}>{name}{fehler(k) && <span className="fehlerpunkt" aria-label={t('mappentypen.bereich.mit-fehler')}>!</span>}</button>
      ))}
      <span className="luecke" aria-hidden="true" />
      <button type="button" className="textknopf klein" onClick={() => setAuf(stelle(alle ? new Set() : new Set(liste.map(([k]) => k))))}>
        {alle ? t('mappentypen.bereich.alle-zuklappen') : t('mappentypen.bereich.alle-aufklappen')}</button>
    </nav>
  );
  return { auf, klappe, oeffne, leiste, merke: (neueId: string) => merkeOffen(neueId, auf, art) };
}
