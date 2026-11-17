import type { ReactNode } from 'react';
import { RundgaengeListe, RundgaengeRechts } from '../Rundgaenge';
import { TippsListe, TippsRechts } from '../TippsWerkbank';
import { NummernkreisEditor, NummernkreiseListe } from '../Nummernkreise';
import { StempelEditor, StempelListe } from '../Stempel';
import { DarfWegPanel } from '../Archiv';
import { AuskuenfteListe, AuskunftRechts } from '../Datenschutz';
import { LoeschkonzeptPanel } from '../Loeschkonzept';
import { LoeschprotokollPanel } from '../Loeschprotokoll';
import { AblaufvorlageEditor, AblaufvorlagenListe } from '../Ablaufvorlagen';
import type { useDaten } from '../../daten';
import { t } from '../../sprache';
import { BenutzerDetail, BenutzerListe, BenutzerNeu, SystemkontoDetail } from '../Benutzer';
import { SichtEditor, SichtenListe } from '../Sichten';
import { DemoPanel } from '../Demo';
import { BeispielAblagePanel } from '../BeispielAblage';
import { DesignEditor, DesignListe } from '../Designs';
import { ProtokollDetail, ProtokollListe } from '../Protokoll';
import { TresorPanel } from '../Verschluesselung';
import { AufgabenEmpfaengerBlock } from '../AufgabenEmpfaenger';
import { UebersichtListe, UebersichtPanel } from '../Uebersicht';
import { FehlermeldungDetail, FehlermeldungenListe } from '../Fehlermeldungen';
import type { WerkbankZustaende } from './zustaende';
import type { PaketeZustand } from '../paketeZustand';
import type { useAutomatisierungen } from '../Automatisierungen';
import type { Bereichskennung } from '../../../../shared/src/werkbankansicht';

/*
 * Inhalte der Bereiche (#819): Liste in der Mitte und Seite rechts. Seit #1281 eine Tabelle Kennung → Seite statt einer
 * Wenn-dann-Kette; die Kennungen kommen aus der Liste der Werkbank-Seiten (shared/src/werkbankansicht.ts), die
 * Tabelle setzt seiten.ts aus den Teilen je Gruppe zusammen.
 */

/** Was ein Bereich in der Mitte (Liste) und rechts zeigt; `rechts` leer = „Wähle in der Liste“. */
interface Inhalt {
  liste?: ReactNode;
  rechts?: ReactNode;
}
/** Alles, was die Bereiche zum Zeichnen brauchen. */
export interface Kontext {
  bereich: string;
  id: string | undefined;
  d: ReturnType<typeof useDaten>;
  z: WerkbankZustaende & { pakete: PaketeZustand; automatisierungen: ReturnType<typeof useAutomatisierungen> };
  installieren: string | null;
  wartungAn: boolean;
}
/** Eine Seite der Werkbank: zeichnet Liste und rechte Seite des offenen Bereichs. */
export type Seite = (k: Kontext) => Inhalt;
/** Kennung einer Seite: ein Bereich aus der Liste oder die Übersicht. */
export type Seitenkennung = Bereichskennung | 'uebersicht';
/** Ein Teil der Tabelle; `satisfies Seiten` meldet unbekannte Kennungen. */
export type Seiten = Partial<Record<Seitenkennung, Seite>>;

/** Hinweis rechts, solange in der Liste nichts gewählt ist. */
const waehle = (text: string) => (
  <div className="platzhalter">
    <p>{text}</p>
  </div>
);

/** Übersicht, Fehlermeldungen, Demo, Beispiel-Ablage, Designs, Protokoll, Verschlüsselung. */
export const pflegeSeiten = {
  uebersicht: ({ z }) => ({ liste: <UebersichtListe u={z.uebersicht} />, rechts: <UebersichtPanel u={z.uebersicht} /> }),
  fehlermeldungen: ({ id, z: { meldungen, uebersicht } }) => ({
    liste: <FehlermeldungenListe z={meldungen} offen={id} />,
    rechts: id ? (
      <FehlermeldungDetail
        key={id}
        id={id}
        z={meldungen}
        neuLaden={async () => {
          await meldungen.laden();
          await uebersicht.laden();
        }}
      />
    ) : (
      waehle(t('werkbank.werkbank.waehle-links-eine-meldung'))
    ),
  }),
  demo: () => ({ rechts: <DemoPanel /> }),
  beispielablage: () => ({ rechts: <BeispielAblagePanel /> }),
  designs: ({ id }) => ({
    liste: <DesignListe offen={id} />,
    rechts: id ? <DesignEditor key={id} id={id} /> : waehle(t('werkbank.werkbank.waehle-ein-design-zum')),
  }),
  protokoll: ({ id, z }) => ({ liste: <ProtokollListe p={z.protokoll} offen={id} />, rechts: <ProtokollDetail p={z.protokoll} nr={id} /> }),
  verschluesselung: ({ z }) => ({ rechts: <TresorPanel t={z.tresor} /> }),
} satisfies Seiten;

