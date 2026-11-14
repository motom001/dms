import type { ReactNode } from 'react';
import { Knopf } from '../bausteine';
import { ereignisSchluessel, istKatalogArt } from '../../../shared/src/ereignisse';
import { automatisierungKlartext, kurzanleitungIn, legtNichtsAn, mitkommtKurz, type Mitkommt, type MitkommtEintrag } from '../../../shared/src/mitkommt';
import { sprache } from '../../../shared/src/sprache';
import type { AktionRecht } from '../../../shared/src/paketaktionen';
import { Hilfe } from '../Hilfe';
import { t } from '../sprache';
import { rechteText } from './PaketAktionen';

/**
 * „Was mitkommt“ (#1047): alles, was ein Paket mitbringt – in der Reihenfolge der Paketseite im Katalog, mit
 * Automatisierungen als „Wenn … → Dann …“. In der Vorschau eines Updates trägt, was dazukommt, „neu in dieser Version“.
 * Dazu die Kurzanleitung „So nutzt du es“.
 */

/** Name eines Ereignisses aus dem Katalog (#670); Pakete-eigene Arten bleiben, wie sie sind. */
const ereignisName = (art: string) => (istKatalogArt(art) ? t.frei(`ereignisse.name.${ereignisSchluessel(art)}`) : art);

const Neu = ({ e }: { e: { neu?: boolean } }) => (e.neu ? <> <span className="chip">{t('werkbank.pakete.mitkommt.neu')}</span></> : null);

/** Ein Abschnitt mit Überschrift, nur wenn er etwas enthält. */
function Teil({ titel, text, children }: { titel: string; text?: string; children: ReactNode }) {
  return (
    <div className="mitkommt-teil">
      <h3 className="h4">{titel}</h3>
      {text && <p className="leise klein">{text}</p>}
      {children}
    </div>
  );
}

/** Name und eine Zeile Beschreibung je Eintrag. */
function Namen({ liste, zusatz }: { liste: MitkommtEintrag[]; zusatz?(e: MitkommtEintrag): ReactNode }) {
  return (
    <ul className="klein">
      {liste.map((e) => <li key={e.schluessel}><strong>{e.name}</strong>{zusatz?.(e)}<Neu e={e} />{e.beschreibung && <span className="leise mitkommt-zeile">{e.beschreibung}</span>}</li>)}
    </ul>
  );
}

/** „Rechte und Netz“ in einem Satz – die Liste der Rechte steht in der Vorschau bzw. darunter (rechte). */
function rechteKurz(m: Mitkommt) {
  if (m.sprache) return t('werkbank.pakete.mitkommt.rechte.sprache');
  if (!m.code) return t('werkbank.pakete.mitkommt.rechte.ohne-code');
  return m.netz ? t('werkbank.pakete.mitkommt.rechte.netz') : t('werkbank.pakete.mitkommt.rechte.ohne-netz');
}

/**
 * Der Inhalt von „Was mitkommt“. rechte: die Rechte des Codes als Zeilen (Paketseite); in der Vorschau stehen sie
 * schon mit dem Haken zum Bestätigen darüber.
 */
