import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { HANDBUCH_VERWEIS, oeffneTyp, OEFFNE_SEITEN, type Rundgang, type RundgangSchritt } from '../../../shared/src/entdecken';
import type { Handbuch } from '../../../shared/src/hilfe';
import { useHandbuch } from '../Hilfe';
import { kontoApi } from '../api/konto';
import { geheZu } from '../ort';
import { t } from '../sprache';
import { Knopf } from '../bausteine';
import { Symbol } from '../Symbol';
import { DreiteilungBild } from './Bild';
import { beendeRundgang, findeAnker, istSchmal, useAktiverRundgang, warteAufAnker, wenigBewegung } from './stand';

/**
 * Rundgang (#831): zeigt Schritt für Schritt Stellen an der echten Oberfläche.
 *
 * - Ein modaler Dialog (`<dialog>`): Die Seite darunter lässt sich währenddessen nicht bedienen – nichts geht
 *   versehentlich kaputt. Tab bleibt im Dialog, Esc heißt „Später“, danach kehrt der Fokus dorthin zurück, wo er war.
 * - Das Ziel eines Schritts ist ein Anker (`data-anker`). Ein Rahmen hebt es hervor, der Rest wird abgedunkelt. Für
 *   Screenreader sagt jeder Schritt in Worten, wo die Stelle ist („ort“); Schritt, Titel und Text werden vorgelesen.
 * - Fehlt ein Ziel (z. B. am Handy ausgeblendet), fällt der Schritt still weg – nur ein Vermerk in der Konsole.
 * - Mit „Bewegung reduzieren“ springt alles ohne Übergang.
 * - Rundgänge aus Paketen (#831) öffnen vorher die erste Mappe eines Typs, die die Person lesen darf, oder ein leeres
 *   Formular (`oeffne.neu`) – gespeichert wird dabei nichts; am Ende geht es zurück, wo die Person war. Gibt es nichts
 *   zu öffnen, steht statt der Schritte der Ersatztext.
 */
export function RundgangAnzeige() {
  const aktiv = useAktiverRundgang();
  if (!aktiv) return null;
  return (
    <Fuehrung
      key={`${aktiv.rundgang.herkunft}:${aktiv.rundgang.schluessel}:${aktiv.probe ? 'probe' : ''}`}
      rundgang={aktiv.rundgang}
      vonSelbst={aktiv.vonSelbst}
      probe={aktiv.probe}
    />
  );
}

interface Ziel {
  schritt: RundgangSchritt;
  anker: string | null;
}

