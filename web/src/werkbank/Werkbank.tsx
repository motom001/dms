import type { InstalliertesPaket } from '../../../shared/src/pakete';
import { AnmeldeschutzPanel, useAnmeldeschutz } from './Anmeldeschutz';
import { NummernkreisEditor, NummernkreiseListe, useNummernkreise } from './Nummernkreise';
import { StempelPanel, useStempelVorlagenWerkbank } from './Stempel';
import { DarfWegPanel, useDarfWeg } from './Archiv';
import { PaketeListe, PaketLink, PaketePanel, usePakete } from './Pakete';
import { useVollexport, VollexportPanel } from './Vollexport';
import { PostfachEditor, PostfaecherListe, usePostfaecher } from './Postfaecher';
import { EingangsordnerPanel, useEingangsordner } from './Eingangsordner';
import { useWebdav, WebdavPanel } from './Webdav';
import { useEffect, type ReactNode } from 'react';
import { Dreiteilung } from '../bereiche';
import { useDaten } from '../daten';
import { TypEditor } from '../einrichtung/Einrichtung';
import { geheZu, Link } from '../ort';
import { hatMitte, wartungsPlakette, werkbankEbene, werkbankUmleitung, werkbankZurueck } from '../../../shared/src/werkbankansicht';
import { BenutzerDetail, BenutzerListe, BenutzerNeu, useBenutzer } from './Benutzer';
import { BetriebPanel, useBetrieb } from './Betrieb';
import { SichtEditor, SichtenListe } from './Sichten';
import { DatenbankPanel, useDatenbank } from './Datenbank';
import { DemoPanel } from './Demo';
import { DesignEditor, DesignListe } from './Designs';
import { ProtokollDetail, ProtokollListe, useProtokoll } from './Protokoll';
import { TechnikPanel, useTechnik } from './Technik';
import { TresorPanel, useTresor } from './Verschluesselung';
import { AufgabenListe, AufgabenPanel, useAufgaben } from './Aufgaben';
import { TexterkennungPanel, useTexterkennung, WartungPanel } from './Texterkennung';
import { Hilfe, useHandbuch } from '../Hilfe';
import { AnsichtPanel, useWerkbankAnsicht, type BereichZustand } from './Ansicht';
import { UebersichtListe, UebersichtPanel, useUebersicht, WerkbankNavigation, type WerkbankEintrag } from './Uebersicht';
import { useWartungsmodus, WartungsmodusPanel } from './Wartungsmodus';
import { SicherungPanel, useSicherung } from './Sicherung';
import { WiederherstellungPanel } from './Wiederherstellung';
import { FehlermeldungDetail, FehlermeldungenListe, useFehlermeldungen } from './Fehlermeldungen';
import { AnbindungPanel, useAnbindung } from './Anbindung';
import { SpeicherplatzPanel, useSpeicherplatz } from './Speicherplatz';
import { PapierkorbDetail, PapierkorbListe, usePapierkorb } from '../ablage/Papierkorb';
import { filterAusAdresse } from '../../../shared/src/aufgabenfilter';
import { useBeiWiederErreichbar } from '../erreichbar';

/**
 * Werkbank für Administratoren, aufgebaut wie die Ablage:
 *   Bereiche  →  Elemente des Bereichs  →  Bearbeitung
 *
 * /werkbank                        Übersicht: was zu tun ist (#68)
 * /werkbank/typen[/:id|/neu]
 * /werkbank/benutzer[/:id|/neu]
 * /werkbank/sichten[/:id|/neu]       Sichten der Ablage (#38)
 * /werkbank/demo
 * /werkbank/protokoll[/:nr]
 * /werkbank/datenbank[?offen=:id]   lange Zugriffe rechts, aufklappbar (#366)
 * /werkbank/technik
 * /werkbank/designs[/:id|/neu]
 * /werkbank/betrieb                 E-Mail-Versand und Adresse des DMS (#37)
 * /werkbank/verschluesselung        Schlüssel für Passwörter (#39)
 * /werkbank/papierkorb[/:id]        Papierkorb aller Benutzer und Aufbewahrung (#43)
 * /werkbank/texterkennung           Texterkennung und Volltext (#45)
 * /werkbank/aufgaben[/:id][?filter] Aufgaben aller Benutzer mit Filter, tägliche Zusammenfassung (#54, #366)
 * /werkbank/wartung                 Wartungsoperationen, z. B. Volltext nachholen (#45)
 * /werkbank/fehlermeldungen[/:id]  Fehlermeldungen der Benutzer (#70)
 * /werkbank/wartungsmodus          Wartungsmodus (#102)
 * /werkbank/sicherung              Sicherung, Zeitplan, Notfallblatt, Probe (#103–#106, #109)
 * /werkbank/wiederherstellung      Sicherung einspielen (#107)
 * /werkbank/anbindung            Datenbank-Anbindung (#119)
 * /werkbank/speicherplatz         Speicherplatz je Ordner, Warnschwelle und Grenze (#115, #116)
 * /werkbank/webdav                WebDAV-Laufwerk an/aus, Stand, letzte Zugriffe (#346, rechts seit #366)
 * /werkbank/stempel                Vorlagen für Stempel beim Weitergeben (#394), zweiteilig
 *
 * Die Mitte gibt es nur für große Sammlungen, die man bearbeitet (#366, `hatMitte`); alle anderen
 * Bereiche sind zweiteilig: links die Bereiche, rechts die ganze Seite.
 */
