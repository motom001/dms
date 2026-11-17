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

/* Inhalte der Bereiche (#819): Liste in der Mitte und Seite rechts, je Gruppe eine Funktion. */

/** Was ein Bereich in der Mitte (Liste) und rechts zeigt; `rechts` leer = „Wähle in der Liste“. */
export interface Inhalt {
  liste?: ReactNode;
  rechts?: ReactNode;
}
/** Alles, was die Bereiche zum Zeichnen brauchen. */
export interface Kontext {
  bereich: string;
  id: string | undefined;
  d: ReturnType<typeof useDaten>;
  z: WerkbankZustaende & { pakete: PaketeZustand };
  installieren: string | null;
  wartungAn: boolean;
}

/** Übersicht, Fehlermeldungen, Demo, Beispiel-Ablage, Designs, Protokoll, Verschlüsselung. */
export function uebersichtUndPflege(k: Kontext): Inhalt | undefined {
  const { bereich, id } = k;
  const { protokoll, tresor, uebersicht, meldungen } = k.z;
  let liste: ReactNode;
  let rechts: ReactNode;
  if (bereich === 'uebersicht') {
    liste = <UebersichtListe u={uebersicht} />;
    rechts = <UebersichtPanel u={uebersicht} />;
  } else if (bereich === 'fehlermeldungen') {
    liste = <FehlermeldungenListe z={meldungen} offen={id} />;
    rechts = id ? (
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
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-links-eine-meldung')}</p>
      </div>
    );
  } else if (bereich === 'demo') {
    rechts = <DemoPanel />;
  } else if (bereich === 'beispielablage') {
    rechts = <BeispielAblagePanel />;
  } else if (bereich === 'designs') {
    liste = <DesignListe offen={id} />;
    rechts = id ? (
      <DesignEditor key={id} id={id} />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-ein-design-zum')}</p>
      </div>
    );
  } else if (bereich === 'protokoll') {
    liste = <ProtokollListe p={protokoll} offen={id} />;
    rechts = <ProtokollDetail p={protokoll} nr={id} />;
  } else if (bereich === 'verschluesselung') {
    rechts = <TresorPanel t={tresor} />;
  } else return undefined;
  return { liste, rechts };
}

/** Ansichten, Nummernkreise, Stempel. */
export function sichtenUndListen(k: Kontext): Inhalt | undefined {
  const { bereich, id, d } = k;
  const { nummernkreise, stempel, pakete } = k.z;
  let liste: ReactNode;
  let rechts: ReactNode;
  if (bereich === 'sichten') {
    liste = <SichtenListe offen={id} pakete={pakete.stand?.installiert ?? []} />;
    rechts = id ? (
      <SichtEditor key={`${id}-${d.sicht(id)?.geaendert ?? ''}`} id={id} />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-links-eine-ansicht')}</p>
      </div>
    );
  } else if (bereich === 'nummernkreise') {
    liste = <NummernkreiseListe z={nummernkreise} offen={id} pakete={pakete.stand?.installiert ?? []} />;
    rechts = id ? (
      <NummernkreisEditor key={`${id}-${nummernkreise.liste ? 1 : 0}`} z={nummernkreise} schluessel={id} />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-links-einen-nummernkreis')}</p>
      </div>
    );
  } else if (bereich === 'stempel') {
    // Dreiteilig seit #990: Vorlagen in der Mitte, rechts die gewählte mit Live-Vorschau (#799).
    liste = <StempelListe z={stempel} offen={id} />;
    rechts = id ? (
      <StempelEditor key={`${id}-${stempel.liste ? 1 : 0}`} z={stempel} id={id} />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.stempel.waehle')}</p>
      </div>
    );
  } else return undefined;
  return { liste, rechts };
}

/** Automatisierungsvorlagen, Rundgänge, Tipps, Datenschutz, Aufbewahrung. */
export function vorlagenUndDatenschutz(k: Kontext): Inhalt | undefined {
  const { bereich, id } = k;
  const { ablaufvorlagen, rundgaenge, tipps, darfWeg, datenschutz, pakete } = k.z;
  let liste: ReactNode;
  let rechts: ReactNode;
  if (bereich === 'ablaufvorlagen') {
    // Automatisierungsvorlagen (#1044): dreiteilig wie die Automatisierungen.
    const kennung = id ? decodeURIComponent(id) : undefined;
    liste = <AblaufvorlagenListe z={ablaufvorlagen} offen={kennung} pakete={pakete.stand?.installiert ?? []} />;
    rechts = kennung ? (
      <AblaufvorlageEditor key={`${kennung}-${ablaufvorlagen.stand ? 1 : 0}`} z={ablaufvorlagen} kennung={kennung} />
    ) : (
      <div className="platzhalter">
        <p>{t('automatisierung.vorlage.ui.waehlen')}</p>
      </div>
    );
  } else if (bereich === 'rundgaenge') {
    // Rundgänge (#941): alle in der Mitte, rechts der gewählte (eigene als YAML zum Bearbeiten).
    const schluessel = id ? decodeURIComponent(id) : undefined;
    liste = <RundgaengeListe z={rundgaenge} offen={schluessel} />;
    rechts = <RundgaengeRechts z={rundgaenge} schluessel={schluessel} />;
  } else if (bereich === 'tipps') {
    // Tipps (#942): alle in der Mitte, rechts das Formular.
    const schluessel = id ? decodeURIComponent(id) : undefined;
    liste = <TippsListe z={tipps} offen={schluessel} />;
    rechts = <TippsRechts z={tipps} schluessel={schluessel} />;
  } else if (bereich === 'auskuenfte') {
    // Datenschutz-Auskünfte (#668): Liste in der Mitte, rechts Auskunft, Assistent („neu“) oder Einstellungen.
    liste = <AuskuenfteListe z={datenschutz} offen={id} />;
    rechts = <AuskunftRechts z={datenschutz} id={id} />;
  } else if (bereich === 'loeschkonzept') {
    rechts = <LoeschkonzeptPanel z={datenschutz} />;
  } else if (bereich === 'loeschprotokoll') {
    rechts = <LoeschprotokollPanel />;
  } else if (bereich === 'aufbewahrung') {
    rechts = <DarfWegPanel z={darfWeg} />;
  } else return undefined;
  return { liste, rechts };
}

/** Benutzer: Liste, ohne Auswahl der Empfänger der Aufgaben (#719), neu, Systemkonto oder ein Benutzer. */
export function benutzerInhalt(k: Kontext): Inhalt | undefined {
  const { bereich, id } = k;
  const { benutzer, aufgabenEmpfaenger } = k.z;
  if (bereich !== 'benutzer') return undefined;
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
}
