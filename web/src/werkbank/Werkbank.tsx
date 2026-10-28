import { useEffect, type ReactNode } from 'react';
import { Dreiteilung } from '../bereiche';
import { useDaten } from '../daten';
import { TypEditor } from '../einrichtung/Einrichtung';
import { Link } from '../ort';
import { BenutzerDetail, BenutzerListe, BenutzerNeu, useBenutzer } from './Benutzer';
import { BetriebListe, BetriebPanel, useBetrieb } from './Betrieb';
import { SichtEditor, SichtenListe } from './Sichten';
import { DatenbankPanel, LanglaeuferListe, useDatenbank } from './Datenbank';
import { DemoListe, DemoPanel } from './Demo';
import { DesignEditor, DesignListe } from './Designs';
import { ProtokollDetail, ProtokollListe, useProtokoll } from './Protokoll';
import { TechnikListe, TechnikPanel, useTechnik } from './Technik';
import { TresorListe, TresorPanel, useTresor } from './Verschluesselung';
import { TexterkennungListe, TexterkennungPanel, useTexterkennung, WartungListe, WartungPanel } from './Texterkennung';
import { PapierkorbDetail, PapierkorbEinstellungen, PapierkorbListe, usePapierkorb } from '../ablage/Papierkorb';

/**
 * Werkbank für Administratoren, aufgebaut wie die Ablage:
 *   Bereiche  →  Elemente des Bereichs  →  Bearbeitung
 *
 * /werkbank/typen[/:id|/neu]
 * /werkbank/benutzer[/:id|/neu]
 * /werkbank/sichten[/:id|/neu]       Sichten der Ablage (#38)
 * /werkbank/demo
 * /werkbank/protokoll[/:nr]
 * /werkbank/datenbank[/:id]
 * /werkbank/technik
 * /werkbank/designs[/:id|/neu]
 * /werkbank/betrieb                 E-Mail-Versand und Adresse des DMS (#37)
 * /werkbank/verschluesselung        Schlüssel für Passwörter (#39)
 * /werkbank/papierkorb[/:id]        Papierkorb aller Benutzer und Aufbewahrung (#43)
 * /werkbank/texterkennung           Texterkennung und Volltext (#45)
 * /werkbank/wartung                 Wartungsoperationen, z. B. Volltext nachholen (#45)
 */
