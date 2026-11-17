import { useEffect, useState } from 'react';
import type { WhLauf } from './api/betrieb';
import { einrichtungApi, type WhAbgleich, type WhAbschluss, type WhSchritt } from './api/einrichtung';
import { t, tn } from './sprache';
import { HakenFeld, Knopf } from './bausteine';
import { Symbol, type SymbolName } from './Symbol';
import {
  AbgleichTabelle,
  SchluesselFormular,
  SicherungsListe,
  SicherungsOrdner,
  useWiederherstellung,
  zeit,
  type Wiederherstellung,
} from './wiederherstellung/teile';

/**
 * Wiederherstellen (#107): Assistent (Sicherung wählen, Abgleich, Schlüssel, Start) für das
 * frische System und die Werkbank, dazu der eigene Bildschirm mit Fortschritt und Abschlussmeldung.
 * Der Bildschirm übersteht ein Neuladen und den Neustart des DMS: Er fragt den Stand ab, bis die
 * Abschlussmeldung da ist.
 */
// Zeichen je Stand (#1215, D5): Symbole, wo es eines gibt; „offen“ und „ausgelassen“ bleiben ruhige Zeichen.
const ZEICHEN: Record<WhSchritt['status'], SymbolName | string> = {
  offen: '○',
  laeuft: 'stoppuhr',
  ok: 'haken',
  fehler: 'warnung',
  hinweis: 'info',
  ausgelassen: '–',
};
const SYMBOLE = new Set<string>(['stoppuhr', 'haken', 'warnung', 'info']);

