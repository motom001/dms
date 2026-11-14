import { useState, type ReactNode } from 'react';
import { Fundstellen, Hervorgehoben, KeineTreffer, ListenSuche, Umschalter, useListenSuche } from '../bausteine';
import { empfehlungen, paketArt, type KatalogPaket, type PaketArt } from '../../../shared/src/pakete';
import type { Fundquelle } from '../../../shared/src/listensuche';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { t } from '../sprache';
import { Herausgeber } from './PaketVorschau';
import type { PaketeZustand } from './Pakete';

/**
 * Werkbank → Pakete, „Verfügbar“ (#1048) nach den Regeln der Katalog-Übersicht (dms-registry #165): oben „Für dich
 * empfohlen“, darunter „Weitere Pakete“ – ohne Sprachen und ohne Ergänzungen, deren Hauptpaket es gibt. Sprachen stehen
 * unter dem Filter „Sprachen“, Ergänzungen beim Hauptpaket („Dazu passend“); die Suche findet alles.
 */

interface Verfuegbar { p: KatalogPaket; url: string; offiziell: boolean; art: PaketArt; haupt: string | null }
type Wahl = 'pakete' | 'sprachen';

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
/** Hauptpaket einer Ergänzung (neueste Version), sonst null. */
const hauptpaketVon = (p: KatalogPaket) => p.versionen[0]?.ergaenzt?.paket ?? null;

/** Worin die Suche schaut: Name (Titel), Beschreibung, Kennung. */
const quellen = (e: Verfuegbar): Fundquelle[] => [
  { wo: '', text: e.p.name, titel: true },
  { wo: t('werkbank.pakete.dazu.fund.beschreibung'), text: e.p.beschreibung },
  { wo: t('werkbank.pakete.dazu.fund.kennung'), text: e.p.id },
];

export function PaketeVerfuegbar({ z, offen }: { z: PaketeZustand; offen?: string }) {
  const d = useDaten();
  const [wahl, setWahl] = useState<Wahl>('pakete');
  const installiert = z.stand?.installiert ?? [];
  const dms = z.stand?.dms ?? '';
  const quelleOffen = new URLSearchParams(location.search).get('quelle');
  const alle: Verfuegbar[] = (z.kataloge?.liste ?? []).flatMap((k) => (k.katalog?.pakete ?? [])
    .filter((p) => !installiert.some((i) => i.id === p.id || p.ersetzt?.includes(i.id)))
    .map((p) => ({ p, url: k.url, offiziell: k.offiziell, art: paketArt(p, dms), haupt: hauptpaketVon(p) })));
  const such = useListenSuche(alle, { quellen });
  if (!z.kataloge) return <p className="leise klein">{t('werkbank.pakete.klicke-katalog-abrufen-um', { knopf: installiert.length ? t('werkbank.pakete.nach-neuen-versionen-suchen') : t('werkbank.pakete.katalog-abrufen') })}</p>;
  if (!alle.length) return <p className="leise leerliste">{t('werkbank.pakete.alle-pakete-des-katalogs')}</p>;

  // Ergänzung mit bekanntem Hauptpaket: nur beim Hauptpaket und in der Suche (#1048).
  const beimHaupt = (e: Verfuegbar) => e.art === 'ergaenzung' && !!e.haupt && (installiert.some((i) => i.id === e.haupt) || alle.some((x) => x.p.id === e.haupt));
  const sprachen = alle.filter((e) => e.art === 'sprache');
  const offiziell = z.kataloge.liste.find((k) => k.offiziell)?.katalog;
  const empfohlen = offiziell ? empfehlungen(offiziell, { beruflich: !!d.zaehler.merkmale?.beruflich, dms, installiert }).flatMap((p) => alle.filter((e) => e.offiziell && e.p.id === p.id)) : [];
  const weitere = alle.filter((e) => e.art !== 'sprache' && !beimHaupt(e) && !empfohlen.includes(e));
  const zeile = { offen, quelleOffen, hauptName: (id: string) => installiert.find((i) => i.id === id)?.name ?? alle.find((x) => x.p.id === id)?.p.name ?? id };
  const eintrag = (e: Verfuegbar, titel?: Parameters<typeof Hervorgehoben>[0]['teile'], funde?: Parameters<typeof Fundstellen>[0]['funde']) => <Zeile key={`${e.url}|${e.p.id}`} e={e} titel={titel} funde={funde} {...zeile} />;
  return (
    <>
      {/* Eigener Rahmen: Mitten in der Seite (unter „Installiert“) bleibt die Suchregion am Handy nicht oben stehen – sie
          verdeckte sonst die wenigen Pakete darunter. Am Handy mit Abstand nach oben, damit das Suchfeld die
          44-px-Tippfläche des Hilfe-Zeichens darüber nicht anschneidet. */}
      <div className="verfuegbar-suche">
      <ListenSuche wert={such.eingabe} setze={such.setEingabe} beschriftung={t('werkbank.pakete.dazu.suche')} platzhalter={t('werkbank.pakete.dazu.suche.platzhalter')} anker="werkbank.pakete.suche"
        treffer={such.treffer.length} aktiv={such.aktiv} anzahl={t('werkbank.pakete.dazu.anzahl', { anzahl: alle.length })}
        filter={sprachen.length > 0 && !such.aktiv ? <Umschalter wert={wahl} setze={setWahl} beschriftung={t('werkbank.pakete.dazu.art')} anker="werkbank.pakete.art"
          wahlen={[{ wert: 'pakete', text: t('werkbank.pakete.dazu.pakete') }, { wert: 'sprachen', text: t('werkbank.pakete.dazu.sprachen', { anzahl: sprachen.length }) }]} /> : undefined} />
      </div>
      {such.aktiv ? (!such.treffer.length ? <KeineTreffer zuruecksetzen={such.zuruecksetzen} /> : (
        <ul className="mappenliste" aria-label={t('werkbank.pakete.dazu.treffer')}>{such.treffer.map((x) => eintrag(x.eintrag, x.titel, x.funde))}</ul>
      )) : wahl === 'sprachen' ? (
        <ul className="mappenliste" aria-label={t('werkbank.pakete.dazu.sprachen-liste')}>{sprachen.map((e) => eintrag(e))}</ul>
      ) : (
        <Erste empfohlen={empfohlen.map((e) => eintrag(e))} weitere={weitere.map((e) => eintrag(e))} hinweis={alle.some(beimHaupt)} />
      )}
    </>
  );
}

