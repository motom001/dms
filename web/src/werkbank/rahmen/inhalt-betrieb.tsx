import type { ReactNode } from 'react';
import { SuchePanel } from '../SucheEinstellungen';
import { WoerterListe, WoerterRechts } from '../Woerter';
import { AnmeldeschutzPanel } from '../Anmeldeschutz';
import { RegionPanel } from '../Region';
import { DatenEinstellungenPanel } from '../DatenEinstellungen';
import { OrganisationPanel } from '../Organisation';
import { SprachenPanel } from '../Sprachen';
import { VollexportPanel } from '../Vollexport';
import { PostfachEditor, PostfaecherListe } from '../Postfaecher';
import { EingangsordnerPanel } from '../Eingangsordner';
import { WebdavPanel } from '../Webdav';
import { t } from '../../sprache';
import { BetriebPanel } from '../Betrieb';
import { DatenbankAbschnitte } from '../Datenbank';
import { ExterneDiensteAbschnitt, KiKostenAbschnitt } from '../ExterneDienste';
import { TechnikPanel } from '../Technik';
import { AufgabenListe, AufgabenPanel } from '../Aufgaben';
import { TexterkennungPanel, WartungPanel } from '../Texterkennung';
import { WartungsmodusPanel } from '../Wartungsmodus';
import { SicherungPanel } from '../Sicherung';
import { WiederherstellungPanel } from '../Wiederherstellung';
import { AnbindungPanel } from '../Anbindung';
import { SpeicherplatzPanel } from '../Speicherplatz';
import { WerkzeugeHinweis } from '../Werkzeuge';
import { AuslastungAbschnitt, ErweiterungenHinweis } from '../Auslastung';
import { PapierkorbDetail, PapierkorbListe } from '../../ablage/Papierkorb';
import type { Inhalt, Kontext } from './inhalt';

/* Inhalte der Bereiche, zweiter Teil: Einstellungen, Post, Wartung, Sichern, Systemzustand. */

/** E-Mail-Versand, Aufgaben, Anbindung, Region, Daten, Organisation, Sprachen, Anmeldeschutz, Vollexport. */
export function einstellungen(k: Kontext): Inhalt | undefined {
  const { bereich, id } = k;
  const {
    betrieb,
    aufgabenFilter,
    aufgaben,
    uebersicht,
    datenschutzRecht,
    datenschutz,
    vollexport,
    anmeldeschutz,
    region,
    daten,
    nutzung,
    organisation,
    sprachen,
    anbindung,
    ansicht,
  } = k.z;
  let liste: ReactNode;
  let rechts: ReactNode;
  if (bereich === 'betrieb') {
    rechts = <BetriebPanel b={betrieb} />;
  } else if (bereich === 'aufgaben') {
    liste = <AufgabenListe z={aufgaben} filter={aufgabenFilter} offen={id} />;
    rechts = <AufgabenPanel z={aufgaben} id={id} />;
  } else if (bereich === 'anbindung') {
    rechts = <AnbindungPanel z={anbindung} nachAenderung={() => void uebersicht.laden()} />;
  } else if (bereich === 'region') {
    rechts = <RegionPanel z={region} />;
  } else if (bereich === 'daten') {
    rechts = <DatenEinstellungenPanel z={daten} />;
  } else if (bereich === 'organisation') {
    // Nutzung und Eigene Organisation auf einer Seite (#1170).
    rechts = (
      <OrganisationPanel
        z={organisation}
        nutzung={nutzung}
        datenschutz={datenschutzRecht ? datenschutz : null}
        nachNutzung={() => void ansicht.laden()}
      />
    );
  } else if (bereich === 'sprachen') {
    rechts = <SprachenPanel z={sprachen} />;
  } else if (bereich === 'anmeldeschutz') {
    rechts = <AnmeldeschutzPanel z={anmeldeschutz} />;
  } else if (bereich === 'vollexport') {
    rechts = <VollexportPanel z={vollexport} />;
  } else return undefined;
  return { liste, rechts };
}

