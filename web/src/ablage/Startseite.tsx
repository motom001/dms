import { useEffect, useRef, useState } from 'react';
import type { Anstehend } from '../../../shared/src/fristen';
import { api } from '../api';
import { useDaten } from '../daten';
import { useHandbuch, Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { titelOder } from '../seiten';
import { neuePost } from './NeuePost';

/**
 * Startseite der Ablage (#334): wenige Kacheln mit je einer Zahl und einer Handlung.
 * Zu erledigen, Neue Post, Anstehend, eine wählbare Kachel (Favoriten oder eine Ansicht) und
 * „Zuletzt geöffnet“. In einer leeren Installation stattdessen drei Einstiege.
 * Abschalten und Kachel wählen: im Profil (Einstellungen „startseite“, „startseite_kachel“).
 */
const zahl = (n: number) => n.toLocaleString('de-DE');

function Kachel({ to, art, titel, anzahl, leer, unter }: { to: string; art: 'auffaellig' | 'ruhig' | 'post'; titel: string; anzahl: number | null; leer: string; unter?: string }) {
  const nichts = anzahl === 0;
  return (
    <Link to={to} className={`kachel ${art} ${nichts ? 'erledigt' : ''}`}>
      <span className="kacheltitel">{titel}</span>
      {anzahl === null ? <span className="kachelzahl leise">…</span> : nichts ? <span className="kachelleer">✓ {leer}</span> : <span className="kachelzahl">{zahl(anzahl)}</span>}
      {unter && !nichts && <span className="kachelunter leise klein">{unter}</span>}
    </Link>
  );
}

export function Startseite({ anstehend, offen }: { anstehend: { liste?: { tage: number; eintraege: Anstehend[] } }; offen?: string }) {
  const d = useDaten();
  const { ich } = useKonto();
  const handbuch = useHandbuch();
  const [daten, setDaten] = useState<{ zuletzt: Array<{ id: string; typId: string; titel: string }>; leer: boolean } | null>(null);
  const datei = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let aktuell = true;
    api.startseite().then((x) => { if (aktuell) setDaten(x); }, () => { if (aktuell) setDaten({ zuletzt: [], leer: false }); });
    return () => { aktuell = false; };
  }, [d.stand]);

  const postSicht = d.zaehler.neuePost ? d.sicht(d.zaehler.neuePost) : undefined;
  const wahl = typeof d.einstellungen.startseite_kachel === 'string' ? d.einstellungen.startseite_kachel : 'favoriten';
  const lieblings = wahl !== 'favoriten' ? d.sicht(wahl) : undefined;
  const tage = anstehend.liste?.tage;

  return (
    <>
      <div className="listenkopf">
        <div>
          <h1>Start</h1>
          <p className="leise klein">Hallo {ich.name?.split(/\s+/)[0] || ich.email}! Hier fängst du an. <Hilfe ort="ablage.start" /></p>
        </div>
      </div>
      <div className="listenrumpf startseite">
        {daten?.leer ? (
          <div className="einstiege">
            <p>Noch ist die Ablage leer. So geht es los:</p>
            <button type="button" className="kachel post" onClick={() => datei.current?.click()}>
              <span className="kacheltitel">Erste Post ablegen</span><span className="kachelunter">Brief scannen oder fotografieren, Datei wählen – daraus wird eine Post</span>
            </button>
            <input ref={datei} type="file" multiple hidden accept="application/pdf,image/*" onChange={(e) => { neuePost([...(e.target.files ?? [])]); e.target.value = ''; }} />
            {ich.rolle === 'admin' && (
              <Link to="/werkbank/pakete" className="kachel ruhig">
                <span className="kacheltitel">Paket Haushalt installieren</span><span className="kachelunter">Fertige Mappentypen für Konten, Verträge, Versicherungen und mehr – mit Beispielen</span>
              </Link>
            )}
            <a href={handbuch('benutzer', 'erste-schritte/')} target="_blank" rel="noreferrer" className="kachel ruhig">
              <span className="kacheltitel">Hilfe: so fängst du an</span><span className="kachelunter">Die ersten Schritte im Benutzerhandbuch</span>
            </a>
          </div>
        ) : (
          <div className="kacheln">
            <Kachel to="/ablage/eingang" art="auffaellig" titel="Zu erledigen" anzahl={d.zaehler.eingang} leer="Nichts zu erledigen" unter="Aufgaben und Mappen, an denen du etwas tun sollst" />
            {postSicht && <Kachel to={`/ablage/${postSicht.id}`} art="post" titel={postSicht.name} anzahl={d.zaehler.sichten?.[postSicht.id] ?? 0} leer="Keine neue Post" unter="Noch nicht zugeordnet" />}
            <Kachel to="/ablage/anstehend" art="ruhig" titel="Anstehend" anzahl={anstehend.liste ? anstehend.liste.eintraege.length : null} leer={`Nichts in den nächsten ${tage ?? 30} Tagen`} unter={tage ? `Fristen und Erinnerungen der nächsten ${tage} Tage` : undefined} />
            {lieblings
              ? <Kachel to={`/ablage/${lieblings.id}`} art="ruhig" titel={lieblings.name} anzahl={d.zaehler.sichten?.[lieblings.id] ?? 0} leer="Leer" />
              : <Kachel to="/ablage/favoriten" art="ruhig" titel="Favoriten" anzahl={d.zaehler.favoriten ?? 0} leer="Noch keine – ★ an einer Mappe merkt sie dir" />}
          </div>
        )}
        {daten && daten.zuletzt.length > 0 && (
          <section className="zuletzt">
            <h2 className="h3">Zuletzt geöffnet</h2>
            <ul className="mappenliste">
              {daten.zuletzt.map((m) => (
                <li key={m.id}>
                  <Link to={`/ablage/start/${m.id}`} className={`eintrag ${offen === m.id ? 'an' : ''}`}>
                    <span className="titel">{titelOder(m.titel)}</span>
                    <span className="unter">{d.typ(m.typId)?.name ?? ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