/** Ein verfügbares Paket: Name (Suchwort hervorgehoben), Herausgeber, Quelle, Art; darunter Version und Beschreibung. */
function Zeile({ e, titel, funde, offen, quelleOffen, hauptName }: {
  e: Verfuegbar; titel?: Parameters<typeof Hervorgehoben>[0]['teile']; funde?: Parameters<typeof Fundstellen>[0]['funde'];
  offen?: string; quelleOffen: string | null; hauptName(id: string): string;
}) {
  const an = offen === e.p.id && (e.offiziell ? !quelleOffen : quelleOffen === e.url);
  return (
    <li><Link to={`/werkbank/pakete/${e.p.id}${e.offiziell ? '' : `?quelle=${encodeURIComponent(e.url)}`}`} className={`eintrag werk ${an ? 'an' : ''}`}>
      <span className="titel"><Hervorgehoben teile={titel} text={e.p.name} /><Herausgeber wer={e.p.herausgeber} geprueft={e.offiziell} />
        {!e.offiziell && <> <span className="chip warn" title={t('werkbank.pakete.aus-nicht-vom-ablago', { url: e.url })}>{host(e.url)}</span></>}
        {e.art === 'sprache' && <> <span className="chip">{t('werkbank.pakete.dazu.sprache')}</span></>}
        {e.art === 'ergaenzung' && e.haupt && <> <span className="chip">{t('werkbank.pakete.dazu.ergaenzt', { name: hauptName(e.haupt) })}</span></>}</span>
      <span className="unter">{e.p.aktuell} · {e.p.beschreibung}</span>
      {funde && <Fundstellen funde={funde} />}
    </Link></li>
  );
}

/** Ohne Suche (#1048): „Für dich empfohlen“, darunter „Weitere Pakete“ und der Hinweis auf Ergänzungen beim Hauptpaket. */
function Erste({ empfohlen, weitere, hinweis }: { empfohlen: ReactNode[]; weitere: ReactNode[]; hinweis: boolean }) {
  return (
    <>
      {empfohlen.length > 0 && (
        <section aria-label={t('werkbank.pakete.dazu.empfohlen')} data-anker="werkbank.pakete.empfohlen">
          <h3 className="ueber">{t('werkbank.pakete.dazu.empfohlen')}</h3>
          <ul className="mappenliste">{empfohlen}</ul>
        </section>
      )}
      {weitere.length > 0 && (
        <section aria-label={t('werkbank.pakete.dazu.weitere')}>
          {empfohlen.length > 0 && <h3 className="ueber">{t('werkbank.pakete.dazu.weitere')}</h3>}
          <ul className="mappenliste">{weitere}</ul>
        </section>
      )}
      {hinweis && <p className="leise klein">{t('werkbank.pakete.dazu.ergaenzungen-hinweis')}</p>}
    </>
  );
}
