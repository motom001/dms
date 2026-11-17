/** Besondere Listen der Ablage (#1279): sprechender Link (#98), erweiterte Suche (#199, #426), Teile ohne Ansicht (#1031). */
import { typBeschreibung, typName } from '../../../../shared/src/beschriftung';
import { beschreibeBedingung, spaltenDerSicht } from '../../../../shared/src/sichten';
import type { Direktlink } from '../../../../shared/src/direktlink';
import { GEMISCHTE_SPALTEN, standardliste, type Mappentyp, type Sortierung } from '../../../../shared/src/model';
import { uebergeordneterTyp } from '../../../../shared/src/teile';
import { useDaten } from '../../daten';
import { useKonto } from '../../konto';
import { geheZu, Link } from '../../ort';
import { t } from '../../sprache';
import { Listenkopf } from '../../Listenkopf';
import { Suchkopf, suchFehler, suchTypen } from '../Suche';
import { exportOhneSicht } from './hilfen';
import { Liste } from './Liste';

/**
 * Trefferliste eines sprechenden Links (#98): vorübergehende Sicht, nicht im Baum.
 * Die erste Mappe öffnet sich von selbst; die Sortierung steht in der Adresse.
 */
export function LinkListe({ link, suche, offen }: { link: Direktlink; suche: URLSearchParams; offen?: string }) {
  const sortierung = link.sortierung;
  const setze = (n: Sortierung | null) => {
    const q = new URLSearchParams(suche);
    if (!n || (n.spalte === '_titel' && !n.absteigend)) q.delete('sortierung');
    else q.set('sortierung', `${n.absteigend ? '-' : ''}${n.spalte}`);
    geheZu(`/ablage/link${offen ? `/${offen}` : ''}?${q.toString()}`, true);
  };
  const bedingungen = link.bedingungen.map((b) => beschreibeBedingung(b, [link.typ]));
  return (
    <Liste
      sicht="link"
      link={suche.toString()}
      anhang={`?${suche.toString()}`}
      typ={link.typ}
      spaltenTyp={link.typ}
      spalten={standardliste(link.typ).spalten}
      listenSpalten={standardliste(link.typ).spalten}
      titel={t('ablage.ablage.link-2', { name: link.typ.name })}
      beschreibung={bedingungen.length ? bedingungen.join(' · ') : t('ablage.ablage.alle-mappen-dieses-mappentyps')}
      offen={offen}
      zuerstOeffnen
      sortierungFest={{ wert: sortierung, setze }}
      leerText={t('ablage.ablage.keine-mappe-passt-zu')}
    />
  );
}

/**
 * Erweiterte Suche (#199, #426): oben das Formular (zuklappbar), darunter die Treffer mit der Zusammenfassung
 * der Bedingungen. Am Handy erst das Formular, nach „Suchen“ die Treffer.
 */
export function SuchListe({
  suche,
  offen,
  formular,
  setFormular,
}: {
  suche: URLSearchParams;
  offen?: string;
  formular: boolean;
  setFormular(an: boolean): void;
}) {
  const d = useDaten();
  const { ich } = useKonto();
  const fehler = suchFehler(suche, d.typen);
  const kopf = <Suchkopf suche={suche} offen={offen} formular={formular} setFormular={setFormular} />;
  if (fehler.length)
    return (
      <>
        <Listenkopf titel={t('suche.titel')} hilfe="ablage.erweitertesuche" />
        {kopf}
        <div className="hinweis schlecht stapel" role="alert">
          <p>{t('ablage.ablage.diese-suche-laesst-sich')}</p>
          <ul>
            {fehler.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </>
    );
  const typen = suchTypen(suche, d.typen);
  const typ = typen.length === 1 ? typen[0] : undefined;
  const wahl = typ
    ? { key: 'standard', spalten: standardliste(typ).spalten }
    : typen.length
      ? spaltenDerSicht(typen, null)
      : { key: null, spalten: GEMISCHTE_SPALTEN };
  const q = suche.toString();
  return (
    <Liste
      key={q}
      sicht="suche"
      link={q}
      anhang={`?${q}`}
      typ={typ}
      spaltenTyp={typ ?? typen[0]}
      spalten={wahl.spalten}
      listenSpalten={wahl.key ? wahl.spalten : []}
      titel={t('suche.titel')}
      offen={offen}
      hilfe="ablage.erweitertesuche"
      auswahl
      export={exportOhneSicht(ich.rolle === 'admin', d.sichten)}
      kopf={<div className="suchkopf">{kopf}</div>}
      leerText={t('suche.keine')}
    />
  );
}

/**
 * Teile (#1031) haben keine eigene Ansicht: Wer über einen direkten Link bei einem Teil landet, sieht in der Mitte statt
 * aller Teile, wo sie stehen – an ihrer übergeordneten Mappe.
 */
export function TeilListe({ typ }: { typ: Mappentyp }) {
  const d = useDaten();
  const eltern = d.typ(uebergeordneterTyp(typ));
  return (
    <>
      <Listenkopf titel={typName(typ)} hilfe="ablage.sicht" beschreibung={typBeschreibung(typ)} />
      <div className="leer">
        <p>{t('ablage.teile.keine-ansicht', { name: typName(typ), eltern: eltern ? typName(eltern) : '…' })}</p>
        {eltern && (
          <p>
            <Link to={`/ablage/${eltern.id}`} className="verweis">
              {t('ablage.teile.zu-den-uebergeordneten', { eltern: typName(eltern) })}
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
