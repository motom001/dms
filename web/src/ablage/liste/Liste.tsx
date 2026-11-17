/** Mappenliste einer Ansicht, eines Mappentyps, eines Links oder der Suche (#1279: Hooks und Teile). */
import { typName } from '../../../../shared/src/beschriftung';
import { t } from '../../sprache';
import { Listenkopf } from '../../Listenkopf';
import { Knopf, KnopfLink } from '../../bausteine';
import { PostKnopf } from '../Post';
import { spaltenName } from '../spalten';
import { zahl } from './hilfen';
import type { ListeProps } from './liste-hooks';
import { useListe, type ListeKern } from './liste-kern';
import { Aktionsleiste, Dialoge, ErgebnisHinweis, Rumpf, Unscharf } from './liste-teile';

/** Kopf der Ansicht (#1212): Titel und „+ <Typ>“ (Anlegen). Exportieren und Löschen gehen über die Auswahl, die Ansicht bearbeitet man in der Werkbank. */
function Kopf({ p }: { p: ListeProps }) {
  return (
    <Listenkopf titel={p.titel} hilfe={p.hilfe} beschreibung={p.beschreibung}>
      <div className="listenkopf-knoepfe">
        {p.neu && (
          <KnopfLink to={`/ablage/${p.sicht}/neu`} art="anlegen" groesse="klein">
            {p.typ ? t('ablage.ablage.neu-typ', { typ: typName(p.typ) }) : t('ablage.ablage.neu')}
          </KnopfLink>
        )}
        {p.post && p.typ && (
          <div className="postknopf">
            <PostKnopf />
          </div>
        )}
      </div>
    </Listenkopf>
  );
}

/** Anzahl, Sortierung (#1212) und geänderte Favoriten (#422). */
function ListenZahl({ l }: { l: ListeKern }) {
  const { p, s, suche, sortierung } = l;
  const anzahlText =
    s.gesamt === null
      ? ''
      : suche || p.sicht === 'suche'
        ? t('ablage.ablage.treffer', { zahl: zahl(s.gesamt) })
        : t('ablage.ablage.mappen-2', { anzahl: s.gesamt, zahl: zahl(s.gesamt) });
  if (!anzahlText) return null;
  return (
    <p className="listenzahl leise klein" aria-live="polite">
      {anzahlText}
      {s.mappen.length < (s.gesamt ?? 0) ? t('ablage.ablage.geladen', { zahl: zahl(s.mappen.length) }) : ''}
      {/* Sortiert wird über die Spaltenköpfe (#1212). Ist anders sortiert als nach Titel, steht das hier mit dem Weg zurück. */}
      {sortierung && !p.sortierungFest && (
        <>
          {' '}
          {t('ablage.ablage.sortiert-nach', { spaltenName: spaltenName(sortierung.spalte, p.typ), wert: '' })}{' '}
          <Knopf art="link" groesse="klein" onClick={() => l.setzeSortierung(null)}>
            {t('ablage.ablage.nach-titel-sortieren')}
          </Knopf>
        </>
      )}
      {l.geaenderteHier.length > 0 && (
        <span className="listenzahl-geaendert">
          {' '}
          <span className="abo-punkt" aria-hidden="true" /> {t('ablage.ablage.geaendert-zahl', { zahl: zahl(l.geaenderteHier.length) })}{' '}
          <Knopf groesse="klein" onClick={() => l.alleGesehen()}>
            {t('ablage.ablage.alle-gesehen')}
          </Knopf>
        </span>
      )}
    </p>
  );
}

export function Liste(p: ListeProps) {
  const l = useListe(p);
  return (
    <>
      <div ref={l.mess} className="breitenmesser" aria-hidden="true" />
      <Kopf p={p} />
      {p.kopf}
      <ListenZahl l={l} />
      <Dialoge l={l} />
      {l.s.fehler && (
        <div className="hinweis schlecht">
          <p>{l.s.fehler}</p>
        </div>
      )}
      <Unscharf l={l} />
      {l.wahl && l.wahl.gewaehlt.size > 0 && <Aktionsleiste l={l} wahl={l.wahl} />}
      {l.ergebnis && <ErgebnisHinweis ergebnis={l.ergebnis} schliessen={() => l.setErgebnis(undefined)} />}
      <Rumpf l={l} />
    </>
  );
}