export function Werkbank({ teile }: { teile: string[] }) {
  const d = useDaten();
  const handbuch = useHandbuch();
  const [, bereich = 'uebersicht', id] = teile;
  const benutzer = useBenutzer();
  const protokoll = useProtokoll(bereich === 'protokoll');
  const datenbank = useDatenbank(bereich === 'datenbank');
  const technik = useTechnik(bereich === 'technik');
  const betrieb = useBetrieb();
  const tresor = useTresor();
  const papierkorb = usePapierkorb(true, bereich === 'papierkorb');
  // Pakete: Installation über einen Link (?installieren=…) steht rechts, auch ohne gewähltes Paket.
  const installieren = bereich === 'pakete' && !id ? new URLSearchParams(location.search).get('installieren') : null;
  const aufgabenFilter = filterAusAdresse(new URLSearchParams(location.search));
  const aufgaben = useAufgaben(bereich === 'aufgaben', !!aufgabenFilter.erledigt);
  const ocr = useTexterkennung(bereich === 'texterkennung' || bereich === 'wartung');
  const uebersicht = useUebersicht();
  const meldungen = useFehlermeldungen(bereich === 'fehlermeldungen');
  const wartungsmodus = useWartungsmodus(bereich === 'wartungsmodus');
  const sicherung = useSicherung(bereich === 'sicherung');
  const speicherplatz = useSpeicherplatz(bereich === 'speicherplatz');
  const eingang = useEingangsordner(bereich === 'eingangsordner');
  const webdav = useWebdav(bereich === 'webdav');
  const postfaecher = usePostfaecher(bereich === 'postfaecher');
  const nummernkreise = useNummernkreise(bereich === 'nummernkreise');
  const stempel = useStempelVorlagenWerkbank(bereich === 'stempel');
  const darfWeg = useDarfWeg(bereich === 'darfweg');
  const vollexport = useVollexport(bereich === 'vollexport');
  const pakete = usePakete(bereich === 'pakete' || bereich === 'typen');
  const anmeldeschutz = useAnmeldeschutz(bereich === 'anmeldeschutz');
  const anbindung = useAnbindung(bereich === 'anbindung');
  const ansicht = useWerkbankAnsicht();
  // Zahlen links (#375): die des geladenen Bereichs, sonst die aus der Übersicht; nur > 0 anzeigen.
  const uz = uebersicht.stand?.zahlen;
  const zahl = (geladen: number | null | undefined, ersatz: number | null | undefined) => (geladen ?? ersatz) || undefined;
  // Wieder erreichbar nach Update oder Neustart (#122): Übersicht und offenen Bereich neu laden.
  useBeiWiederErreichbar(() => {
    void uebersicht.laden();
    const offen: Record<string, (() => Promise<unknown>) | undefined> = {
      protokoll: protokoll.neu, datenbank: datenbank.laden, technik: technik.laden, betrieb: betrieb.laden,
      verschluesselung: tresor.laden, papierkorb: papierkorb.laden, aufgaben: aufgaben.laden, texterkennung: ocr.laden,
      wartung: ocr.laden, fehlermeldungen: meldungen.laden, wartungsmodus: wartungsmodus.laden, sicherung: sicherung.laden,
      speicherplatz: speicherplatz.laden, anbindung: anbindung.laden, benutzer: benutzer.laden, webdav: webdav.laden,
    };
    void offen[bereich]?.();
  });
  // Anmeldungen und Aktivität ändern sich laufend: beim Öffnen der Benutzer neu laden.
  useEffect(() => { if (bereich === 'benutzer') void benutzer.laden(); }, [bereich, id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Alte Direktlinks in Bereiche ohne Mitte (#366), z. B. /werkbank/datenbank/:id → Seite, Eintrag aufgeklappt.
  const umleitung = werkbankUmleitung(bereich, id);
  useEffect(() => { if (umleitung) geheZu(umleitung, true); }, [umleitung]);
  // Hintergrundarbeit ruht nur im aktiven Wartungsmodus (#366: Hinweis bei Texterkennung und Volltext).
  const wartungAn = wartungsPlakette(wartungsmodus.stand?.stufe ?? 'aus', wartungsmodus.stand?.aktivAb ?? null) === 'an';

  let liste: ReactNode = null;
  let rechts: ReactNode = <div className="platzhalter"><p>Wähle in der Liste ein Element aus.</p></div>;

  if (bereich === 'uebersicht') {
    liste = <UebersichtListe u={uebersicht} />;
    rechts = <UebersichtPanel u={uebersicht} />;
  } else if (bereich === 'fehlermeldungen') {
    liste = <FehlermeldungenListe z={meldungen} offen={id} />;
    rechts = id ? <FehlermeldungDetail key={id} id={id} z={meldungen} neuLaden={async () => { await meldungen.laden(); await uebersicht.laden(); }} /> : <div className="platzhalter"><p>Wähle links eine Meldung.</p></div>;
  } else if (bereich === 'typen') {
    liste = <TypenListe offen={id} pakete={pakete.stand?.installiert ?? []} />;
    if (id === 'neu') {
      // Mappentyp kopieren (#147): /werkbank/typen/neu?kopie=<id>
      const kopie = new URLSearchParams(location.search).get('kopie');
      const vorlage = kopie ? d.typ(kopie) : undefined;
      rechts = <TypEditor key={`neu-${vorlage?.id ?? ''}`} vorlage={vorlage && !vorlage.system ? vorlage : undefined} />;
    }
    else if (id) {
      const t = d.typ(id);
      rechts = t ? <TypEditor key={t.id} typ={t} /> : <div className="leer"><p>Diesen Mappentyp gibt es nicht (mehr).</p></div>;
    } else if (!d.typen.length) {
      rechts = <div className="platzhalter"><p>Noch keine Mappentypen. Lege mit „+ Neu“ einen an oder lade unter <Link to="/werkbank/demo" className="verweis">Demo-Daten</Link> die Beispiele.</p></div>;
    }
  } else if (bereich === 'sichten') {
    liste = <SichtenListe offen={id} />;
    rechts = id ? <SichtEditor key={`${id}-${d.sicht(id)?.geaendert ?? ''}`} id={id} /> : <div className="platzhalter"><p>Wähle links eine Ansicht oder lege mit „+ Neu“ eine an.</p></div>;
  } else if (bereich === 'benutzer') {
    liste = <BenutzerListe liste={benutzer.liste} offen={id} />;
    if (id === 'neu') rechts = <BenutzerNeu key="neu" neuLaden={benutzer.laden} />;
    else if (id) {
      const b = benutzer.liste.find((x) => x.id === id);
      rechts = b ? <BenutzerDetail key={b.id} b={b} neuLaden={benutzer.laden} /> : benutzer.geladen ? <div className="leer"><p>Diesen Benutzer gibt es nicht (mehr).</p></div> : <p className="leise">Lade …</p>;
    }
  } else if (bereich === 'demo') {
    rechts = <DemoPanel />;
  } else if (bereich === 'designs') {
    liste = <DesignListe offen={id} />;
    rechts = id ? <DesignEditor key={id} id={id} /> : <div className="platzhalter"><p>Wähle ein Design zum Bearbeiten oder lege mit „+ Neu“ ein eigenes an.</p></div>;
  } else if (bereich === 'betrieb') {
    rechts = <BetriebPanel b={betrieb} />;
  } else if (bereich === 'aufgaben') {
    liste = <AufgabenListe z={aufgaben} filter={aufgabenFilter} offen={id} mailAn={uebersicht.stand?.mail} />;
    rechts = <AufgabenPanel z={aufgaben} id={id} />;
  } else if (bereich === 'texterkennung') {
    rechts = <TexterkennungPanel t={ocr} wartungAn={wartungAn} />;
  } else if (bereich === 'wartung') {
    rechts = <WartungPanel t={ocr} wartungAn={wartungAn} />;
  } else if (bereich === 'wiederherstellung') {
    rechts = <WiederherstellungPanel />;
  } else if (bereich === 'sicherung') {
    rechts = <SicherungPanel z={sicherung} />;
  } else if (bereich === 'anbindung') {
    rechts = <AnbindungPanel z={anbindung} nachAenderung={() => void uebersicht.laden()} />;
  } else if (bereich === 'anmeldeschutz') {
    rechts = <AnmeldeschutzPanel z={anmeldeschutz} />;
  } else if (bereich === 'pakete') {
    liste = <PaketeListe z={pakete} offen={id} />;
    rechts = installieren ? <PaketLink key={installieren} z={pakete} wert={installieren} /> : <PaketePanel z={pakete} id={id} />;
  } else if (bereich === 'vollexport') {
    rechts = <VollexportPanel z={vollexport} />;
  } else if (bereich === 'darfweg') {
    rechts = <DarfWegPanel z={darfWeg} />;
  } else if (bereich === 'nummernkreise') {
    liste = <NummernkreiseListe z={nummernkreise} offen={id} />;
    rechts = id ? <NummernkreisEditor key={`${id}-${nummernkreise.liste ? 1 : 0}`} z={nummernkreise} schluessel={id} /> : <div className="platzhalter"><p>Wähle links einen Nummernkreis oder lege mit „+ Neu“ einen an.</p></div>;
  } else if (bereich === 'stempel') {
    rechts = <StempelPanel z={stempel} />;
  } else if (bereich === 'postfaecher') {
    liste = <PostfaecherListe z={postfaecher} offen={id} />;
    rechts = id ? <PostfachEditor key={`${id}-${postfaecher.liste ? 1 : 0}`} z={postfaecher} id={id} /> : <div className="platzhalter"><p>Wähle links ein Postfach oder lege mit „+ Neu“ eines an.</p></div>;
  } else if (bereich === 'eingangsordner') {
    rechts = <EingangsordnerPanel z={eingang} />;
  } else if (bereich === 'webdav') {
    rechts = <WebdavPanel z={webdav} />;
  } else if (bereich === 'speicherplatz') {
    rechts = <SpeicherplatzPanel z={speicherplatz} nachAenderung={() => { void uebersicht.laden(); void wartungsmodus.laden(); }} />;
  } else if (bereich === 'wartungsmodus') {
    rechts = <WartungsmodusPanel w={wartungsmodus} />;
  } else if (bereich === 'papierkorb') {
    liste = <PapierkorbListe z={papierkorb} werkbank offen={id} />;
    rechts = id ? <PapierkorbDetail key={id} id={id} werkbank /> : <div className="platzhalter"><p>Wähle links eine gelöschte Mappe aus, um sie anzusehen oder wiederherzustellen.</p></div>;
  } else if (bereich === 'verschluesselung') {
    rechts = <TresorPanel t={tresor} />;
  } else if (bereich === 'technik') {
    rechts = <TechnikPanel t={technik} />;
  } else if (bereich === 'datenbank') {
    rechts = <DatenbankPanel z={datenbank} offen={new URLSearchParams(location.search).get('offen') ?? undefined} />;
  } else if (bereich === 'protokoll') {
    liste = <ProtokollListe p={protokoll} offen={id} />;
    rechts = <ProtokollDetail p={protokoll} nr={id} />;
  }

  const eintraege: WerkbankEintrag[] = [
          { pfad: 'uebersicht', name: 'Übersicht', gruppe: null, warn: uebersicht.hinweise || undefined },
          { pfad: 'typen', name: 'Mappentypen', gruppe: 'ablage', zahl: d.typen.length },
          { pfad: 'sichten', name: 'Ansichten', gruppe: 'ablage', zahl: d.sichten.length || undefined },
          { pfad: 'nummernkreise', name: 'Nummernkreise', gruppe: 'ablage', zahl: zahl(nummernkreise.liste?.length, uz?.nummernkreise) },
          { pfad: 'stempel', name: 'Stempel', gruppe: 'ablage', zahl: stempel.liste?.length || undefined },
          { pfad: 'pakete', name: 'Pakete', gruppe: 'ablage', zahl: zahl(pakete.stand?.installiert.length, uz?.pakete) },
          ...(d.typen.some((t) => t.archiv) ? [{ pfad: 'darfweg', name: 'Darf weg', gruppe: 'ablage' as const, zahl: zahl(darfWeg.liste?.length, uz?.darfWeg) }] : []),
          { pfad: 'benutzer', name: 'Benutzer', gruppe: 'benutzer', zahl: zahl(benutzer.geladen ? benutzer.liste.filter((b) => b.aktiv).length : undefined, uz?.benutzer) },
          { pfad: 'anmeldeschutz', name: 'Anmeldeschutz', gruppe: 'benutzer', zahl: anmeldeschutz.stand?.gesperrt.length || undefined },
          { pfad: 'aufgaben', name: 'Aufgaben', gruppe: 'benutzer', zahl: zahl(aufgaben.liste?.filter((a) => !a.erledigt).length, uebersicht.stand?.aufgaben.offen) },
          { pfad: 'betrieb', name: 'E-Mail und Adresse', gruppe: 'einstellungen', warn: uebersicht.stand && !uebersicht.stand.mail ? 'aus' : undefined, warnTitel: 'E-Mail-Versand aus' },
          { pfad: 'verschluesselung', name: 'Verschlüsselung', gruppe: 'einstellungen', warn: tresor.stand && tresor.stand.zustand !== 'vorhanden' ? 'fehlt' : undefined },
          { pfad: 'designs', name: 'Designs', gruppe: 'einstellungen', zahl: d.designs.length || undefined },
          { pfad: 'papierkorb', name: 'Papierkorb', gruppe: 'einstellungen', zahl: zahl(papierkorb.eintraege ? papierkorb.eintraege.length + papierkorb.dokumente.length : undefined, uebersicht.stand?.papierkorb.anzahl) },
          { pfad: 'anbindung', name: 'Datenbank-Anbindung', gruppe: 'einstellungen', warn: uebersicht.stand?.anbindung && (uebersicht.stand.anbindung.umgebung === 'abweichend' || uebersicht.stand.anbindung.neustartNoetig) ? '!' : undefined, warnTitel: 'DATABASE_URL weicht ab oder Neustart nötig' },
          { pfad: 'speicherplatz', name: 'Speicherplatz', gruppe: 'einstellungen', warn: uebersicht.stand?.speicherplatz && uebersicht.stand.speicherplatz.zustand !== 'ok' ? (uebersicht.stand.speicherplatz.zustand === 'grenze' ? 'voll' : 'knapp') : undefined, warnTitel: 'Speicherplatz knapp' },
          { pfad: 'postfaecher', name: 'Postfächer', gruppe: 'einstellungen', zahl: zahl(postfaecher.liste?.length, uz?.postfaecher), warn: uebersicht.stand?.postfachAnmeldung?.length || postfaecher.liste?.some((p) => p.stand.fehlerFolge > 0 || (p.oauth && p.oauth.zustand !== 'ok')) ? '!' : undefined, warnTitel: uebersicht.stand?.postfachAnmeldung?.length ? 'Anmeldung abgelaufen oder fehlt' : 'Abruf fehlgeschlagen' },
          ...(eingang.stand?.vorhanden ? [{ pfad: 'eingangsordner', name: 'Eingangsordner', gruppe: 'einstellungen' as const, warn: eingang.stand.fehler?.length ? String(eingang.stand.fehler.length) : undefined, warnTitel: 'abgelehnte Dateien' }] : []),
          { pfad: 'webdav', name: 'WebDAV-Laufwerk', gruppe: 'einstellungen', warn: webdav.stand?.einstellung.aktiv ? 'an' : undefined, warnTitel: 'Das Laufwerk ist eingeschaltet' },
          { pfad: 'texterkennung', name: 'Texterkennung', gruppe: 'einstellungen', warn: uebersicht.stand?.texterkennung?.fehler ? String(uebersicht.stand.texterkennung.fehler) : undefined, warnTitel: 'Dokumente mit Fehler' },
          { pfad: 'protokoll', name: 'Protokoll', gruppe: 'wartung', warn: protokoll.debug?.an ? 'Debug' : undefined, warnTitel: 'Debug-Modus ist an' },
          { pfad: 'fehlermeldungen', name: 'Gemeldete Fehler', gruppe: 'wartung', warn: uebersicht.stand?.fehlermeldungen ? String(uebersicht.stand.fehlermeldungen) : undefined, warnTitel: 'offene Meldungen' },
          { pfad: 'sicherung', name: 'Sicherung', gruppe: 'wartung', warn: uebersicht.stand?.sicherung && (uebersicht.stand.sicherung.fehler || (uebersicht.stand.sicherung.schluessel && uebersicht.stand.sicherung.zuAlt)) ? '!' : undefined, warnTitel: 'Sicherung fehlgeschlagen oder zu alt' },
          { pfad: 'wiederherstellung', name: 'Wiederherstellen', gruppe: 'wartung' },
          { pfad: 'vollexport', name: 'Vollexport', gruppe: 'wartung' },
          { pfad: 'wartungsmodus', name: 'Wartungsmodus', gruppe: 'wartung', warn: wartungsPlakette(wartungsmodus.stand?.stufe ?? 'aus', wartungsmodus.stand?.aktivAb ?? null), warnTitel: wartungAn ? 'Wartungsmodus ist an' : 'Wartungsmodus ist angekündigt' },
          { pfad: 'wartung', name: 'Wartungsoperationen', gruppe: 'wartung' },
          { pfad: 'datenbank', name: 'Datenbank', gruppe: 'wartung' },
          { pfad: 'technik', name: 'Technik', gruppe: 'wartung' },
          { pfad: 'demo', name: 'Demo-Daten', gruppe: 'wartung', zahl: Object.values(d.zaehler.typen).reduce((a, z) => a + z.demo, 0) || undefined },
  ];
  const zustand: Record<string, BereichZustand> = Object.fromEntries(eintraege.map((e) => [e.pfad, { warn: e.warn }]));
  if (bereich === 'ansicht') {
    rechts = <AnsichtPanel z={ansicht} zustand={zustand} />;
  }

  return (
    <Dreiteilung ort="werkbank" ebene={werkbankEbene(bereich, id, !!installieren)} mitte={hatMitte(bereich)} offen={id}>
      <aside className="spalte sichten" aria-label="Bereiche">
        <WerkbankNavigation bereich={bereich} eintraege={eintraege} zeigen={ansicht.zeigen} benutzt={ansicht.stand?.benutzt} />
        {/* Freiwillig, ohne Gebühren für beide Seiten (GitHub Sponsors von persönlichen Konten). */}
        <a className="unterstuetzen" href="https://github.com/sponsors/motom001" target="_blank" rel="noreferrer">
          <span aria-hidden="true">♥</span> Projekt unterstützen
          <span className="leise klein">freiwillig, Betrag frei wählbar</span>
        </a>
        <a className="unterstuetzen handbuchlink" href={handbuch('admin')} target="_blank" rel="noreferrer">Administratorhandbuch ↗</a>
      </aside>
      <section className="spalte liste" aria-label="Elemente">{liste}</section>
      <section className="spalte mappe" aria-label="Bearbeitung">
        <Link to={werkbankZurueck(bereich)} className="verweis nur-schmal">{hatMitte(bereich) ? '← Zur Liste' : '← Bereiche'}</Link>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

function TypenListe({ offen, pakete }: { offen?: string; pakete: InstalliertesPaket[] }) {
  const d = useDaten();
  return (
    <>
      <div className="listenkopf">
        <div><h1>Mappentypen</h1><p className="leise klein">Welche Arten von Mappen es gibt, mit Feldern, Registern und Titel. <Hilfe ort="werkbank.typen" /></p></div>
        <Link to="/werkbank/typen/neu" className="knopf primaer klein">+ Neu</Link>
      </div>
      {!d.typen.length
        ? <p className="leise leerliste">Noch keine Mappentypen.</p>
        : <ul className="mappenliste">
            {offen === 'neu' && <li><span className="eintrag an werk"><span className="titel">Neuer Mappentyp</span><span className="unter">noch nicht gespeichert</span></span></li>}
            {d.typen.map((t) => {
              const z = d.zaehler.typen[t.id];
              const anzahl = z?.anzahl ?? 0;
              const unpassend = z?.unpassend ?? 0;
              return (
                <li key={t.id}>
                  <Link to={`/werkbank/typen/${t.id}`} className={`eintrag werk ${offen === t.id ? 'an' : ''}`}>
                    <span className="titel">{t.name}{t.system && <span className="chip" title="Systemmappentyp: lässt sich erweitern, aber nicht löschen">System</span>}
                      {(() => { const p = pakete.find((x) => Object.values(x.typen).includes(t.id)); return p ? <> <span className="chip" title={`Aus dem Paket „${p.name}“ ${p.version}`}>Paket {p.name}</span></> : null; })()}</span>
                    <span className="unter">{t.felder.length} Felder · {t.register.length} Register · {anzahl.toLocaleString('de-DE')} {anzahl === 1 ? 'Mappe' : 'Mappen'}</span>
                    {unpassend > 0 && <span className="problem">{unpassend} passen nicht zur Definition</span>}
                  </Link>
                </li>
              );
            })}
          </ul>}
    </>
  );
}
