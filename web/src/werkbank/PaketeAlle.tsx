import { useCallback, useEffect, useMemo, useState } from 'react';
import { Knopf, KnopfLink } from '../bausteine';
import { aktualisierungsRunde, haengenAn, type RundenEintrag } from '../../../shared/src/pakete';
import { paketeApi, type PaketVorschau } from '../api/pakete';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { geheZu, Link } from '../ort';
import { t } from '../sprache';
import { Kopf } from './Kopf';
import { alsMeldung, sicherungVorher, VorschauBlock, type Meldung, type VorschauAntwort } from './PaketVorschau';
import type { PaketeZustand } from './Pakete';

/**
 * „Alle aktualisieren“ (#1168): alle Pakete mit neuerer Version in einem Rutsch – eine gemeinsame Vorschau, Reihenfolge
 * aus den Abhängigkeiten (erst das, wovon andere abhängen; Ergänzungen nach dem Hauptpaket), Fortschritt je Paket und
 * am Ende eine Zusammenfassung. Aufgeklappt ist nur, was eine Entscheidung braucht (neue Rechte, Umbau, Herausgeber neu,
 * Herkunft, Namenskonflikt); dieselben Bestätigungen wie beim einzelnen Update bleiben Pflicht. Scheitert ein Paket,
 * laufen die übrigen weiter – nur die, die davon abhängen, fallen weg.
 */

type Eintrag = RundenEintrag<PaketVorschau>;
type Lauf = { zustand: 'wartet' | 'laeuft' | 'fertig' | 'fehler' | 'ausgelassen'; text?: string; gruende?: string[] };
/** Zustand ohne eigenen Text (fertig, Fehler und ausgelassen bringen ihren mit). */
const ZUSTAND: Record<Lauf['zustand'], () => string> = { wartet: () => t('werkbank.pakete.alle.wartet'), laeuft: () => t('werkbank.pakete.alle.laeuft'), fertig: () => '', fehler: () => '', ausgelassen: () => '' };
/** Warnung für Pakete außerhalb des offiziellen Katalogs – wie beim einzelnen Update. */
const warnung = (e: Eintrag) => (e.fremd ? t('werkbank.pakete.aus-dem-katalog', { wert: e.u.quelle }) : null);

