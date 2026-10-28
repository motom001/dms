import type { ReactNode } from 'react';
import { istOk } from '../../../shared/src/model';
import { useDaten } from '../daten';
import { TypEditor } from '../einrichtung/Einrichtung';
import { Link } from '../ort';
import { BenutzerDetail, BenutzerListe, BenutzerNeu, useBenutzer } from './Benutzer';
import { DemoListe, DemoPanel } from './Demo';

/**
 * Werkbank für Administratoren, aufgebaut wie die Ablage:
 *   Bereiche  →  Elemente des Bereichs  →  Bearbeitung
 *
 * /werkbank/typen[/:id|/neu]
 * /werkbank/benutzer[/:id|/neu]
 * /werkbank/demo
 */
export function Werkbank({ teile }: { teile: string[] }) {
  const d = useDaten();
  const [, bereich = 'typen', id] = teile;
  const benutzer = useBenutzer();

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
  }

  return (
    <div className="drei" data-ebene={id || bereich === 'demo' ? 'mappe' : 'liste'}>
      <aside className="spalte sichten" aria-label="Bereiche">
        <h2 className="ueber">Werkbank</h2>
        <nav className="sichtliste">
          <Link to="/werkbank/typen" className={`sicht ${bereich === 'typen' ? 'an' : ''}`}><span className="nm">Mappentypen</span><span className="zahl">{d.typen.length}</span></Link>
          <Link to="/werkbank/benutzer" className={`sicht ${bereich === 'benutzer' ? 'an' : ''}`}><span className="nm">Benutzer</span><span className="zahl">{benutzer.geladen ? benutzer.liste.length : ''}</span></Link>
          <Link to="/werkbank/demo" className={`sicht ${bereich === 'demo' ? 'an' : ''}`}><span className="nm">Demo-Daten</span><span className="zahl">{d.mappen.filter((m) => m.demo).length || ''}</span></Link>
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
    </div>
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
              const mappen = d.mappenVon(t.id);
              const unpassend = mappen.filter((m) => !istOk(d.pruefe(t, m.werte, m.id))).length;
              return (
                <li key={t.id}>
                  <Link to={`/werkbank/typen/${t.id}`} className={`eintrag werk ${offen === t.id ? 'an' : ''}`}>
                    <span className="titel">{t.name}</span>
                    <span className="unter">{t.felder.length} Felder · {t.register.length} Register · {mappen.length} Mappen</span>
                    {unpassend > 0 && <span className="problem">{unpassend} passen nicht zur Definition</span>}
                  </Link>
                </li>
              );
            })}
          </ul>}
    </>
  );
}
