import { Symbol } from '../Symbol';
import { usePakete } from './paketeZustand';
import { automatisierungWarnungen, useAutomatisierungen } from './Automatisierungen';
import type { ReactNode } from 'react';
import { useKonto } from '../konto';
import { Dreiteilung } from '../bereiche';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { darfSeite, hatMitte, inLeiste, wartungsPlakette, werkbankEbene, werkbankZurueck } from '../../../shared/src/werkbankansicht';
import { t, tn } from '../sprache';
import { useHandbuch } from '../Hilfe';
import { AnsichtPanel, type BereichZustand } from './Ansicht';
import { WerkbankNavigation } from './Uebersicht';
import { useWerkbankSprung, useWerkbankZustaende1, useWerkbankZustaende2, useWerkbankZustaende3, useWiederLaden } from './rahmen/zustaende';
import type { Kontext } from './rahmen/inhalt';
import { seiteVon } from './rahmen/seiten';
import { leistenEintraege } from './rahmen/leiste';

/**
 * Umgezogen (#717, #725): /werkbank/darfweg → aufbewahrung, /werkbank/suche → texterkennung#suche,
 * /werkbank/wiederherstellung → sicherung#wiederherstellen, /werkbank/technik → systemzustand#version,
 * /werkbank/wartungsmodus → wartung#wartungsmodus (`UMGEZOGEN` in werkbankansicht.ts).
 *
 * Werkbank im Verwaltungsmodus (#819), aufgebaut wie die Ablage. Leiste und Seiten nur für die eigenen Bereiche (#818);
 * der Server prüft dasselbe je Schnittstelle (verwaltungsbereiche.ts):
 *   Bereiche  →  Elemente des Bereichs  →  Bearbeitung
 *
 * /werkbank                        Übersicht: was zu tun ist (#68)
 * /werkbank/typen[/:id|/neu]
 * /werkbank/benutzer[/:id|/neu]
 * /werkbank/sichten[/:id|/neu]       Sichten der Ablage (#38)
 * /werkbank/demo                    Lasttest-Daten (#988, früher Demo-Daten)
 * /werkbank/beispielablage          Beispiel-Ablage (#988)
 * /werkbank/protokoll[/:nr]
 * /werkbank/designs[/:id|/neu]
 * /werkbank/betrieb                 E-Mail-Versand und Adresse des DMS (#37)
 * /werkbank/verschluesselung        Schlüssel für Passwörter (#39)
 * /werkbank/papierkorb[/:id]        Papierkorb aller Benutzer und Aufbewahrung (#43)
 * /werkbank/texterkennung           Suche und Volltext: Texterkennung, Suche (#45, #356, #725)
 * /werkbank/woerter[/:id|/neu[?kopie=:id]]  Gleichbedeutende Wörter (#992), dreiteilig
 * /werkbank/aufgaben[/:id][?filter] Aufgaben aller Benutzer mit Filter (#54, #366, #354; seit #725 „Aufgaben“)
 * /werkbank/daten                  Einstellungen zum Sichern: Aufbewahrung im Papierkorb, eigener Export der Benutzer (#1196, #1197)
 * /werkbank/wartung                 Wartung: Wartungsmodus und Wartungsoperationen, z. B. Volltext neu erzeugen (#45, #458, #725)
 * /werkbank/fehlermeldungen[/:id]  Fehlermeldungen der Benutzer (#70)
 * /werkbank/organisation          Eigene Organisation, oben die Nutzung (#995, #1170; früher /werkbank/nutzung, leitet um)
 * /werkbank/sicherung              Sicherung, Zeitplan, Probe, darunter Wiederherstellen (#103–#109, #725)
 * /werkbank/verschluesselung#notfallblatt  Notfallblatt (#106), seit #993 nur hier
 * /werkbank/verschluesselung#notfallkontakte  Notfallkontakte (#812) für „Wen fragen?“ auf dem Notfallblatt
 * /werkbank/anbindung[?offen=:id] Datenbank-Anbindung (#119), darunter lange Zugriffe, aufklappbar,
 *                                 und was gerade läuft (#407; früher /werkbank/datenbank, leitet weiter)
 * /werkbank/systemzustand         Systemzustand: Warnschwelle und Grenze, darunter Speicherplatz je Ordner
 *                                 (#115, #116; #408, früher /werkbank/speicherplatz, leitet weiter)
 * /werkbank/webdav                WebDAV-Laufwerk an/aus, Stand, letzte Zugriffe (#346, rechts seit #366)
 * /werkbank/automatisierungen[/:id|/neu|/ziele]  Automatisierungen Wenn – Und – Dann (#675), dreiteilig; Ziele nach außen (#671)
 * /werkbank/stempel[/:id|/neu]     Vorlagen für Stempel beim Weitergeben (#394), dreiteilig seit #990
 * /werkbank/auskuenfte[/:id|/neu][?mappe=]  Datenschutz-Auskünfte (#396, #668), dreiteilig;
 *                                  früher /werkbank/datenschutz (leitet um); /einstellungen leitet seit #1183 auf
 *                                  /werkbank/organisation#auskunft-vorgaben
 * /werkbank/loeschkonzept          Löschkonzept, Personendaten in Mappentypen (#469, #668), Gruppe Datenschutz (#1184)
 * /werkbank/rundgaenge[/:schluessel|/neu[?kopie=:schluessel]]  Rundgänge (#941), dreiteilig
 * /werkbank/tipps[/:schluessel|/neu]  Tipps (#942), dreiteilig
 * /werkbank/loeschprotokoll        Löschprotokoll (#470; seit #1184 eigener Bereich, früher …/loeschkonzept#loeschprotokoll)
 *
 * Die Mitte bekommt jede Sammlung, in der man etwas anlegt und bearbeitet (#366, seit #990 auch kleine; `hatMitte`);
 * alle anderen Bereiche sind zweiteilig: links die Bereiche, rechts die ganze Seite.
 */