function Fuehrung({ rundgang, vonSelbst, probe }: { rundgang: Rundgang; vonSelbst: boolean; probe?: { pfad: string | null } }) {
  const ref = useRef<HTMLDialogElement>(null);
  const weiterKnopf = useRef<HTMLButtonElement>(null);
  const vorher = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  const id = useId();
  const [schmal, setSchmal] = useState(istSchmal);
  const [schritte, setSchritte] = useState<Ziel[] | null>(null);
  const [nr, setNr] = useState(0);
  const [rechteck, setRechteck] = useState<DOMRect | null>(null);
  const karteRef = useRef<HTMLDivElement>(null);
  // Leeres Formular (`oeffne.neu`): danach zurück, wo die Person war – angelegt wird nichts.
  const zurueckNach = useRef<string | null>(null);

  // Seite öffnen, dann prüfen, welche Ziele es gibt; Schritte ohne sichtbares Ziel fallen weg.
  useEffect(() => {
    let aus = false;
    void (async () => {
      const vorher = await oeffneVorher(rundgang, probe);
      if (aus) return;
      // Nichts zu öffnen: statt der Schritte ein Satz (`ersatz`).
      if (vorher === 'ersatz') {
        setSchritte([
          {
            schritt: {
              schluessel: 'ersatz',
              ziel: [],
              fuer: 'lesen',
              titel: rundgang.titel,
              text: rundgang.ersatz ?? t('entdecken.fuehrung.ersatz'),
            },
            anker: null,
          },
        ]);
        return;
      }
      zurueckNach.current = vorher;
      const liste: Ziel[] = [];
      for (const s of rundgang.schritte) {
        if (!s.ziel.length) {
          liste.push({ schritt: s, anker: null });
          continue;
        }
        const z = await warteAufAnker(s.ziel, liste.length ? 600 : 2500);
        if (z) liste.push({ schritt: s, anker: z.anker });
        else
          console.debug(
            `Rundgang „${rundgang.schluessel}“: Schritt „${s.schluessel}“ übersprungen – kein Ziel sichtbar (${s.ziel.join(', ')}).`,
          );
      }
      if (aus) return;
      if (!liste.length) {
        beendeRundgang(null);
        return;
      }
      setSchritte(liste);
    })();
    return () => {
      aus = true;
    };
  }, [rundgang, probe]);

  // Dialog öffnen; beim Schließen den Fokus zurückgeben.
  useEffect(() => {
    if (!schritte) return;
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    weiterKnopf.current?.focus();
    const zurueck = vorher.current;
    // Erst nachdem der Dialog weg ist: Sonst setzt der Browser den Fokus beim Entfernen wieder auf <body>. Gibt es das
    // Element nicht mehr (der Rundgang hat die Startseite geöffnet), kommt der Fokus an den Anfang des Inhalts.
    return () => {
      d?.close();
      setTimeout(() => {
        if (zurueck instanceof HTMLElement && zurueck.isConnected && zurueck !== document.body) {
          zurueck.focus();
          return;
        }
        const inhalt = document.querySelector<HTMLElement>('main.rumpf');
        if (!inhalt) return;
        if (!inhalt.hasAttribute('tabindex')) inhalt.setAttribute('tabindex', '-1');
        inhalt.focus({ preventScroll: true });
      }, 0);
    };
  }, [schritte]);

  const aktuell = schritte?.[nr];
  // Ziel in den Blick holen und seine Lage verfolgen (Scrollen, Größe ändern).
  const messen = useCallback(() => {
    const el = aktuell?.anker ? findeAnker(aktuell.anker) : null;
    setRechteck(el ? el.getBoundingClientRect() : null);
    setSchmal(istSchmal());
  }, [aktuell]);
  useLayoutEffect(() => {
    const el = aktuell?.anker ? findeAnker(aktuell.anker) : null;
    if (el) zielInDenBlick(el, istSchmal(), karteRef.current?.offsetHeight ?? 240);
    messen();
    let rahmen = 0;
    const neu = () => {
      cancelAnimationFrame(rahmen);
      rahmen = requestAnimationFrame(messen);
    };
    addEventListener('resize', neu);
    addEventListener('scroll', neu, true);
    const spaet = setTimeout(messen, 450);
    return () => {
      removeEventListener('resize', neu);
      removeEventListener('scroll', neu, true);
      cancelAnimationFrame(rahmen);
      clearTimeout(spaet);
    };
  }, [aktuell, messen]);

  if (!schritte || !aktuell) return null;
  const letzter = nr === schritte.length - 1;
  const s = aktuell.schritt;
  const text = schmal && s.textHandy ? s.textHandy : s.text;
  const ende = (stand: 'gesehen' | 'spaeter') => {
    beendeRundgang(stand);
    if (zurueckNach.current) geheZu(zurueckNach.current);
  };
  const weiter = () => (letzter ? ende('gesehen') : setNr(nr + 1));
  const zurueck = () => setNr(Math.max(0, nr - 1));

  // Tab bleibt im Dialog (auch in Browsern, die den Fokus aus einem modalen Dialog herauslassen).
  const taste = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const knoepfe = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
    if (!knoepfe.length) return;
    const erster = knoepfe[0],
      letzterK = knoepfe[knoepfe.length - 1];
    if (e.shiftKey && document.activeElement === erster) {
      e.preventDefault();
      letzterK.focus();
    } else if (!e.shiftKey && document.activeElement === letzterK) {
      e.preventDefault();
      erster.focus();
    }
  };

  const rand = 6;
  const licht: CSSProperties | undefined = rechteck
    ? { left: rechteck.left - rand, top: rechteck.top - rand, width: rechteck.width + rand * 2, height: rechteck.height + rand * 2 }
    : undefined;
  const karte = lageDerKarte(rechteck, schmal, karteRef.current?.offsetHeight ?? 240);

  return (
    <dialog
      ref={ref}
      className={`rundgang${rechteck ? ' mit-ziel' : ''}${schmal ? ' schmal' : ''}`}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-x`}
      onCancel={(e) => {
        e.preventDefault();
        ende(vonSelbst ? 'spaeter' : 'gesehen');
      }}
      onKeyDown={taste}>
      {licht && <div className="rg-licht" style={licht} aria-hidden="true" />}
      <div ref={karteRef} className="rg-karte" style={karte}>
        <p className="ueber rg-kopf">
          <span>{t('entdecken.fuehrung.titel', { titel: rundgang.titel })}</span>
          <span>{t('entdecken.fuehrung.schritt', { nr: nr + 1, anzahl: schritte.length })}</span>
        </p>
        <div className="rg-inhalt" aria-live="polite">
          <h2 id={`${id}-t`} className="h3">
            {s.titel}
          </h2>
          {s.bild === 'dreiteilung' && <DreiteilungBild schmal={schmal} />}
          <div id={`${id}-x`}>
            <p>{text}</p>
            <SchrittZusatz s={s} />
            {letzter && rundgang.ende && <p className="rg-ende">{rundgang.ende}</p>}
          </div>
        </div>
        <div className="rg-knoepfe">
          <div className="rg-neben">
            {vonSelbst && (
              <Knopf onClick={() => ende('spaeter')} title={t('entdecken.fuehrung.spaeter.titel')}>
                {t('entdecken.fuehrung.spaeter')}
              </Knopf>
            )}
            {!letzter && (
              <Knopf onClick={() => ende('gesehen')} title={t('entdecken.fuehrung.ueberspringen.titel')}>
                {t('entdecken.fuehrung.ueberspringen')}
              </Knopf>
            )}
          </div>
          <div className="rg-haupt">
            {nr > 0 && (
              <Knopf symbol="pfeil-links" onClick={zurueck}>
                {t('entdecken.fuehrung.zurueck')}
              </Knopf>
            )}
            <Knopf ref={weiterKnopf} art="haupt" onClick={weiter}>
              {letzter ? t('entdecken.fuehrung.fertig') : t('entdecken.fuehrung.weiter')}
            </Knopf>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Vor dem ersten Schritt öffnen, was der Rundgang nennt: eine Seite, die erste lesbare Mappe eines Typs oder ein leeres
 * Formular. Liefert, wohin es am Ende zurückgeht (nur beim leeren Formular), oder 'ersatz', wenn es nichts zu öffnen gibt.
 */
async function oeffneVorher(rundgang: Rundgang, probe?: { pfad: string | null }): Promise<string | null | 'ersatz'> {
  const o = rundgang.oeffne;
  if (o && 'seite' in o) {
    if (location.pathname !== OEFFNE_SEITEN[o.seite]) geheZu(OEFFNE_SEITEN[o.seite]);
    return null;
  }
  if (!oeffneTyp(o)) return null;
  // Beim Ausprobieren (#941) hat die Prüfung den Pfad schon geliefert – der Rundgang ist ja noch nicht gespeichert.
  const pfad = probe
    ? probe.pfad
    : await kontoApi.rundgangOeffnen(rundgang.schluessel).then(
        (x) => x.pfad,
        () => null,
      );
  if (!pfad) return 'ersatz';
  const zurueck = o && 'neu' in o ? location.pathname + location.search : null;
  if (location.pathname !== pfad) geheZu(pfad);
  return zurueck;
}

/** Abstand der Karte zum unteren Rand: am Rechner 24 px; am Handy über dem Streifen des Assistenten (10 + 56 + 14 px). */
const KARTE_UNTEN = 24;
const KARTE_UNTEN_SCHMAL = 80;

/**
 * Wo die Karte steht (#1301): an einem festen Platz – am Rechner unten in der Mitte, am Handy unten über dem Assistenten,
 * in allen Schritten gleich; nur die Hervorhebung wandert. Liegt das Ziel trotzdem unter der Karte (es ließ sich nicht
 * weit genug rollen, z. B. eine feste Leiste unten), steht sie ausnahmsweise oben am selben waagrechten Platz.
 */
function lageDerKarte(r: DOMRect | null, schmal: boolean, kartenHoehe: number): CSSProperties {
  const unten = schmal ? KARTE_UNTEN_SCHMAL : KARTE_UNTEN;
  const breite = Math.min(440, innerWidth - 32);
  const waagrecht: CSSProperties = schmal ? {} : { left: Math.max(16, (innerWidth - breite) / 2) };
  const oben = innerHeight - unten - kartenHoehe - 8;
  const verdeckt = !!r && r.top < innerHeight - unten && r.bottom > oben && (schmal || ueberlappt(r, waagrecht.left as number, breite));
  return verdeckt ? { ...waagrecht, top: 16 } : { ...waagrecht, bottom: unten };
}
const ueberlappt = (r: DOMRect, links: number, breite: number) => r.right > links && r.left < links + breite;

/** Ziel so rollen, dass es über der Karte steht (#1301): erst mittig, ragt es dann unter die Karte, an den Anfang. */
function zielInDenBlick(el: Element, schmal: boolean, kartenHoehe: number) {
  const behavior = wenigBewegung() ? 'auto' : 'smooth';
  el.scrollIntoView({ block: 'center', behavior: 'auto' });
  const unten = innerHeight - (schmal ? KARTE_UNTEN_SCHMAL : KARTE_UNTEN);
  const r = el.getBoundingClientRect();
  if (r.bottom > unten - kartenHoehe - 8 && r.top < unten) el.scrollIntoView({ block: 'start', behavior });
}

/** Unter dem Text eines Schritts: Satz für Personen ohne Verwaltungsrecht, Ort für Screenreader, Verweis ins Handbuch. */
function SchrittZusatz({ s }: { s: RundgangSchritt }) {
  return (
    <>
      {s.sonstVerwalten && <p>{s.sonstVerwalten}</p>}
      {s.ort && <p className="sr">{s.ort}</p>}
      {s.handbuch && <HandbuchVerweis verweis={s.handbuch} />}
    </>
  );
}

/** Verweis ins mitgelieferte Handbuch an einem Schritt (`handbuch: admin/pakete/#…`), in neuem Fenster. */
function HandbuchVerweis({ verweis }: { verweis: string }) {
  const handbuch = useHandbuch();
  if (!HANDBUCH_VERWEIS.test(verweis)) return null;
  const [h, ...rest] = verweis.split('/');
  return (
    <p>
      <a className="verweis" href={handbuch(h as Handbuch, rest.join('/'))} target="_blank" rel="noreferrer">
        {t('entdecken.fuehrung.handbuch')} <Symbol name="extern" />
      </a>
    </p>
  );
}
