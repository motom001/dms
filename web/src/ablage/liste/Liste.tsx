/** Mappenliste einer Ansicht, eines Mappentyps, eines Links oder der Suche (#1279: Hooks und Teile). */
import { typMehrzahl, typName } from '../../../../shared/src/beschriftung';
import { t } from '../../sprache';
import { Listenkopf } from '../../Listenkopf';
import { Knopf, KnopfLink, Menue, type MenuePunkt } from '../../bausteine';
import { Symbol } from '../../Symbol';
import { geheZu } from '../../ort';
import { PostKnopf } from '../Post';
import { spaltenName } from '../spalten';
import { zahl } from './hilfen';
import type { ListeProps } from './liste-hooks';
import { useListe, type ListeKern } from './liste-kern';
import { Aktionsleiste, Dialoge, ErgebnisHinweis, Rumpf, Unscharf } from './liste-teile';

/**
 * „⋯“ im Kopf der Ansicht (#1212, #1285): „Alle n exportieren …“ und „Ansicht bearbeiten“ bzw. in der Liste eines
 * Mappentyps „Mappentyp bearbeiten“ (Weg in die Werkbank, nur mit Recht).
 */
function MehrMenue({ l }: { l: ListeKern }) {
  const { p, s } = l;
  const punkte: MenuePunkt[] = [];
  if (p.export && (s.gesamt ?? 0) > 0)
    punkte.push({
      key: 'export',
      symbol: 'herunterladen',
      inhalt: t('ablage.liste.alle-exportieren', { anzahl: s.gesamt ?? 0, zahl: zahl(s.gesamt ?? 0) }),
      tu: () => {
        l.setEmailOffen(false);
        l.setExportOffen('alle');
      },
    });
  if (p.bearbeiten) {
    const { ziel, art } = p.bearbeiten;
    const inhalt = art === 'mappentyp' ? t('ablage.liste.mappentyp-bearbeiten') : t('ablage.liste.ansicht-bearbeiten');
    punkte.push({ key: 'bearbeiten', inhalt, tu: () => geheZu(ziel) });
  }
  if (!punkte.length) return null;
  return <Menue nurSymbol beschriftung={t('ablage.liste.mehr', { titel: p.titel })} punkte={punkte} />;
}

/**
 * Kopf der Ansicht (#1212): Titel, „+ <Typ>“ (Anlegen) und rechts „⋯“ (#1285); davor „Neu laden“ (#1668), falls doch
 * etwas hängt – lädt die Zahlen links und die Liste zugleich, Auswahl und Rollstand bleiben.
 */
function Kopf({ l }: { l: ListeKern }) {
  const { p } = l;
  const neuLaden = () => {
    l.d.auffrischen();
    l.neue.anzeigen();
  };
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
        <Knopf groesse="klein" nurSymbol={t('ablage.liste.neu-laden')} onClick={neuLaden}>
          <Symbol name="neu-laden" />
        </Knopf>
        <MehrMenue l={l} />
      </div>
    </Listenkopf>
  );
}

/**
 * „12 Mappen“ – oder mit dem Typ, wenn die ganze Liste einen hat (#1285): „12 Verträge“ mit der Mehrzahl des Typs
 * (#1446), sonst „12 × Vertrag“; in der Suche „12 Treffer“. Ohne Suche dieselbe Zahl wie links (#1668), auch wenn die
 * Liste Neues noch nicht zeigt.
 */
function anzahlVon({ p, s, suche, einTyp, zahl: links }: ListeKern) {
  if (s.gesamt === null) return '';
  if (suche || p.sicht === 'suche') return t('ablage.ablage.treffer', { zahl: zahl(s.gesamt) });
  const n = links ?? s.gesamt;
  const typ = p.typ ?? (s.alle ? einTyp : undefined);
  const mehrzahl = typ && n !== 1 ? typMehrzahl(typ) : '';
  if (mehrzahl) return t('ablage.liste.anzahl-mehrzahl', { zahl: zahl(n), mehrzahl });
  return typ
    ? t('ablage.liste.anzahl-typ', { anzahl: n, zahl: zahl(n), typ: typName(typ) })
    : t('ablage.ablage.mappen-2', { anzahl: n, zahl: zahl(n) });
}

/** Anzahl, Sortierung (#1212) und geänderte Favoriten (#422). */
function ListenZahl({ l }: { l: ListeKern }) {
  const { p, s, sortierung } = l;
  const anzahlText = anzahlVon(l);
  if (!anzahlText) return null;
  return (
    <p className="listenzahl leise klein" aria-live="polite">
      {anzahlText}
      {s.mappen.length < (l.zahl ?? s.gesamt ?? 0) ? t('ablage.ablage.geladen', { zahl: zahl(s.mappen.length) }) : ''}
      {/* Sortiert wird über die Spaltenköpfe (#1212). Ist anders sortiert als nach Titel, steht das hier mit dem Weg zurück. */}
      {sortierung && !p.sortierungFest && (
        <>
          {' '}
          {t('ablage.ablage.sortiert-nach', { spaltenName: spaltenName(sortierung.spalte, p.typ), wert: '' })}{' '}
          <Knopf groesse="klein" onClick={() => l.setzeSortierung(null)}>
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

/**
 * Neues in der Ansicht (#1668), das die Liste noch nicht zeigt, weil man gerade darin arbeitet: ein ruhiger Hinweis
 * über der Liste – erst ein Klick lädt nach; Auswahl und Rollstand bleiben.
 */
function NeueHinweis({ l }: { l: ListeKern }) {
  const n = l.neue.angekuendigt;
  if (n === null || l.s.gesamt === null) return null;
  const mehr = n - l.s.gesamt;
  return (
    <div className="hinweis info">
      <Knopf groesse="klein" onClick={l.neue.anzeigen}>
        {mehr > 0 ? t('ablage.liste.neue-anzeigen', { anzahl: mehr, zahl: zahl(mehr) }) : t('ablage.liste.geaendert-anzeigen')}
      </Knopf>
    </div>
  );
}

export function Liste(p: ListeProps) {
  const l = useListe(p);
  return (
    <>
      <div ref={l.mess} className="breitenmesser" aria-hidden="true" />
      <Kopf l={l} />
      {p.kopf}
      {/* Die Auswahlleiste ersetzt die Zeile mit der Anzahl (#1285). */}
      {l.wahl && l.wahl.gewaehlt.size > 0 ? <Aktionsleiste l={l} wahl={l.wahl} /> : <ListenZahl l={l} />}
      <Dialoge l={l} />
      {l.s.fehler && (
        <div className="hinweis schlecht">
          <p>{l.s.fehler}</p>
        </div>
      )}
      <Unscharf l={l} />
      <NeueHinweis l={l} />
      {l.ergebnis && <ErgebnisHinweis ergebnis={l.ergebnis} schliessen={() => l.setErgebnis(undefined)} />}
      <Rumpf l={l} />
    </>
  );
}