export function Werkbank({ teile }: { teile: string[] }) {
  const d = useDaten();
  const handbuch = useHandbuch();
  const [, bereich = 'uebersicht', id] = teile;
  const { verwaltungsmodus } = useKonto();
  /**
   * Verwaltungsrecht (#818): eigener Bereich? `bereiche: null` = Gesamte Verwaltung; die Übersicht hat jeder. Weitere
   * Bereiche, die eine Seite öffnen, stehen in der Liste (`auchMit`, #1184: das Löschprotokoll mit dem Löschkonzept).
   */
  const darf = (pfad: string) => darfSeite(verwaltungsmodus.bereiche, pfad);
  const z1 = useWerkbankZustaende1(bereich, darf);
  // Pakete: Installation über einen Link (?installieren=…) steht rechts, auch ohne gewähltes Paket.
  const installieren = bereich === 'pakete' && !id ? new URLSearchParams(location.search).get('installieren') : null;
  const automatisierungen = useAutomatisierungen(bereich === 'automatisierungen');
  const z2 = useWerkbankZustaende2(bereich, darf);
  // Herkunft und Paketfilter (#978) in Mappentypen, Ansichten und Nummernkreisen – nur mit Recht auf die Pakete (#818),
  // sonst gilt die Kennung des Typs (`typ.paket`).
  const pakete = usePakete(
    bereich === 'pakete' ||
      (['typen', 'sichten', 'nummernkreise', 'automatisierungen', 'ablaufvorlagen'].includes(bereich) && darf('pakete')),
  );
  const z3 = useWerkbankZustaende3(bereich);
  const z = { ...z1, automatisierungen, ...z2, pakete, ...z3 };
  const { uebersicht, wartungsmodus, ansicht } = z;
  useWiederLaden(bereich, z);
  const umleitung = useWerkbankSprung(bereich, id, z.benutzer);
  // Hintergrundarbeit ruht nur im aktiven Wartungsmodus (#366: Hinweis bei Texterkennung und Volltext).
  const wartungAn = wartungsPlakette(wartungsmodus.stand?.stufe ?? 'aus', wartungsmodus.stand?.aktivAb ?? null) === 'an';

  const inhalt = inhaltVon({ bereich, id, d, z, installieren, wartungAn });
  let liste = inhalt.liste;
  let rechts = inhalt.rechts;

  const eintraege = leistenEintraege({
    d,
    z,
    uz: uebersicht.stand?.zahlen,
    wartungAn,
    automatisierung: {
      zahl: automatisierungen.stand?.automatisierungen.length,
      warn: automatisierungWarnungen(automatisierungen.stand),
    },
  });
  const zustand: Record<string, BereichZustand> = Object.fromEntries(eintraege.map((e) => [e.pfad, { warn: e.warn }]));
  if (bereich === 'ansicht') {
    rechts = <AnsichtPanel z={ansicht} zustand={zustand} />;
  }
  // Ohne Recht auf den Bereich (#818): weder Liste noch Seite – auch nicht über einen alten Link.
  if (!darf(bereich) && !umleitung) {
    liste = null;
    rechts = (
      <div className="leer">
        <p>{t('konten.verwaltung.fehler.bereich')}</p>
      </div>
    );
  }
  const eigene = eintraege.filter((e) => darf(e.pfad) && inLeiste(e.gruppe, d.zaehler.merkmale));

  return (
    <Dreiteilung ort="werkbank" ebene={werkbankEbene(bereich, id, !!installieren)} mitte={hatMitte(bereich)} offen={id}>
      <aside className="spalte sichten" aria-label={t('werkbank.werkbank.bereiche')}>
        <WerkbankNavigation
          bereich={bereich}
          eintraege={eigene}
          zeigen={ansicht.zeigen}
          benutzt={ansicht.stand?.benutzt}
          laedt={ansicht.laedt}
        />
        {/* Freiwillig, ohne Gebühren für beide Seiten (GitHub Sponsors von persönlichen Konten). */}
        <a className="unterstuetzen" href="https://github.com/sponsors/motom001" target="_blank" rel="noreferrer">
          {tn('werkbank.werkbank.projekt-unterstuetzen', {
            symbol: <Symbol name="herz" />,
            span: <span className="leise klein">{t('werkbank.werkbank.freiwillig-betrag-frei-waehlbar')}</span>,
          })}
        </a>
        <a className="unterstuetzen handbuchlink" href={handbuch('admin')} target="_blank" rel="noreferrer">
          {t('werkbank.handbuch.link')} <Symbol name="extern" />
        </a>
      </aside>
      <section className="spalte liste" aria-label={t('werkbank.werkbank.elemente')}>
        {liste}
      </section>
      <section className="spalte mappe" aria-label={t('werkbank.werkbank.bearbeitung')}>
        <Link to={werkbankZurueck(bereich)} className="verweis nur-schmal zur-liste">
          <Symbol name="pfeil-links" /> {hatMitte(bereich) ? t('werkbank.werkbank.zur-liste') : t('werkbank.werkbank.bereiche-2')}
        </Link>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

/**
 * Inhalt des offenen Bereichs (#1281): die Seite aus der Tabelle in rahmen/seiten.ts, zur Liste der Werkbank-Seiten.
 * Ohne Inhalt rechts: „Wähle in der Liste“.
 */
function inhaltVon(k: Kontext): { liste: ReactNode; rechts: ReactNode } {
  const inhalt = seiteVon(k.bereich)?.(k);
  return {
    liste: inhalt?.liste ?? null,
    rechts: inhalt?.rechts ?? (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-in-der-liste')}</p>
      </div>
    ),
  };
}
