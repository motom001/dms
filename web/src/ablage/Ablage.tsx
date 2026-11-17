import { useEffect } from 'react';
import { useAblageStand, useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { Dreiteilung } from '../bereiche';
import { UebernehmenSeite } from './Uebernehmen';
import { usePapierkorb } from './Papierkorb';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { useErledigenAnsicht } from './Termine';
import { favoritenSichtVon, linkLage, sichtLage, useSuchformular } from './seite/lage';
import { Mitte } from './seite/Mitte';
import { Rechts } from './seite/Rechts';
import { Seitenleiste } from './seite/Seitenleiste';

/**
 * Ablage in drei Spalten, von groß nach klein:
 *   Sichten  →  Mappen der Sicht  →  eine Mappe
 *
 * /ablage/zuletzt                   „Zuletzt geöffnet“ (#940): die letzten 25, nur über die Startseite erreichbar
 * /ablage/:sicht                    „eingang“ (Zu erledigen mit Liste · Monat · Jahr, #725; /ablage/anstehend leitet dorthin), „favoriten“ (#62), „papierkorb“ (#43), eine verwaltete Sicht (#38) oder die Id eines Mappentyps
 * /ablage/:sicht/:mappeId           Mappe rechts geöffnet (neue Post: weiter zu …/uebernehmen, außer mit ?als=post)
 * /ablage/:sicht/:mappeId/uebernehmen  „Dokument übernehmen“ (#934): Dokument in der Mitte, Mappe rechts
 * /ablage/:typId/neu?verweis=k:id   neue Mappe, optional mit vorbelegtem Verweis
 * /ablage/link?typ=…&feld=…         sprechender Link (#98); geöffnet: /ablage/link/:mappeId?typ=…
 * /ablage/suche?typ=…&feld.von=…    erweiterte Suche (#199, #426): Formular oben in der Mitte; geöffnet: /ablage/suche/:mappeId?…
 *
 * Die Liste lädt je 100 Mappen nach Titel sortiert und beim Scrollen die nächsten.
 */
export function Ablage({ teile, suche }: { teile: string[]; suche: URLSearchParams }) {
  const d = useDaten();
  const [, sicht, dritt, viert] = teile;
  // #919: Zähler der Seitenleiste (Neue Post, Zu erledigen) und Startseite holen sich den neuen Stand selbst.
  useAblageStand();

  // Startseite (#334): Standard, außer der Benutzer hat sie im Profil abgeschaltet.
  const mitStart = d.einstellungen.startseite !== false;
  useEffect(() => {
    if (!sicht) geheZu(mitStart ? '/ablage/start' : '/ablage/eingang', true);
  }, [sicht, mitStart]);
  // Erweiterte Suche (#199): am Handy erst das Formular, nach „Suchen“ die Treffer.
  const istSuche = sicht === 'suche';
  const { formular, setFormular } = useSuchformular(istSuche, suche);
  const { verwaltet, typ, typListe, sichtTypen, wahl } = sichtLage(d, sicht);
  const ebene = dritt ? 'mappe' : istSuche ? (formular ? 'formular' : 'suchliste') : 'liste';
  const papierkorb = usePapierkorb(false, sicht === 'papierkorb');
  // „Zu erledigen“ mit Liste · Monat · Jahr (#528, #725): Monat und Jahr nutzen Mitte und rechts, bis eine Mappe offen ist.
  const ansicht = useErledigenAnsicht();
  const kalender = sicht === 'eingang' && ansicht.ansicht !== 'liste';
  // Alte Adresse (#725): die feste Liste „Favoriten“ ist jetzt eine Ansicht.
  const favoritenSicht = favoritenSichtVon(d);
  useEffect(() => {
    if (sicht === 'favoriten' && favoritenSicht) geheZu(`/ablage/${favoritenSicht}${dritt ? `/${dritt}` : ''}`, true);
  }, [sicht, dritt, favoritenSicht]);
  // Alte Adresse (#725): „Anstehend“ ist jetzt der Monat in „Zu erledigen“.
  useEffect(() => {
    if (sicht !== 'anstehend') return;
    if (ansicht.ansicht === 'liste') ansicht.setze('monat');
    geheZu(`/ablage/eingang${dritt ? `/${dritt}` : ''}`, true);
  }, [sicht, dritt, ansicht]);
  const { anhang, link } = linkLage(d, sicht, suche);

  const links = <Seitenleiste sicht={sicht} istSuche={istSuche} mitStart={mitStart} name={verwaltet?.name ?? typListe} />;
  // „Dokument übernehmen“ (#934): links die gewohnten Ansichten, in der Mitte das Dokument, rechts die Mappe.
  if (dritt && viert === 'uebernehmen' && sicht)
    return <UebernehmenSeite key={dritt} id={dritt} sicht={sicht} links={links} suche={suche} />;

  return (
    // Startseite ohne geöffnete Mappe (#429): ein großes Dashboard über Mitte und rechts. Ebenso die erweiterte
    // Suche (#426) und der Kalender in „Zu erledigen“ (#528, #725): Sie nutzen Mitte und rechts, bis ein Eintrag geöffnet wird.
    <Dreiteilung ort="ablage" ebene={ebene} offen={dritt} rechts={!((sicht === 'start' || istSuche || kalender) && !dritt)}>
      {links}

      <section
        className={`spalte liste${istSuche ? ` suchmitte${formular ? ' sm-formular' : ''}` : ''}${kalender ? ' ka-mitte' : ''}`}
        aria-label={t('ablage.ablage.mappen')}
        data-anker="liste">
        <Mitte
          {...{ sicht, dritt, suche, istSuche, formular, setFormular, link, kalender, ansicht, papierkorb }}
          {...{ verwaltet, typ, typListe, sichtTypen, wahl }}
        />
      </section>

      <section className="spalte mappe" aria-label={t('ablage.ablage.mappe')} data-anker="mappe">
        <Link to={`/ablage/${sicht ?? 'eingang'}${anhang}`} className="verweis nur-schmal zur-liste">
          <Symbol name="pfeil-links" /> {t('ablage.ablage.zur-liste')}
        </Link>
        <Rechts sicht={sicht} dritt={dritt} typ={typ} verwaltet={verwaltet} suche={suche} anhang={anhang} />
      </section>
    </Dreiteilung>
  );
}
