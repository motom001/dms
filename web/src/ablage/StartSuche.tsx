import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Mappe } from '../../../shared/src/model';
import { gruppiereTreffer, suchWoerter } from '../../../shared/src/schnellsuche';
import { api, type Bezuege } from '../api';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';

/**
 * Suchfeld der Startseite (#497): sucht sofort über alle Mappen, die man lesen darf (Titel und
 * Feldwerte wie die Schnellsuche der Ansichten, auf Wunsch auch in Dokumenten). Treffer nach
 * Mappentyp gruppiert, Titeltreffer zuerst, je Treffer das passende Feld („Vertragsnummer: KV-123456“).
 * Eine Archivnummer mit Enter springt wie in den Ansichten zum Dokument (#345).
 */

const MAX = 60;

/** Text mit hervorgehobenen Suchwörtern. */
function Hervor({ text, woerter }: { text: string; woerter: string[] }) {
  const kurz = text.length > 120 ? `${text.slice(0, 117)} …` : text;
  if (!woerter.length) return <>{kurz}</>;
  const muster = new RegExp(`(${woerter.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{kurz.split(muster).map((t, i) => (i % 2 ? <mark key={i} className="ss-mark">{t}</mark> : t))}</>;
}

/** `sonst`: was ohne Suchbegriff darunter steht (Kacheln, zuletzt geöffnet). */
export function StartSuche({ sonst, ohneSuche = false }: { sonst?: ReactNode; ohneSuche?: boolean }) {
  const d = useDaten();
  const [eingabe, setEingabe] = useState('');
  const [volltext, setVolltext] = useState(false);
  const [stand, setStand] = useState<{ such: string; gesamt: number; mappen: Mappe[]; bezuege: Bezuege } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const nr = useRef(0);
  const such = eingabe.trim();

  useEffect(() => {
    if (such.length < 2) { setStand(null); setLaeuft(false); return; }
    const meine = ++nr.current;
    setLaeuft(true);
    const t = setTimeout(() => {
      api.seite('suche', 0, MAX, such, null, volltext, false, '')
        .then((s) => { if (meine === nr.current) { setStand({ such, gesamt: s.gesamt, mappen: s.mappen.filter((m) => !m.verborgen), bezuege: s.bezuege }); setFehler(undefined); } })
        .catch((e) => { if (meine === nr.current) setFehler((e as Error).message); })
        .finally(() => { if (meine === nr.current) setLaeuft(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [such, volltext]);

  const woerter = useMemo(() => suchWoerter(stand?.such ?? ''), [stand?.such]);
  const gruppen = useMemo(() => (stand ? gruppiereTreffer(stand.mappen, d.typ, woerter, (id) => titelOder(stand.bezuege[id]?.titel)) : []), [stand, woerter, d]);

  // Leere Ablage: erst die Einstiege, ohne Suchfeld.
  if (ohneSuche) return <>{sonst}</>;

  async function absenden() {
    // Archivnummer (#345): springt zum Dokument; sonst bleibt es bei der Trefferliste.
    if (!such || /\s/.test(such) || !/\d/.test(such) || such.length > 50) return;
    try {
      const r = await api.archivnummer(such);
      geheZu(`/ablage/${r.typId}/${r.mappeId}?register=${encodeURIComponent(r.dokument.registerKey)}&dokument=${r.dokument.id}`);
    } catch { /* keine Archivnummer */ }
  }

  return (
    <section className="ss-suche" aria-label="Schnell finden">
      <form role="search" onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); void absenden(); }}>
        <label className="sr-only" htmlFor="ss-feld">Alle Mappen durchsuchen</label>
        <input id="ss-feld" className="ss-feld" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
          placeholder="Suchen – Name, Nummer, Kennzeichen …" value={eingabe} onChange={(e) => setEingabe(e.target.value)} />
        <label className="haken klein ss-volltext"><input type="checkbox" checked={volltext} onChange={(e) => setVolltext(e.target.checked)} /><span>auch in Dokumenten</span></label>
      </form>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {such.length > 0 && such.length < 2 && <p className="leise klein">Noch ein Zeichen …</p>}
      {stand && (
        <div className="ss-treffer" aria-live="polite" aria-busy={laeuft}>
          <p className="leise klein">{stand.gesamt === 0 ? `Nichts gefunden für „${stand.such}“.` : stand.gesamt === 1 ? 'Ein Treffer' : `${stand.gesamt} Treffer${stand.gesamt > stand.mappen.length ? ` – die ersten ${stand.mappen.length}; genauer suchen oder die ` : ''}`}
            {stand.gesamt > stand.mappen.length && <Link to="/ablage/suche" className="verweis">Erweiterte Suche</Link>}{laeuft ? ' · suche …' : ''}</p>
          {gruppen.map((g) => (
            <div key={g.typId} className="ss-gruppe">
              <h2 className="ueber">{g.name} <span className="anzahl">{g.treffer.length}</span></h2>
              <ul className="mappenliste">
                {g.treffer.map((t) => (
                  <li key={t.m.id}>
                    <Link to={`/ablage/start/${t.m.id}`} className="eintrag">
                      <span className="titel"><Hervor text={titelOder(t.m.titel)} woerter={woerter} /></span>
                      {t.grund && !t.titelTreffer && <span className="unter">{t.grund.feld}: <Hervor text={t.grund.wert} woerter={woerter} /></span>}
                      {t.grund && t.titelTreffer && t.grund.wert !== t.m.titel && <span className="unter leise">{t.grund.feld}: <Hervor text={t.grund.wert} woerter={woerter} /></span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {such.length < 2 && sonst}
    </section>
  );
}