export function AlleAktualisieren({ z }: { z: PaketeZustand }) {
  const d = useDaten();
  const [geladen, setGeladen] = useState<Eintrag[] | null>(null);
  const [antworten, setAntworten] = useState<Record<string, VorschauAntwort | null>>({});
  const [lauf, setLauf] = useState<Record<string, Lauf> | null>(null);
  const [fertig, setFertig] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>();
  const katalogUrl = z.stand?.katalogUrl ?? '';
  // Die Runde steht fest, sobald sie anfängt: Updates während der Runde ändern die Liste nicht mehr.
  const [updates] = useState(() => z.updates);
  useEffect(() => {
    if (!z.stand) return;
    let aktuell = true;
    void Promise.all(updates.map((u) => paketeApi.paketVorschau({ id: u.id, version: u.neu, quelle: u.quelle === katalogUrl ? undefined : u.quelle })
      .then((v) => ({ u, v, fehler: null }), (e: unknown) => ({ u, v: null, fehler: (e as Error).message }))))
      .then((l) => { if (aktuell) setGeladen(aktualisierungsRunde(l, (q) => q === katalogUrl)); });
    return () => { aktuell = false; };
  }, [updates, katalogUrl, z.stand]);
  const reihe = geladen ?? [];
  const moeglich = reihe.filter((e) => e.v && !e.probleme.length);
  // Je Paket eine feste Rückmeldung für den Block – sonst meldet er bei jedem Zeichnen.
  const ids = moeglich.map((e) => e.u.id).join('\n');
  const melder = useMemo(() => Object.fromEntries(ids.split('\n').map((id) => [id, (x: VorschauAntwort | null) => setAntworten((a) => ({ ...a, [id]: x }))])), [ids]);
  const offen = moeglich.filter((e) => !antworten[e.u.id]);

  const los = useCallback(async () => {
    setMeldung(undefined);
    const stand: Record<string, Lauf> = Object.fromEntries(moeglich.map((e) => [e.u.id, { zustand: 'wartet' as const }]));
    const zeige = () => setLauf({ ...stand });
    zeige();
    // „Vorher sichern“ (#702) einmal für alle Umbauten; scheitert die Sicherung, läuft nichts.
    if (moeglich.some((e) => antworten[e.u.id]?.sichern)) {
      const f = await sicherungVorher();
      if (f) { setMeldung({ art: 'schlecht', text: f }); setLauf(null); return; }
    }
    const gescheitert: string[] = [];
    for (const e of moeglich) {
      // Hängt es an einem gescheiterten Paket (#646), fällt es weg – die übrigen laufen weiter.
      const an = haengenAn(moeglich, gescheitert).get(e.id);
      if (an) { stand[e.u.id] = { zustand: 'ausgelassen', text: t('werkbank.pakete.alle.braucht', { name: moeglich.find((x) => x.id === an)?.u.name ?? an }) }; zeige(); continue; }
      stand[e.u.id] = { zustand: 'laeuft' }; zeige();
      const x = antworten[e.u.id];
      try {
        const r = await paketeApi.paketAktualisieren(e.u.id, e.u.neu, x?.bestaetigt, x?.rechteBestaetigt, { automatisierungen: x?.automatisierungen, herausgeberBestaetigt: x?.herausgeberBestaetigt, umbauBestaetigt: x?.umbauBestaetigt, umbauEntscheidungen: x?.umbauEntscheidungen, sichtenErsetzen: x?.sichtenErsetzen });
        stand[e.u.id] = { zustand: 'fertig', text: t('werkbank.pakete.alle.fertig', { version: r.version }) };
      } catch (f) {
        const m = alsMeldung(f);
        gescheitert.push(e.id);
        stand[e.u.id] = { zustand: 'fehler', text: m.text, gruende: m.gruende };
      }
      zeige();
    }
    await z.laden(); await d.neuLaden();
    setFertig(true);
  }, [moeglich, antworten, z, d]);

  if (!z.stand || !updates.length) return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.pakete.alle.titel')} ueber={t('werkbank.pakete.pakete')} hilfe="werkbank.pakete.alle" />
      <p className="leise">{!z.kataloge ? t('werkbank.pakete.alle.erst-suchen') : t('werkbank.pakete.alle.nichts')}</p>
      <div className="knoepfe"><KnopfLink to="/werkbank/pakete">{t('werkbank.pakete.alle.zurueck')}</KnopfLink></div>
    </div>
  );
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.pakete.alle.titel')} ueber={t('werkbank.pakete.pakete')} hilfe="werkbank.pakete.alle">
        <p className="leise">{t('werkbank.pakete.alle.text')}</p>
      </Kopf>
      {meldung && <div className="hinweis schlecht" role="alert"><p>{meldung.text}</p></div>}
      {!geladen ? <p className="leise">{t('werkbank.pakete.alle.lade', { anzahl: updates.length })}</p>
        : lauf ? <Fortschritt reihe={moeglich} lauf={lauf} fertig={fertig} />
        : <Vorschauen reihe={reihe} melder={melder} offen={offen.length} los={los} />}
    </div>
  );
}