/** Texterkennung, Wörter, Wartung, Sicherung, Postfächer, Eingangsordner, WebDAV, Papierkorb. */
export function postUndWartung(k: Kontext): Inhalt | undefined {
  const { bereich, id, wartungAn } = k;
  const { papierkorb, ocr, woerter, wartungsmodus, sicherung, eingang, webdav, postfaecher } = k.z;
  let liste: ReactNode;
  let rechts: ReactNode;
  if (bereich === 'texterkennung') {
    // Suche und Volltext (#725): Texterkennung, Tippfehler und gleichbedeutende Wörter. „Neue PDFs automatisch
    // verkleinern“ steht seit #1190 im Systemzustand beim Speicherplatz.
    rechts = (
      <>
        <TexterkennungPanel t={ocr} wartungAn={wartungAn} />
        <SuchePanel />
      </>
    );
  } else if (bereich === 'woerter') {
    // Gleichbedeutende Wörter (#992): Gruppen in der Mitte, rechts die Wörter einer Gruppe.
    liste = <WoerterListe z={woerter} offen={id} />;
    rechts = <WoerterRechts z={woerter} id={id} />;
  } else if (bereich === 'wartung') {
    // Wartung (#725): Wartungsmodus und Wartungsoperationen auf einer Seite.
    rechts = (
      <>
        <WartungsmodusPanel w={wartungsmodus} />
        <WartungPanel t={ocr} wartungAn={wartungAn} abschnitt />
      </>
    );
  } else if (bereich === 'sicherung') {
    // Sicherung mit Wiederherstellen als Abschnitt (#725).
    rechts = (
      <>
        <SicherungPanel z={sicherung} />
        <WiederherstellungPanel abschnitt />
      </>
    );
  } else if (bereich === 'postfaecher') {
    liste = <PostfaecherListe z={postfaecher} offen={id} />;
    rechts = id ? (
      <PostfachEditor key={`${id}-${postfaecher.liste ? 1 : 0}`} z={postfaecher} id={id} />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-links-ein-postfach')}</p>
      </div>
    );
  } else if (bereich === 'eingangsordner') {
    rechts = <EingangsordnerPanel z={eingang} />;
  } else if (bereich === 'webdav') {
    rechts = <WebdavPanel z={webdav} />;
  } else if (bereich === 'papierkorb') {
    liste = <PapierkorbListe z={papierkorb} werkbank offen={id} />;
    rechts = id ? (
      <PapierkorbDetail key={id} id={id} werkbank />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-links-eine-geloeschte')}</p>
      </div>
    );
  } else return undefined;
  return { liste, rechts };
}

/** Systemzustand (#725): Speicherplatz, Auslastung, Datenbank, externe Dienste, Version. */
export function systemzustand(k: Kontext): Inhalt | undefined {
  const { bereich } = k;
  const { datenbank, externeDienste, technik, uebersicht, wartungsmodus, speicherplatz, systemlast } = k.z;
  let rechts: ReactNode;
  if (bereich === 'systemzustand') {
    // Systemzustand (#725) nimmt Version und Updates (früher „Technik“) und die Auslastung der Datenbank auf.
    rechts = (
      <SpeicherplatzPanel
        z={speicherplatz}
        nachAenderung={() => {
          void uebersicht.laden();
          void wartungsmodus.laden();
        }}
        hinweise={<WerkzeugeHinweis werkzeuge={technik.u?.werkzeuge} pruefen={() => technik.laden(true)} />}
        auslastung={
          <>
            <ErweiterungenHinweis liste={systemlast.stand?.erweiterungen} />
            <AuslastungAbschnitt z={systemlast} />
          </>
        }
        unten={
          <>
            <div id="datenbank">
              <DatenbankAbschnitte z={datenbank} offen={new URLSearchParams(location.search).get('offen') ?? undefined} />
            </div>
            {/* Externe Dienste und KI-Kosten (#565). */}
            <ExterneDiensteAbschnitt z={externeDienste} />
            <KiKostenAbschnitt sichtbar nachAenderung={() => void externeDienste.laden()} />
            <TechnikPanel t={technik} abschnitt />
          </>
        }
      />
    );
  } else return undefined;
  return { rechts };
}