export function MitkommtInhalt({ m, rechte }: { m: Mitkommt; rechte?: string[] }) {
  const vorgaben = m.vorgaben.reduce((n, v) => n + v.namen.length, 0);
  return (
    <div className="stapel mitkommt">
      {legtNichtsAn(m) && !m.sprache && <p className="klein">{m.code ? t('werkbank.pakete.mitkommt.nichts-code') : t('werkbank.pakete.mitkommt.nichts')}</p>}
      {m.mappentypen.length > 0 && <Teil titel={t('werkbank.pakete.mitkommt.mappentypen')}><Namen liste={m.mappentypen} zusatz={(e) => { const n = (e as Mitkommt['mappentypen'][number]).felder; return n > 0 ? <span className="leise"> · {t('werkbank.pakete.mitkommt.felder', { anzahl: n })}</span> : null; }} /></Teil>}
      {m.sichten.length > 0 && <Teil titel={t('werkbank.pakete.mitkommt.sichten')}><Namen liste={m.sichten} /></Teil>}
      {(vorgaben > 0 || m.vorlagen > 0) && (
        <Teil titel={t('werkbank.pakete.mitkommt.vorgaben')} text={t('werkbank.pakete.mitkommt.vorgaben.text')}>
          <ul className="klein">
            {m.vorgaben.map((v) => <li key={v.typ}><strong>{v.typ}:</strong> {v.namen.map((n, i) => <span key={n}>{i > 0 && ' · '}{n}{v.neu?.includes(n) && <> <span className="chip">{t('werkbank.pakete.mitkommt.neu')}</span></>}</span>)}</li>)}
            {m.vorlagen > 0 && <li>{t('werkbank.pakete.mitkommt.vorlagen', { anzahl: m.vorlagen })}</li>}
          </ul>
        </Teil>
      )}
      {m.beispiele > 0 && <Teil titel={t('werkbank.pakete.mitkommt.beispiele')}><p className="klein">{t('werkbank.pakete.mitkommt.beispiele.text', { anzahl: m.beispiele })}{m.beispielDokumente > 0 && ` ${t('werkbank.pakete.mitkommt.beispiele.dokumente', { anzahl: m.beispielDokumente })}`}</p></Teil>}
      {m.wortlisten.length > 0 && (
        <Teil titel={t('werkbank.pakete.mitkommt.wortlisten')} text={t('werkbank.pakete.mitkommt.wortlisten.text')}>
          <ul className="klein">{m.wortlisten.map((g) => <li key={g.join('|')}>{g.join(' · ')}</li>)}</ul>
        </Teil>
      )}
      {m.automatisierungen.length > 0 && (
        <Teil titel={t('werkbank.pakete.mitkommt.automatisierungen')} text={t('werkbank.pakete.mitkommt.automatisierungen.text')}>
          <ul className="klein stapel">
            {m.automatisierungen.map((a) => {
              const k = automatisierungKlartext(a, ereignisName);
              return (
                <li key={a.schluessel}>
                  <strong>{a.name}</strong><Neu e={a} />{a.beschreibung && <span className="leise mitkommt-zeile">{a.beschreibung}</span>}
                  <span className="mitkommt-zeile"><span className="leise">{t('werkbank.pakete.mitkommt.wenn')}</span> {k.wenn} <span aria-hidden="true">→</span><span className="sr">{t('werkbank.pakete.mitkommt.dann-sr')}</span> {k.dann}</span>
                  <span className="leise mitkommt-zeile">{k.ablauf} · {a.an ? t('werkbank.pakete.mitkommt.an') : t('werkbank.pakete.mitkommt.aus')}</span>
                </li>
              );
            })}
          </ul>
        </Teil>
      )}
      {m.ablaufvorlagen.length > 0 && (
        <Teil titel={t('werkbank.pakete.mitkommt.ablaufvorlagen')} text={t('werkbank.pakete.mitkommt.ablaufvorlagen.text')}>
          <Namen liste={m.ablaufvorlagen} zusatz={(e) => <span className="leise">: {(e as Mitkommt['ablaufvorlagen'][number]).karten.join(', ')}</span>} />
        </Teil>
      )}
      {m.aktionen.length > 0 && (
        <Teil titel={t('werkbank.pakete.mitkommt.aktionen')} text={t('werkbank.pakete.mitkommt.aktionen.text')}>
          <Namen liste={m.aktionen} zusatz={(e) => <span className="leise"> · {t('werkbank.pakete.mitkommt.braucht', { rechte: rechteText((e as Mitkommt['aktionen'][number]).rechte as AktionRecht[]) })}</span>} />
        </Teil>
      )}
      {m.einstellungen.length > 0 && (
        <Teil titel={t('werkbank.pakete.mitkommt.einstellungen')} text={t('werkbank.pakete.mitkommt.einstellungen.text')}>
          <ul className="klein">{m.einstellungen.map((e) => <li key={e.titel}><strong>{e.titel}</strong>{e.liste && <span className="leise"> {t('werkbank.pakete.mitkommt.liste')}</span>}<Neu e={e} /><span className="leise mitkommt-zeile">{e.felder.map((f) => f.name).join(' · ')}</span></li>)}</ul>
        </Teil>
      )}
      <Teil titel={t('werkbank.pakete.mitkommt.rechte')}>
        <p className="klein">{rechteKurz(m)}</p>
        {!!rechte?.length && <ul className="klein">{rechte.map((r) => <li key={r}>{r}</li>)}</ul>}
      </Teil>
    </div>
  );
}

/** „Was mitkommt“ zum Aufklappen, mit der Kurzfassung in der Zeile – für Vorschau und Ablauf. */
export function MitkommtAufklappen({ m, offen = false }: { m: Mitkommt | undefined; offen?: boolean }) {
  if (!m) return null;
  return (
    <details className="mitkommt-auf" open={offen} data-anker="pakete.mitkommt">
      <summary><strong>{t('werkbank.pakete.mitkommt.titel')}</strong> <span className="leise klein">{mitkommtKurz(m)}</span></summary>
      <MitkommtInhalt m={m} />
    </details>
  );
}

/**
 * Kurzanleitung „So nutzt du es“ (#1047). neu: direkt nach der Installation als Hinweis mit „Schließen“; sonst zum
 * Aufklappen auf der Paketseite.
 */
export function Kurzanleitung({ k, neu, schliessen }: { k: Record<string, string[]> | undefined; neu?: boolean; schliessen?(): void }) {
  const schritte = kurzanleitungIn(k, sprache());
  if (!schritte.length) return null;
  const liste = <ol className="stapel klein">{schritte.map((s) => <li key={s}>{s}</li>)}</ol>;
  if (neu) return (
    <section className="hinweis info stapel" aria-label={t('werkbank.pakete.anleitung.titel')} data-anker="pakete.kurzanleitung">
      <p><strong>{t('werkbank.pakete.anleitung.titel')}</strong> <Hilfe ort="werkbank.pakete.kurzanleitung" /></p>
      {liste}
      {schliessen && <div className="knoepfe"><Knopf onClick={schliessen}>{t('werkbank.pakete.anleitung.schliessen')}</Knopf></div>}
    </section>
  );
  return (
    <details className="blatt mitkommt-auf" data-anker="pakete.kurzanleitung">
      <summary><strong>{t('werkbank.pakete.anleitung.titel')}</strong></summary>
      {liste}
    </details>
  );
}