export function Schritte({ schritte }: { schritte: WhSchritt[] }) {
  return (
    <ol className="schrittliste">
      {schritte.map((s) => (
        <li key={s.name} className={`schritt ${s.status}`}>
          <span className="zeichen" aria-hidden="true">
            {SYMBOLE.has(ZEICHEN[s.status]) ? <Symbol name={ZEICHEN[s.status] as SymbolName} /> : ZEICHEN[s.status]}
          </span>
          <span>
            <strong>{s.name}</strong>
            {s.info && <span className="leise klein"> – {s.info}</span>}
            <span className="sr"> ({s.status})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Eigener Bildschirm: Fortschritt jedes Schritts, Neustart, Abschlussmeldung → Anmeldung. */
export function Wiederherstellungsbildschirm({ fertig }: { fertig: () => void }) {
  const [lauf, setLauf] = useState<WhLauf | null>(null);
  const [abschluss, setAbschluss] = useState<WhAbschluss | null>(null);
  const [weg, setWeg] = useState(false);
  useEffect(() => {
    let aus = false;
    // Fehler fängt hole selbst ab (weg); der Takt bekommt kein Promise zurück (#1011).
    const hole = () => {
      void einrichtungApi.whStatus().then(
        (s) => {
          if (aus) return;
          setWeg(false);
          setLauf(s.lauf);
          setAbschluss(s.abschluss);
        },
        () => {
          if (!aus) setWeg(true);
        },
      );
    };
    hole();
    const timer = setInterval(hole, 1000);
    return () => {
      aus = true;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="kartenseite">
      <div className="karte breit" role="status" aria-live="polite">
        <h1>
          {abschluss && !lauf
            ? t('oberflaeche.wiederherstellen.wiederherstellung-abgeschlossen')
            : lauf?.status === 'fehler'
              ? t('oberflaeche.wiederherstellen.wiederherstellung-abgebrochen')
              : t('oberflaeche.wiederherstellen.wiederherstellung-laeuft')}
        </h1>
        {abschluss && !lauf
          ? abschlussMeldung(abschluss, fertig)
          : lauf?.status === 'fehler'
            ? abbruchMeldung(lauf, fertig)
            : laufMeldung(lauf, weg)}
      </div>
    </div>
  );
}

/** Sicherung wählen, Abgleich, Schlüssel, Start – auf dem frischen System und in der Werkbank. */
export function WiederherstellungsAssistent({
  frisch,
  gestartet,
  abbrechen,
}: {
  frisch: boolean;
  gestartet: () => void;
  abbrechen?: () => void;
}) {
  const w = useWiederherstellung(frisch, gestartet);
  const { fehler, abgleich } = w;
  return (
    <div className="stapel wiederherstellen">
      <SicherungsOrdner w={w} />
      {fehler && (
        <p className="fehlertext" role="alert">
          {fehler}
        </p>
      )}
      <SicherungsListe w={w} />

      {abgleich && <AbgleichAnsicht w={w} abgleich={abgleich} frisch={frisch} abbrechen={abbrechen} />}
      {!abgleich && abbrechen && (
        <div className="knoepfe">
          <Knopf art="link" onClick={abbrechen}>
            {t('oberflaeche.wiederherstellen.zurueck-2')}
          </Knopf>
        </div>
      )}
    </div>
  );
}

/** Nach dem Wählen: Abgleich, Probleme und Hinweise, Schlüssel, Bestätigung und Start. */
function AbgleichAnsicht({
  w,
  abgleich,
  frisch,
  abbrechen,
}: {
  w: Wiederherstellung;
  abgleich: WhAbgleich;
  frisch: boolean;
  abbrechen?: () => void;
}) {
  const { brauchtSchluessel, schluessel, verstanden, setVerstanden, startbar, laeuft, starten } = w;
  return (
    <>
      <h3 className="h3">{t('oberflaeche.wiederherstellen.abgleich-damals-heute')}</h3>
      {abgleich.vergleich.length > 0 && <AbgleichTabelle abgleich={abgleich} />}
      {abgleich.probleme.map((p) => (
        <div key={p} className="hinweis schlecht">
          <p>{p}</p>
        </div>
      ))}
      {abgleich.hinweise
        .filter((h) => !/Notfallblatt ein/.test(h) || brauchtSchluessel)
        .map((h) => (
          <div key={h} className="hinweis warn">
            <p>{h}</p>
          </div>
        ))}
      {(brauchtSchluessel || schluessel) && <SchluesselFormular w={w} abgleich={abgleich} />}
      {!frisch && (
        <HakenFeld beschriftung={t('oberflaeche.wiederherstellen.mir-ist-klar-der')}>
          <input type="checkbox" checked={verstanden} onChange={(e) => setVerstanden(e.target.checked)} />
        </HakenFeld>
      )}
      <div className="knoepfe">
        {/* Auf dem frischen System die Hauptaktion; in der Werkbank ersetzt sie den jetzigen Stand – Gefahr mit Rückfrage. */}
        {frisch ? (
          <Knopf art="haupt" gesperrt={!startbar} laeuft={laeuft} laeuftText={t('oberflaeche.wiederherstellen.starte')} onClick={starten}>
            {t('oberflaeche.wiederherstellen.wiederherstellen')}
          </Knopf>
        ) : (
          <Knopf
            art="gefahr"
            symbol="zuruecksetzen"
            gesperrt={!startbar}
            laeuft={laeuft}
            laeuftText={t('oberflaeche.wiederherstellen.starte')}
            onClick={starten}
            rueckfrage={{
              titel: t('oberflaeche.wiederherstellen.wirklich-wiederherstellen'),
              text: t('oberflaeche.wiederherstellen.der-jetzige-stand-von'),
              ja: t('oberflaeche.wiederherstellen.wiederherstellen'),
              bestaetigeMit: 'wiederherstellen',
            }}>
            {t('oberflaeche.wiederherstellen.wiederherstellen')}
          </Knopf>
        )}
        {abbrechen && (
          <Knopf art="link" onClick={abbrechen}>
            {t('oberflaeche.wiederherstellen.abbrechen')}
          </Knopf>
        )}
      </div>
    </>
  );
}

/** Abschlussmeldung (aufgerufen wie die anderen beiden, damit React die Elemente wie bisher weiterverwendet): welche Sicherung, die Schritte, Hinweise, weiter zur Anmeldung. */
function abschlussMeldung(abschluss: WhAbschluss, fertig: () => void) {
  return (
    <>
      <p>
        {tn('oberflaeche.wiederherstellen.die-sicherung-ist-eingespielt', {
          b: <strong>{abschluss.sicherung}</strong>,
          zeit: zeit(abschluss.am),
        })}
      </p>
      <Schritte schritte={abschluss.schritte} />
      {abschluss.hinweise.map((h) => (
        <div key={h} className="hinweis warn">
          <p>{h}</p>
        </div>
      ))}
      <div className="knoepfe">
        <Knopf art="haupt" onClick={() => einrichtungApi.whAbschlussGesehen().finally(fertig)}>
          {t('oberflaeche.wiederherstellen.weiter-zur-anmeldung')}
        </Knopf>
      </div>
    </>
  );
}

/** Abgebrochen: Fehler, der bisherige Stand bleibt, die Schritte, zurück. */
function abbruchMeldung(lauf: WhLauf, fertig: () => void) {
  return (
    <>
      <div className="hinweis schlecht">
        <p>
          <strong>{lauf.fehler}</strong>
        </p>
      </div>
      <p>{t('oberflaeche.wiederherstellen.der-bisherige-stand-ist')}</p>
      <Schritte schritte={lauf.schritte} />
      <div className="knoepfe">
        <Knopf onClick={fertig}>{t('oberflaeche.wiederherstellen.zurueck')}</Knopf>
      </div>
    </>
  );
}

/** Läuft noch: Fortschritt, Neustart, aktueller Schritt. */
function laufMeldung(lauf: WhLauf | null, weg: boolean) {
  const prozent = lauf && lauf.gesamt ? Math.min(100, Math.round((lauf.bytes / lauf.gesamt) * 100)) : null;
  const erledigt = lauf ? lauf.schritte.filter((s) => s.status === 'ok' || s.status === 'hinweis').length : 0;
  return (
    <>
      <p>{tn('oberflaeche.wiederherstellen.sicherung-bitte-lass-dieses', { b: <strong>{lauf?.sicherung ?? '…'}</strong> })}</p>
      <progress max={lauf?.schritte.length ?? 1} value={erledigt} />
      {weg || lauf?.status === 'neustart' ? (
        <p className="leise">{t('oberflaeche.wiederherstellen.ablago-startet-neu-gleich')}</p>
      ) : (
        prozent !== null && <p className="leise klein">{t('oberflaeche.wiederherstellen.aktueller-schritt', { prozent })}</p>
      )}
      {lauf && <Schritte schritte={lauf.schritte} />}
    </>
  );
}