export function Werkbank({ teile }: { teile: string[] }) {
  const d = useDaten();
  const [, bereich = 'typen', id] = teile;
  const benutzer = useBenutzer();
  const protokoll = useProtokoll(bereich === 'protokoll');
  const datenbank = useDatenbank(bereich === 'datenbank');
  const technik = useTechnik(bereich === 'technik');
  const betrieb = useBetrieb();
  const tresor = useTresor();
  const papierkorb = usePapierkorb(true, bereich === 'papierkorb');
  const ocr = useTexterkennung(bereich === 'texterkennung' || bereich === 'wartung');
  // Anmeldungen und Aktivität ändern sich laufend: beim Öffnen der Benutzer neu laden.
  useEffect(() => { if (bereich === 'benutzer') void benutzer.laden(); }, [bereich, id]); // eslint-disable-line react-hooks/exhaustive-deps

  let liste: ReactNode = null;
  let rechts: ReactNode = <div className="platzhalter"><p>Wähle in der Liste ein Element aus.</p></div>;

  if (bereich === 'typen') {
    liste = <TypenListe offen={id} />;
    if (id === 'neu') rechts = <TypEditor key="neu" />;
    else if (id) {
      const t = d.typ(id);
      rechts = t ? <TypEditor key={t.id} typ={t} /> : <div className="leer"><p>Diesen Mappentyp gibt es nicht (mehr).</p></div>;
    } else if (!d.typen.length) {
      rechts = <div className="platzhalter"><p>Noch keine Mappentypen. Lege mit „+ Neu“ einen an oder lade unter <Link to="/werkbank/demo" className="verweis">Demo-Daten</Link> die Beispiele.</p></div>;
    }
  } else if (bereich === 'sichten') {
    liste = <SichtenListe offen={id} />;
    rechts = id ? <SichtEditor key={`${id}-${d.sicht(id)?.geaendert ?? ''}`} id={id} /> : <div className="platzhalter"><p>Wähle links eine Sicht oder lege mit „+ Neu“ eine an.</p></div>;
  } else if (bereich === 'benutzer') {
    liste = <BenutzerListe liste={benutzer.liste} offen={id} />;
    if (id === 'neu') rechts = <BenutzerNeu key="neu" neuLaden={benutzer.laden} />;
    else if (id) {
      const b = benutzer.liste.find((x) => x.id === id);
      rechts = b ? <BenutzerDetail key={b.id} b={b} neuLaden={benutzer.laden} /> : benutzer.geladen ? <div className="leer"><p>Diesen Benutzer gibt es nicht (mehr).</p></div> : <p className="leise">Lade …</p>;
    }
  } else if (bereich === 'demo') {
    liste = <DemoListe />;
    rechts = <DemoPanel />;
  } else if (bereich === 'designs') {
    liste = <DesignListe offen={id} />;
    rechts = id ? <DesignEditor key={id} id={id} /> : <div className="platzhalter"><p>Wähle ein Design zum Bearbeiten oder lege mit „+ Neu“ ein eigenes an.</p></div>;
  } else if (bereich === 'betrieb') {
    liste = <BetriebListe b={betrieb} />;
    rechts = <BetriebPanel b={betrieb} />;
  } else if (bereich === 'texterkennung') {
    liste = <TexterkennungListe t={ocr} />;
    rechts = <TexterkennungPanel t={ocr} />;
  } else if (bereich === 'wartung') {
    liste = <WartungListe t={ocr} />;
    rechts = <WartungPanel t={ocr} />;
  } else if (bereich === 'papierkorb') {
    liste = <PapierkorbListe z={papierkorb} werkbank offen={id} />;
    rechts = id ? <PapierkorbDetail key={id} id={id} werkbank /> : <PapierkorbEinstellungen z={papierkorb} />;
  } else if (bereich === 'verschluesselung') {
    liste = <TresorListe t={tresor} />;
    rechts = <TresorPanel t={tresor} />;
  } else if (bereich === 'technik') {
    liste = <TechnikListe t={technik} />;
    rechts = <TechnikPanel t={technik} />;
  } else if (bereich === 'datenbank') {
    liste = <LanglaeuferListe z={datenbank} offen={id} />;
    rechts = <DatenbankPanel z={datenbank} id={id} />;
  } else if (bereich === 'protokoll') {
    liste = <ProtokollListe p={protokoll} offen={id} />;
    rechts = <ProtokollDetail p={protokoll} nr={id} />;
  }

  return (
    <Dreiteilung ort="werkbank" ebene={id || bereich === 'demo' || bereich === 'technik' || bereich === 'betrieb' || bereich === 'verschluesselung' || bereich === 'texterkennung' || bereich === 'wartung' ? 'mappe' : 'liste'} offen={id}>
      <aside className="spalte sichten" aria-label="Bereiche">
        <h2 className="ueber">Werkbank</h2>
        <nav className="sichtliste">
          <Link to="/werkbank/typen" className={`sicht ${bereich === 'typen' ? 'an' : ''}`}><span className="nm">Mappentypen</span><span className="zahl">{d.typen.length}</span></Link>
          <Link to="/werkbank/sichten" className={`sicht ${bereich === 'sichten' ? 'an' : ''}`}><span className="nm">Sichten</span><span className="zahl">{d.sichten.length || ''}</span></Link>
          <Link to="/werkbank/benutzer" className={`sicht ${bereich === 'benutzer' ? 'an' : ''}`}><span className="nm">Benutzer</span><span className="zahl">{benutzer.geladen ? benutzer.liste.length : ''}</span></Link>
          <Link to="/werkbank/protokoll" className={`sicht ${bereich === 'protokoll' ? 'an' : ''}`}><span className="nm">Protokoll</span>{protokoll.debug?.an && <span className="zaehler" title="Debug-Modus ist an">Debug</span>}</Link>
          <Link to="/werkbank/designs" className={`sicht ${bereich === 'designs' ? 'an' : ''}`}><span className="nm">Designs</span><span className="zahl">{d.designs.length || ''}</span></Link>
          <Link to="/werkbank/betrieb" className={`sicht ${bereich === 'betrieb' ? 'an' : ''}`}><span className="nm">E-Mail und Adresse</span></Link>
          <Link to="/werkbank/verschluesselung" className={`sicht ${bereich === 'verschluesselung' ? 'an' : ''}`}><span className="nm">Verschlüsselung</span>{tresor.stand && tresor.stand.zustand !== 'vorhanden' && <span className="zaehler" title="Kein Schlüssel für Passwörter">fehlt</span>}</Link>
          <Link to="/werkbank/papierkorb" className={`sicht ${bereich === 'papierkorb' ? 'an' : ''}`}><span className="nm">Papierkorb</span><span className="zahl">{papierkorb.eintraege?.length || ''}</span></Link>
          <Link to="/werkbank/texterkennung" className={`sicht ${bereich === 'texterkennung' ? 'an' : ''}`}><span className="nm">Texterkennung</span></Link>
          <Link to="/werkbank/wartung" className={`sicht ${bereich === 'wartung' ? 'an' : ''}`}><span className="nm">Wartungsoperationen</span></Link>
          <Link to="/werkbank/datenbank" className={`sicht ${bereich === 'datenbank' ? 'an' : ''}`}><span className="nm">Datenbank</span></Link>
          <Link to="/werkbank/technik" className={`sicht ${bereich === 'technik' ? 'an' : ''}`}><span className="nm">Technik</span></Link>
          <Link to="/werkbank/demo" className={`sicht ${bereich === 'demo' ? 'an' : ''}`}><span className="nm">Demo-Daten</span><span className="zahl">{Object.values(d.zaehler.typen).reduce((a, z) => a + z.demo, 0) || ''}</span></Link>
        </nav>
        {/* Freiwillig, ohne Gebühren für beide Seiten (GitHub Sponsors von persönlichen Konten). */}
        <a className="unterstuetzen" href="https://github.com/sponsors/motom001" target="_blank" rel="noreferrer">
          <span aria-hidden="true">♥</span> Projekt unterstützen
          <span className="leise klein">freiwillig, Betrag frei wählbar</span>
        </a>
      </aside>
      <section className="spalte liste" aria-label="Elemente">{liste}</section>
      <section className="spalte mappe" aria-label="Bearbeitung">
        <Link to={`/werkbank/${bereich}`} className="verweis nur-schmal">← Zur Liste</Link>
        {rechts}
      </section>
    </Dreiteilung>
  );
}

function TypenListe({ offen }: { offen?: string }) {
  const d = useDaten();
  return (
    <>
      <div className="listenkopf">
        <div><h1>Mappentypen</h1><p className="leise klein">Welche Arten von Mappen es gibt, mit Feldern, Registern und Titel.</p></div>
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
                    <span className="titel">{t.name}{t.system && <span className="chip" title="Systemmappentyp: lässt sich erweitern, aber nicht löschen">System</span>}</span>
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
