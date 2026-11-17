/** Kleine Teile der Ablage-Listen (#1279): Punkt „geändert“, Nebenzeile, Haken je Zeile, Fundstelle im Volltext. */
import { anlageVermerk } from '../../../../shared/src/anlagen';
import { typName } from '../../../../shared/src/beschriftung';
import { TREFFER_ANFANG, TREFFER_ENDE, type Ausschnitt } from '../../../../shared/src/model';
import { useDaten } from '../../daten';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { Wahlhaken } from '../../bausteine';

/** Favorit = Abo (#422): Punkt vor geänderten Favoriten und eigenen Mappen – wie „ungelesen“ im E-Mail-Programm. */
export function GeaendertPunkt() {
  return (
    <>
      <span className="abo-punkt" title={t('ablage.ablage.von-anderen-geaendert-seit')} aria-hidden="true" />
      <span className="sr">{t('ablage.ablage.geaendert-2')} </span>
    </>
  );
}

export const Unter = ({ text }: { text: string }) => (text ? <span className="unter">{text}</span> : null);

export function Zeilenhaken({ an, titel, waehle }: { an: boolean; titel: string; waehle(an: boolean, bereich: boolean): void }) {
  return <Wahlhaken an={an} beschriftung={t('ablage.ablage.auswaehlen', { titel })} setze={waehle} />;
}

/** Fundstelle im Volltext (#45): Dokumentname und Ausschnitt, Treffer hervorgehoben (ohne HTML vom Server). */
export function Fundstelle({ a }: { a: Ausschnitt }) {
  const d = useDaten();
  const teile = a.text.split(TREFFER_ANFANG).flatMap((text, i) => {
    if (i === 0) return [<span key={`t${i}`}>{text}</span>];
    const [treffer, rest = ''] = text.split(TREFFER_ENDE);
    return [<mark key={`m${i}`}>{treffer}</mark>, <span key={`r${i}`}>{rest}</span>];
  });
  // Teile (#1031): „gefunden in Rechnungsposition „3. Bohrmaschine““ – ggf. mit dem Dokument des Teils.
  if (a.teil) {
    const teiltyp = d.typ(a.teil.typId);
    const wo = t('ablage.teile.gefunden-in', { typ: teiltyp ? typName(teiltyp) : '…', titel: titelOder(a.teil.titel) });
    return (
      <span className="fundstelle">
        <span className="dok">{a.dokument ? `${wo} · ${a.dokument}:` : wo}</span>
        {a.text ? <> {teile}</> : null}
      </span>
    );
  }
  // Anlagen (#998): „Rechnung – Anlage 2.pdf · in Anlage 2:“.
  return (
    <span className="fundstelle">
      <span className="dok" title={t('ablage.ablage.fundstelle-im-dokument')}>
        {a.dokument}
        {a.anlage ? ` · ${anlageVermerk(a.anlage)}` : ''}:
      </span>{' '}
      {teile}
    </span>
  );
}