/** Die gemeinsame Vorschau: Reihenfolge, was entschieden werden muss (aufgeklappt), der Rest zusammengefasst. */
function Vorschauen({ reihe, melder, offen, los }: { reihe: Eintrag[]; melder: Record<string, (x: VorschauAntwort | null) => void>; offen: number; los(): Promise<void> }) {
  const nicht = reihe.filter((e) => !e.v || e.probleme.length);
  const moeglich = reihe.filter((e) => e.v && !e.probleme.length);
  const entscheiden = moeglich.filter((e) => e.entscheiden);
  const rest = moeglich.filter((e) => !e.entscheiden);
  return (
    <div className="stapel">
      <section className="blatt stapel" aria-label={t('werkbank.pakete.alle.reihenfolge')}>
        <h2 className="h3">{t('werkbank.pakete.alle.reihenfolge')}</h2>
        <ol className="klein">{moeglich.map((e) => <li key={e.u.id}><strong>{e.u.name}</strong> {e.u.installiert} → {e.u.neu}{e.entscheiden && <span className="leise"> · {t('werkbank.pakete.alle.entscheidung')}</span>}</li>)}</ol>
        {nicht.length > 0 && (
          <div className="hinweis warn stapel" role="status">
            <p><strong>{t('werkbank.pakete.alle.nicht-moeglich')}</strong></p>
            <ul>{nicht.map((e) => <li key={e.u.id}><Link to={`/werkbank/pakete/${e.u.id}`} className="verweis">{e.u.name}</Link> {e.u.neu}: {e.fehler ?? e.probleme.join(' ')}</li>)}</ul>
          </div>
        )}
      </section>
      {entscheiden.map((e) => (
        <section key={e.u.id} aria-label={e.u.name}>
          <VorschauBlock v={e.v!} titel={t('werkbank.pakete.alle.paket', { name: e.u.name, version: e.u.neu })} warnung={warnung(e)} ohne={e.geloest} melde={melder[e.u.id]} />
        </section>
      ))}
      {rest.length > 0 && (
        <section className="stapel" aria-label={t('werkbank.pakete.alle.ohne-entscheidung')}>
          <h2 className="h3">{t('werkbank.pakete.alle.ohne-entscheidung')}</h2>
          <p className="leise klein">{t('werkbank.pakete.alle.ohne-text')}</p>
          {rest.map((e) => (
            <details key={e.u.id} className="blatt">
              <summary><strong>{e.u.name}</strong> {e.u.installiert} → {e.u.neu}</summary>
              <VorschauBlock v={e.v!} warnung={warnung(e)} ohne={e.geloest} melde={melder[e.u.id]} />
            </details>
          ))}
        </section>
      )}
      <div className="knoepfe">
        <Knopf art="haupt" gesperrt={!moeglich.length || (offen > 0 && t('werkbank.pakete.alle.offen', { anzahl: offen }))} onClick={los}>{t('werkbank.pakete.alle-aktualisieren', { anzahl: moeglich.length })}</Knopf>
        <KnopfLink to="/werkbank/pakete">{t('werkbank.pakete.abbrechen')}</KnopfLink>
      </div>
      <p className="leise klein">{t('werkbank.pakete.alle.einzeln')} <Hilfe ort="werkbank.pakete.alle" /></p>
    </div>
  );
}

/** Fortschritt je Paket, am Ende die Zusammenfassung mit dem Weg zurück. */
function Fortschritt({ reihe, lauf, fertig }: { reihe: Eintrag[]; lauf: Record<string, Lauf>; fertig: boolean }) {
  const n = (z: Lauf['zustand']) => reihe.filter((e) => lauf[e.u.id]?.zustand === z).length;
  return (
    <div className="stapel">
      <ol className="stapel klein" aria-label={t('werkbank.pakete.alle.fortschritt')}>
        {reihe.map((e) => {
          const l = lauf[e.u.id] ?? { zustand: 'wartet' };
          return (
            <li key={e.u.id} data-zustand={l.zustand}>
              <strong>{e.u.name}</strong> {e.u.installiert} → {e.u.neu}: <span className={l.zustand === 'fehler' ? 'fehlertext' : l.zustand === 'fertig' ? undefined : 'leise'}>{l.text ?? ZUSTAND[l.zustand]()}</span>
              {!!l.gruende?.length && <ul>{l.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}
            </li>
          );
        })}
      </ol>
      {fertig && (
        <div className={`hinweis stapel ${n('fehler') || n('ausgelassen') ? 'warn' : 'gut'}`} role="status">
          <p><strong>{t('werkbank.pakete.alle.summe', { anzahl: n('fertig') })}</strong>{n('fehler') > 0 && ` ${t('werkbank.pakete.alle.summe-fehler', { anzahl: n('fehler') })}`}{n('ausgelassen') > 0 && ` ${t('werkbank.pakete.alle.summe-ausgelassen', { anzahl: n('ausgelassen') })}`}</p>
          {n('fehler') + n('ausgelassen') > 0 && <p>{t('werkbank.pakete.alle.summe-einzeln')}</p>}
        </div>
      )}
      {fertig && <div className="knoepfe"><Knopf art="haupt" onClick={() => geheZu('/werkbank/pakete')}>{t('werkbank.pakete.alle.weiter')}</Knopf></div>}
    </div>
  );
}