/** Ansichten, Nummernkreise, Stempel. */
export const listenSeiten = {
  sichten: ({ id, d, z }) => ({
    liste: <SichtenListe offen={id} pakete={z.pakete.stand?.installiert ?? []} />,
    rechts: id ? (
      <SichtEditor key={`${id}-${d.sicht(id)?.geaendert ?? ''}`} id={id} />
    ) : (
      waehle(t('werkbank.werkbank.waehle-links-eine-ansicht'))
    ),
  }),
  nummernkreise: ({ id, z: { nummernkreise, pakete } }) => ({
    liste: <NummernkreiseListe z={nummernkreise} offen={id} pakete={pakete.stand?.installiert ?? []} />,
    rechts: id ? (
      <NummernkreisEditor key={`${id}-${nummernkreise.liste ? 1 : 0}`} z={nummernkreise} schluessel={id} />
    ) : (
      waehle(t('werkbank.werkbank.waehle-links-einen-nummernkreis'))
    ),
  }),
  // Dreiteilig seit #990: Vorlagen in der Mitte, rechts die gewählte mit Live-Vorschau (#799).
  stempel: ({ id, z: { stempel } }) => ({
    liste: <StempelListe z={stempel} offen={id} />,
    rechts: id ? <StempelEditor key={`${id}-${stempel.liste ? 1 : 0}`} z={stempel} id={id} /> : waehle(t('werkbank.stempel.waehle')),
  }),
} satisfies Seiten;

/** Automatisierungsvorlagen, Rundgänge, Tipps, Datenschutz, Aufbewahrung. */
export const vorlagenSeiten = {
  // Automatisierungsvorlagen (#1044): dreiteilig wie die Automatisierungen.
  ablaufvorlagen: ({ id, z: { ablaufvorlagen, pakete } }) => {
    const kennung = id ? decodeURIComponent(id) : undefined;
    return {
      liste: <AblaufvorlagenListe z={ablaufvorlagen} offen={kennung} pakete={pakete.stand?.installiert ?? []} />,
      rechts: kennung ? (
        <AblaufvorlageEditor key={`${kennung}-${ablaufvorlagen.stand ? 1 : 0}`} z={ablaufvorlagen} kennung={kennung} />
      ) : (
        waehle(t('automatisierung.vorlage.ui.waehlen'))
      ),
    };
  },
  // Rundgänge (#941): alle in der Mitte, rechts der gewählte (eigene als YAML zum Bearbeiten).
  rundgaenge: ({ id, z: { rundgaenge } }) => {
    const schluessel = id ? decodeURIComponent(id) : undefined;
    return {
      liste: <RundgaengeListe z={rundgaenge} offen={schluessel} />,
      rechts: <RundgaengeRechts z={rundgaenge} schluessel={schluessel} />,
    };
  },
  // Tipps (#942): alle in der Mitte, rechts das Formular.
  tipps: ({ id, z: { tipps } }) => {
    const schluessel = id ? decodeURIComponent(id) : undefined;
    return { liste: <TippsListe z={tipps} offen={schluessel} />, rechts: <TippsRechts z={tipps} schluessel={schluessel} /> };
  },
  // Datenschutz-Auskünfte (#668): Liste in der Mitte, rechts Auskunft, Assistent („neu“) oder Einstellungen.
  auskuenfte: ({ id, z: { datenschutz } }) => ({
    liste: <AuskuenfteListe z={datenschutz} offen={id} />,
    rechts: <AuskunftRechts z={datenschutz} id={id} />,
  }),
  loeschkonzept: ({ z }) => ({ rechts: <LoeschkonzeptPanel z={z.datenschutz} /> }),
  loeschprotokoll: () => ({ rechts: <LoeschprotokollPanel /> }),
  aufbewahrung: ({ z }) => ({ rechts: <DarfWegPanel z={z.darfWeg} /> }),
} satisfies Seiten;

/** Benutzer: Liste, ohne Auswahl der Empfänger der Aufgaben (#719), neu, Systemkonto oder ein Benutzer. */
export const benutzerSeiten = {
  benutzer: ({ id, z: { benutzer, aufgabenEmpfaenger } }) => {
    let rechts: ReactNode;
    const liste = <BenutzerListe liste={benutzer.liste} offen={id} alltag={aufgabenEmpfaenger.stand?.benutzerId ?? null} />;
    // Ohne Auswahl (#719): wer im Alltag die Aufgaben ohne Empfänger bekommt.
    if (!id) rechts = <AufgabenEmpfaengerBlock z={aufgabenEmpfaenger} benutzer={benutzer.liste} />;
    else if (id === 'neu') rechts = <BenutzerNeu key="neu" neuLaden={benutzer.laden} />;
    else if (id?.startsWith('konto-')) rechts = <SystemkontoDetail key={id} id={id.slice(6)} />;
    else if (id) {
      const b = benutzer.liste.find((x) => x.id === id);
      rechts = b ? (
        <BenutzerDetail key={b.id} b={b} neuLaden={benutzer.laden} />
      ) : benutzer.geladen ? (
        <div className="leer">
          <p>{t('werkbank.werkbank.diesen-benutzer-gibt-es')}</p>
        </div>
      ) : (
        <p className="leise">{t('werkbank.werkbank.lade')}</p>
      );
    }
    return { liste, rechts };
  },
} satisfies Seiten;
