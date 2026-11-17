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
import type { Seiten } from './inhalt';

/* Inhalte der Bereiche, zweiter Teil (#819, Tabelle seit #1281): Einstellungen, Post, Wartung, Sichern, Systemzustand. */

/** E-Mail-Versand, Aufgaben, Anbindung, Region, Daten, Organisation, Sprachen, Anmeldeschutz, Vollexport. */
export const einstellungenSeiten = {
  betrieb: ({ z }) => ({ rechts: <BetriebPanel b={z.betrieb} /> }),
  aufgaben: ({ id, z: { aufgaben, aufgabenFilter } }) => ({
    liste: <AufgabenListe z={aufgaben} filter={aufgabenFilter} offen={id} />,
    rechts: <AufgabenPanel z={aufgaben} id={id} />,
  }),
  anbindung: ({ z: { anbindung, uebersicht } }) => ({
    rechts: <AnbindungPanel z={anbindung} nachAenderung={() => void uebersicht.laden()} />,
  }),
  region: ({ z }) => ({ rechts: <RegionPanel z={z.region} /> }),
  daten: ({ z }) => ({ rechts: <DatenEinstellungenPanel z={z.daten} /> }),
  // Nutzung und Eigene Organisation auf einer Seite (#1170).
  organisation: ({ z: { organisation, nutzung, datenschutzRecht, datenschutz, ansicht } }) => ({
    rechts: (
      <OrganisationPanel
        z={organisation}
        nutzung={nutzung}
        datenschutz={datenschutzRecht ? datenschutz : null}
        nachNutzung={() => void ansicht.laden()}
      />
    ),
  }),
  sprachen: ({ z }) => ({ rechts: <SprachenPanel z={z.sprachen} /> }),
  anmeldeschutz: ({ z }) => ({ rechts: <AnmeldeschutzPanel z={z.anmeldeschutz} /> }),
  vollexport: ({ z }) => ({ rechts: <VollexportPanel z={z.vollexport} /> }),
} satisfies Seiten;

/** Texterkennung, Wörter, Wartung, Sicherung, Postfächer, Eingangsordner, WebDAV, Papierkorb. */
export const postUndWartungSeiten = {
  // Suche und Volltext (#725): Texterkennung, Tippfehler und gleichbedeutende Wörter. „Neue PDFs automatisch
  // verkleinern“ steht seit #1190 im Systemzustand beim Speicherplatz.
  texterkennung: ({ z, wartungAn }) => ({
    rechts: (
      <>
        <TexterkennungPanel t={z.ocr} wartungAn={wartungAn} />
        <SuchePanel />
      </>
    ),
  }),
  // Gleichbedeutende Wörter (#992): Gruppen in der Mitte, rechts die Wörter einer Gruppe.
  woerter: ({ id, z: { woerter } }) => ({ liste: <WoerterListe z={woerter} offen={id} />, rechts: <WoerterRechts z={woerter} id={id} /> }),
  // Wartung (#725): Wartungsmodus und Wartungsoperationen auf einer Seite.
  wartung: ({ z, wartungAn }) => ({
    rechts: (
      <>
        <WartungsmodusPanel w={z.wartungsmodus} />
        <WartungPanel t={z.ocr} wartungAn={wartungAn} abschnitt />
      </>
    ),
  }),
  // Sicherung mit Wiederherstellen als Abschnitt (#725).
  sicherung: ({ z }) => ({
    rechts: (
      <>
        <SicherungPanel z={z.sicherung} />
        <WiederherstellungPanel abschnitt />
      </>
    ),
  }),
  postfaecher: ({ id, z: { postfaecher } }) => ({
    liste: <PostfaecherListe z={postfaecher} offen={id} />,
    // Ein bestehendes Postfach baut sich neu auf, sobald die Liste da ist (Stand aus der Liste); ein neues nicht –
    // sonst gingen Eingaben und Fehler verloren, die vor dem Laden der Liste kamen (#1409).
    rechts: id ? (
      <PostfachEditor key={id === 'neu' ? id : `${id}-${postfaecher.liste ? 1 : 0}`} z={postfaecher} id={id} />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-links-ein-postfach')}</p>
      </div>
    ),
  }),
  eingangsordner: ({ z }) => ({ rechts: <EingangsordnerPanel z={z.eingang} /> }),
  webdav: ({ z }) => ({ rechts: <WebdavPanel z={z.webdav} /> }),
  papierkorb: ({ id, z: { papierkorb } }) => ({
    liste: <PapierkorbListe z={papierkorb} werkbank offen={id} />,
    rechts: id ? (
      <PapierkorbDetail key={id} id={id} werkbank />
    ) : (
      <div className="platzhalter">
        <p>{t('werkbank.werkbank.waehle-links-eine-geloeschte')}</p>
      </div>
    ),
  }),
} satisfies Seiten;

/** Systemzustand (#725): Speicherplatz, Auslastung, Datenbank, externe Dienste, Version. */
export const systemSeiten = {
  // Systemzustand (#725) nimmt Version und Updates (früher „Technik“) und die Auslastung der Datenbank auf.
  systemzustand: ({ z: { datenbank, externeDienste, technik, uebersicht, wartungsmodus, speicherplatz, systemlast } }) => ({
    rechts: (
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
    ),
  }),
} satisfies Seiten;
