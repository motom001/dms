import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Ausschnitt, Mappe } from '../../../shared/src/model';
import { typName } from '../../../shared/src/beschriftung';
import { gruppiereTreffer, suchWoerter } from '../../../shared/src/schnellsuche';
import { api, type AehnlicheMappe, type Bezuege, type Unscharf } from '../api';
import { UnscharfHinweis } from './Unscharf';
import { AehnlichChip } from './Aehnlich';
import { t } from '../sprache';
import { useDaten } from '../daten';
import { geheZu, Link } from '../ort';
import { titelOder } from '../seiten';
import { Ehemalig } from '../Person';

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
  return <>{kurz.split(muster).map((text2, i) => (i % 2 ? <mark key={i} className="ss-mark">{text2}</mark> : text2))}</>;
}

/** `sonst`: was ohne Suchbegriff darunter steht (Kacheln, zuletzt geöffnet). */
export function StartSuche({ sonst, ohneSuche = false }: { sonst?: ReactNode; ohneSuche?: boolean }) {
  const d = useDaten();
  const [eingabe, setEingabe] = useState('');
  const [volltext, setVolltext] = useState(false);
  const [stand, setStand] = useState<{ such: string; gesamt: number; mappen: Mappe[]; bezuege: Bezuege; aehnlich: AehnlicheMappe[]; unscharf: Unscharf | null; ausschnitte: Record<string, Ausschnitt> } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const nr = useRef(0);
  const such = eingabe.trim();

  useEffect(() => {
    if (such.length < 2) { setStand(null); setLaeuft(false); return; }
    const meine = ++nr.current;
    setLaeuft(true);
    const timer = setTimeout(() => {
      api.seite('suche', 0, MAX, such, null, volltext, false, '')
        .then((s) => { if (meine === nr.current) { setStand({ such, gesamt: s.gesamt, mappen: s.mappen.filter((m) => !m.verborgen), bezuege: s.bezuege, aehnlich: s.aehnlich ?? [], unscharf: s.unscharf ?? null, ausschnitte: s.ausschnitte ?? {} }); setFehler(undefined); } })
        .catch((e) => { if (meine === nr.current) setFehler((e as Error).message); })
        .finally(() => { if (meine === nr.current) setLaeuft(false); });
    }, 200);
    return () => clearTimeout(timer);
  }, [such, volltext]);

  // Unscharfe Suche (#356): auch die ähnlichen Wörter hervorheben, mit denen gefunden wurde.
  const woerter = useMemo(() => [...suchWoerter(stand?.such ?? ''), ...Object.values(stand?.unscharf?.begriffe ?? {}).flat()], [stand?.such, stand?.unscharf]);
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
    <section className="ss-suche" aria-label={t('ablage.startsuche.schnell-finden')}>
      <form role="search" data-anker="startseite.suche" onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); void absenden(); }}>
        <label className="sr" htmlFor="ss-feld">{t('ablage.startsuche.alle-mappen-durchsuchen')}</label>
        <input id="ss-feld" className="ss-feld" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
          placeholder={t('ablage.startsuche.suchen-name-nummer-kennzeichen')} value={eingabe} onChange={(e) => setEingabe(e.target.value)} />
        <label className="haken klein ss-volltext"><input type="checkbox" checked={volltext} onChange={(e) => setVolltext(e.target.checked)} /><span>{t('ablage.startsuche.auch-in-dokumenten')}</span></label>
      </form>
      {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
      {such.length > 0 && such.length < 2 && <p className="leise klein">{t('ablage.startsuche.noch-ein-zeichen')}</p>}
      {stand && (
        <div className="ss-treffer" aria-live="polite" aria-busy={laeuft}>
          {stand.unscharf && <UnscharfHinweis u={stand.unscharf} suchen={setEingabe} />}
          <p className="leise klein">{stand.gesamt === 0 && !stand.aehnlich.length ? t('ablage.startsuche.nichts-gefunden-fuer', { such: stand.such }) : stand.gesamt === 0 ? '' : t('ablage.startsuche.treffer', { anzahl: stand.gesamt, wert: stand.gesamt > stand.mappen.length ? t('ablage.startsuche.die-ersten-genauer-suchen', { mappen: stand.mappen.length }) : '' })}
            {stand.gesamt > stand.mappen.length && <Link to="/ablage/suche" className="verweis">{t('ablage.startsuche.erweiterte-suche')}</Link>}{laeuft ? t('ablage.startsuche.suche') : ''}</p>
          {gruppen.map((g) => (
            <div key={g.typId} className="ss-gruppe">
              <h2 className="ueber">{g.name} <span className="anzahl">{g.treffer.length}</span></h2>
              <ul className="mappenliste">
                {g.treffer.map((suchtreffer) => (
                  <li key={suchtreffer.m.id}>
                    <Link to={`/ablage/start/${suchtreffer.m.id}`} className="eintrag">
                      <span className="titel"><Ehemalig id={suchtreffer.m.id}><Hervor text={titelOder(suchtreffer.m.titel)} woerter={woerter} /></Ehemalig></span>
                      {suchtreffer.grund && !suchtreffer.titelTreffer && <span className="unter">{suchtreffer.grund.feld}: <Hervor text={suchtreffer.grund.wert} woerter={woerter} /></span>}
                      {suchtreffer.grund && suchtreffer.titelTreffer && suchtreffer.grund.wert !== suchtreffer.m.titel && <span className="unter leise">{suchtreffer.grund.feld}: <Hervor text={suchtreffer.grund.wert} woerter={woerter} /></span>}
                      {/* Teile (#1031): gefunden in einem Teil dieser Mappe, etwa einer Rechnungsposition. */}
                      {!suchtreffer.grund && <TeilFund a={stand.ausschnitte[suchtreffer.m.id]} woerter={woerter} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {/* Ähnliche Treffer (#442): ohne Wort-Treffer, aber mit einem ähnlichen Dokument – gekennzeichnet. */}
          {stand.aehnlich.length > 0 && (
            <div className="ss-gruppe">
              <h2 className="ueber">{t('aehnlich.gruppe')} <span className="anzahl">{stand.aehnlich.length}</span></h2>
              <ul className="mappenliste">
                {stand.aehnlich.map((a) => (
                  <li key={a.id}>
                    <Link to={`/ablage/start/${a.id}`} className="eintrag">
                      <span className="titel">{titelOder(a.titel)} <AehnlichChip a={a} /></span>
                      <span className="unter leise">{t('aehnlich.eintrag', { dokument: a.dokument.name, prozent: Math.round(Math.max(0, a.aehnlichkeit) * 100) })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {such.length < 2 && sonst}
    </section>
  );
}

/** „gefunden in Rechnungsposition „3. Bohrmaschine““ (#1031) unter einem Treffer, den die Suche über einen Teil fand. */
function TeilFund({ a, woerter }: { a?: Ausschnitt; woerter: string[] }) {
  const d = useDaten();
  if (!a?.teil) return null;
  const typ = d.typ(a.teil.typId);
  return <span className="unter leise"><Hervor text={t('ablage.teile.gefunden-in', { typ: typ ? typName(typ) : '…', titel: titelOder(a.teil.titel) })} woerter={woerter} /></span>;
}
