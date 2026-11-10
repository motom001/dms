import { createContext, useContext, useState, type ReactNode } from 'react';
import { auswahlMitAbhaengigkeiten, dmsPasst, inMB, passt, vergleicheVersion, type AblaufEingabe, type AblaufErgebnis, type AblaufInstallation, type AblaufPlan, type Ergaenzung, type InstalliertesPaket, type Katalog, type KatalogPaket, type KatalogVersion } from '../../../shared/src/pakete';
import type { EinstellungFeld } from '../../../shared/src/paketeinstellungen';
import { api, ApiFehler, type PaketVorschau, type Sammeldatei, type SammelPaket } from '../api';
import { Hilfe } from '../Hilfe';
import { Link } from '../ort';
import { t } from '../sprache';
import { HerkunftZeile } from './Herkunft';
import { Eingabe } from './PaketEinstellungen';
import { PaketSymbol } from './PaketSymbol';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Mehrere Pakete in einem Ablauf (#405): Auswahl als Baum (Abhängigkeiten sichtbar, Ergänzungen wie die Zusatzsprachen
 * der Texterkennung als Häkchen), dann jede Frage einmal – Herkunft, Rechte, Namen nur bei Konflikten, Beispiele (für
 * alle, je Paket abwählbar), Pflicht-Einstellungen (oder bewusst später) –, eine Zusammenfassung und ein Knopf.
 * Derselbe Ablauf in Werkbank → Pakete, im Einrichtungsassistenten (#460) und für die Sammeldatei (#461).
 * Zwischen den Schritten speichert der Server nichts: Er rechnet den Plan bei der Installation neu und prüft, ob die
 * bestätigten Rechte noch dieselben sind.
 */

/**
 * Welche Schnittstellen der Ablauf nutzt: in der Werkbank die des Administrators, im Einrichtungsassistenten (#804)
 * die mit Einrichtungscode – dort gibt es noch keinen Administrator, und es wird nichts installiert.
 */
export interface PaketApi {
  stand(): Promise<{ dms: string; installiert: InstalliertesPaket[] }>;
  katalog(): Promise<{ kataloge: Array<{ offiziell: boolean; katalog: Katalog | null; fehler: string | null }> }>;
  plan(e: AblaufEingabe): Promise<AblaufPlan<PaketVorschau>>;
}
export const PaketApiKontext = createContext<PaketApi>({ stand: () => api.pakete(), katalog: () => api.paketKatalog(false), plan: (e) => api.paketAblaufPlan(e) });

/**
 * Gesammelte Antworten des Ablaufs (#804): Was „Jetzt einrichten“ später installiert, dazu eine Kurzfassung für die
 * Zusammenfassung und die Konfigurationsdatei (#806).
 */
export interface PaketWahl {
  eingabe: AblaufInstallation;
  pakete: Array<{ id: string; name: string; version: string; gewaehlt: boolean; beispiele: boolean; automatisierungen: Record<string, boolean> }>;
  /** Neue Mappentypen aus den Paketen – dann keine Beispiel-Mappentypen dazu. */
  neueTypen: number;
  /** Mit Pflicht-Einstellungen: die Werte bleiben nur im Speicher (es kann Geheimes darunter sein). */
  mitEinstellungen: boolean;
}
/** Vorbelegte Antworten, z. B. aus einer Konfigurationsdatei (#806) oder beim „Ändern“ (#804). */
export interface PaketVorgabe { beispiele: string[]; automatisierungenAus: string[] }

/** Woher die Pakete kommen. */
export type AblaufQuelle =
  | { art: 'katalog'; katalog: Katalog; /** Adresse eines weiteren Katalogs; ohne: der offizielle. */ quelle?: string; dms: string; installiert: InstalliertesPaket[] }
  | { art: 'sammel'; sammeldatei: Sammeldatei; dms: string; installiert: InstalliertesPaket[] };

interface Kandidat {
  /** Paket-Id (Katalog) bzw. Upload-Kennung (Sammeldatei). */
  schluessel: string;
  id: string; name: string; version: string; beschreibung: string; code: boolean;
  ergaenzt: Ergaenzung | null; abhaengigkeiten: Record<string, string>;
  /** Nicht wählbar – mit Grund. */
  gesperrt?: string;
  /** Zusatz, z. B. „Update von 1.0.0“ in der Sammeldatei. */
  zusatz?: string;
  inhalt?: string;
  /** Wie im Katalog (#645): Symbol, Sprachkürzel, Kategorien, Größe des Archivs in Bytes. */
  symbol?: string; kuerzel?: string; kategorien?: string[]; groesse?: number;
}

/** Was mit einem Paket der Sammeldatei passiert (#461). */
export function sammelStand(p: SammelPaket): { text: string; chip: 'gut' | 'warn' | ''; installierbar: boolean } {
  if (p.stand === 'gleich') return { text: t('pakete.ablauf.sammel.gleich', { version: p.installiert ?? '' }), chip: '', installierbar: false };
  if (p.stand === 'aelter') return { text: t('pakete.ablauf.sammel.aelter', { version: p.installiert ?? '' }), chip: '', installierbar: false };
  if (!p.vorschau.dmsOk) return { text: t('pakete.ablauf.sammel.dms', { dms: p.vorschau.paket.dms }), chip: 'warn', installierbar: false };
  if (p.stand === 'neuer' && p.vorschau.herkunft?.art === 'katalog') return { text: t('pakete.ablauf.sammel.katalog', { version: p.installiert ?? '' }), chip: 'warn', installierbar: false };
  if (p.stand === 'neuer') return { text: t('pakete.ablauf.sammel.update', { version: p.installiert ?? '' }), chip: 'gut', installierbar: true };
  return { text: t('pakete.ablauf.sammel.neu'), chip: 'gut', installierbar: true };
}

const passende = (p: KatalogPaket, dms: string): KatalogVersion | undefined =>
  [...p.versionen].sort((a, b) => vergleicheVersion(b.version, a.version)).find((v) => dmsPasst(dms, v.dms));
const inhaltText = (v: KatalogVersion) => [
  v.inhalt.mappentypen.length ? t('pakete.ablauf.inhalt.typen', { namen: v.inhalt.mappentypen.map((x) => x.name).join(', ') }) : '',
  v.inhalt.sichten.length ? t('pakete.ablauf.inhalt.sichten', { namen: v.inhalt.sichten.map((x) => x.name).join(', ') }) : '',
].filter(Boolean).join(' · ');

function kandidaten(q: AblaufQuelle, versionen: Record<string, string>): Kandidat[] {
  if (q.art === 'katalog') {
    return q.katalog.pakete.filter((p) => !q.installiert.some((x) => x.id === p.id)).map((p): Kandidat => {
      const v = (versionen[p.id] ? p.versionen.find((x) => x.version === versionen[p.id]) : undefined) ?? passende(p, q.dms);
      const z = v ?? p.versionen[0];
      return {
        schluessel: p.id, id: p.id, name: p.name, version: z.version, beschreibung: p.beschreibung, code: z.code, ergaenzt: z.ergaenzt ?? null, abhaengigkeiten: z.abhaengigkeiten,
        ...(v ? {} : { gesperrt: t('pakete.ablauf.dms', { dms: z.dms, version: q.dms }) }), inhalt: inhaltText(z),
        symbol: p.symbol, kuerzel: p.kuerzel, kategorien: p.kategorien, groesse: z.groesse,
      };
    });
  }
  return q.sammeldatei.pakete.map((p): Kandidat => {
    const st = sammelStand(p);
    return {
      schluessel: p.upload, id: p.id, name: p.name, version: p.version, beschreibung: p.vorschau.paket.beschreibung, code: !!p.vorschau.laeufer, ergaenzt: p.ergaenzt ?? null, abhaengigkeiten: p.abhaengigkeiten,
      ...(st.installierbar ? { zusatz: st.text } : { gesperrt: st.text }),
    };
  });
}

/** Die Auswahl samt Abhängigkeiten: in der Sammeldatei nur aus der Datei, im Katalog wie bisher (#460). */
function aufloesen(q: AblaufQuelle, liste: Kandidat[], wahl: string[], versionen: Record<string, string>): { pakete: Array<{ schluessel: string; id: string; gewaehlt: boolean; fuer: string[] }>; probleme: string[] } {
  if (q.art === 'katalog') {
    const r = auswahlMitAbhaengigkeiten(q.katalog, wahl, q.dms, q.installiert, versionen);
    return { pakete: r.pakete.map((p) => ({ schluessel: p.id, id: p.id, gewaehlt: p.gewaehlt, fuer: p.fuer })), probleme: r.probleme };
  }
  const plan = new Map<string, { schluessel: string; id: string; gewaehlt: boolean; fuer: string[] }>();
  const probleme: string[] = [];
  const nimm = (k: Kandidat, von: string | null) => {
    const da = plan.get(k.id);
    if (da) { if (von && !da.fuer.includes(von)) da.fuer.push(von); if (!von) da.gewaehlt = true; return; }
    plan.set(k.id, { schluessel: k.schluessel, id: k.id, gewaehlt: !von, fuer: von ? [von] : [] });
    for (const [a, b] of Object.entries(k.abhaengigkeiten)) {
      const inst = q.installiert.find((x) => x.id === a);
      if (inst && passt(inst.version, b)) continue;
      const mit = liste.find((x) => x.id === a && !x.gesperrt);
      if (mit) nimm(mit, k.id); else probleme.push(t('pakete.ablauf.sammel.fehlt', { name: k.name, abh: a, bereich: b }));
    }
  };
  for (const s of wahl) { const k = liste.find((x) => x.schluessel === s); if (k && !k.gesperrt) nimm(k, null); }
  return { pakete: [...plan.values()], probleme };
}

/** Name einer Kategorie aus dem Katalog (#645); unbekannte Kennungen zeigt Ablago, wie sie sind. */
const kategorieName = (k: string) => { const s = `pakete.kategorie.${k}`; const x = t(s as never); return x === s ? k : x; };
const groesseText = (b: number) => (b >= 1048576 ? `${(b / 1048576).toLocaleString(gebietsschema(), { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Kurzer Name einer Ergänzung unter ihrem Paket: „Texterkennung – Zusatzsprache Französisch“ → „Zusatzsprache Französisch“. */
const kurz = (name: string) => (name.includes(' – ') ? name.slice(name.lastIndexOf(' – ') + 3) : name);

export function PaketAblauf({ quelle, start, nur, empfohlen = [], versionen = {}, aktionen, weiterText, fertig, geaendert, direkt, sammeln, vorgabe }: {
  quelle: AblaufQuelle;
  /** Nur sammeln statt installieren (Einrichtungsassistent, #804). */
  sammeln?(w: PaketWahl): void;
  vorgabe?: PaketVorgabe;
  /** Ohne Fehler gleich `fertig` statt der Ergebnisseite mit „Weiter“ (#659) – die Seite zeigt dann selbst eine Meldung. */
  direkt?: boolean;
  /** Vorgewählt (Paket-Ids bzw. Upload-Kennungen). */
  start: string[];
  /** Nur diese Pakete oben zeigen (Ids), samt ihrer Ergänzungen – z. B. ein Paket aus der Werkbank. */
  nur?: string[];
  /** Mit „empfohlen“ markiert (z. B. Texterkennung im Einrichtungsassistenten). */
  empfohlen?: string[];
  /** Bestimmte Versionen statt der neuesten (Versionsauswahl in der Werkbank). */
  versionen?: Record<string, string>;
  /** Weitere Knöpfe neben „Weiter“ in der Auswahl, z. B. „Überspringen“ oder „Abbrechen“. */
  aktionen?: ReactNode;
  weiterText?: string;
  /** Nach dem Ergebnis („Weiter“). */
  fertig(e: AblaufErgebnis): void;
  /** Nach der Installation (Daten neu laden). */
  geaendert?(): void;
}) {
  const liste = kandidaten(quelle, versionen);
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [wahl, setWahl] = useState<string[]>(() => start.filter((s) => liste.some((k) => k.schluessel === s && !k.gesperrt)));
  const [plan, setPlan] = useState<AblaufPlan<PaketVorschau> | null>(null);
  const [ergebnis, setErgebnis] = useState<AblaufErgebnis | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; gruende?: string[] }>();
  const [laeuft, setLaeuft] = useState(false);
  const pa = useContext(PaketApiKontext);
  const aufgeloest = aufloesen(quelle, liste, wahl, versionen);
  const eingabe = () => (quelle.art === 'katalog'
    ? { quelle: quelle.quelle, pakete: wahl.map((id) => (versionen[id] ? `${id}@${versionen[id]}` : id)) }
    : { uploads: aufgeloest.pakete.map((p) => p.schluessel) });

  async function pruefen() {
    setLaeuft(true); setMeldung(undefined);
    try { setPlan(await pa.plan(eingabe())); }
    catch (e) { setMeldung({ text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] }); }
    finally { setLaeuft(false); }
  }

  if (ergebnis) return <AblaufErgebnisAnsicht e={ergebnis} weiter={() => fertig(ergebnis)} />;
  if (plan) return (
    <Fragen key={plan.rechte.stand + plan.pakete.map((p) => p.schluessel).join()} plan={plan} eingabe={eingabe} zurueck={() => setPlan(null)} neuerPlan={setPlan} sammeln={sammeln} vorgabe={vorgabe}
      fertig={(e) => { geaendert?.(); if (direkt && !e.fehler) fertig(e); else setErgebnis(e); }} />
  );

  // Baum: oben die Pakete, darunter ihre Ergänzungen (auch unter einem schon installierten Paket).
  const basis = (k: Kandidat) => (k.ergaenzt && (liste.some((x) => x.id === k.ergaenzt!.paket) || quelle.installiert.some((x) => x.id === k.ergaenzt!.paket)) ? k.ergaenzt.paket : null);
  const alleOben = liste.filter((k) => !basis(k) && (!nur || nur.includes(k.id)));
  // Kategorien wie im Katalog (#645): nur die, die hier vorkommen; Gewähltes bleibt beim Filtern sichtbar.
  const kategorien = [...new Set(alleOben.flatMap((k) => k.kategorien ?? []))];
  const oben = kategorie ? alleOben.filter((k) => k.kategorien?.includes(kategorie) || wahl.includes(k.schluessel)) : alleOben;
  const installierteBasen = [...new Set(liste.map(basis).filter((b): b is string => !!b && quelle.installiert.some((x) => x.id === b)))].filter((b) => !nur || nur.includes(b));
  const imPlan = (id: string) => aufgeloest.pakete.find((p) => p.id === id);
  const name = (id: string) => liste.find((k) => k.id === id)?.name ?? quelle.installiert.find((x) => x.id === id)?.name ?? id;
  const schalten = (s: string, an: boolean) => setWahl(an ? [...wahl, s] : wahl.filter((x) => x !== s));
  const ergaenzungen = (id: string) => liste.filter((k) => basis(k) === id);

  const knoten = (k: Kandidat) => {
    const p = imPlan(k.id);
    const mit = !!p && !p.gewaehlt;
    const an = wahl.includes(k.schluessel) || mit;
    const erg = ergaenzungen(k.id);
    return (
      <li key={k.schluessel} className={an ? 'an' : undefined}>
        <label className="haken pd-kachel">
          <input type="checkbox" checked={an} disabled={!!k.gesperrt || mit} onChange={(e) => schalten(k.schluessel, e.target.checked)} aria-describedby={`pa-${k.id}`} />
          <PaketSymbol symbol={k.symbol} kuerzel={k.kuerzel} name={k.name} />
          <span>
            <span><strong>{k.name}</strong> <span className="leise klein">{k.version}</span>
              {empfohlen.includes(k.id) && !k.gesperrt && <> <span className="chip gut">{t('pakete.ablauf.empfohlen')}</span></>}
              {k.code && <> <span className="chip">{t('pakete.ablauf.code')}</span></>}
              {k.zusatz && <> <span className="chip gut">{k.zusatz}</span></>}
              {mit && <> <span className="chip">{t('pakete.ablauf.kommtmit', { namen: p!.fuer.map(name).join(', ') })}</span></>}</span>
            <span className="klein">{k.beschreibung}</span>
            {k.groesse !== undefined && k.groesse > 0 && <span className="klein leise">{t('pakete.ablauf.groesse', { groesse: groesseText(k.groesse) })}</span>}
          </span>
        </label>
        <div className="pd-darf klein leise" id={`pa-${k.id}`}>
          {k.gesperrt ? <span className="fehlertext">{k.gesperrt}</span> : k.inhalt ? k.inhalt : null}
          {!k.gesperrt && Object.keys(k.abhaengigkeiten).length > 0 && <>{k.inhalt ? ' · ' : ''}{t('pakete.ablauf.braucht', { namen: Object.keys(k.abhaengigkeiten).map((a) => (quelle.installiert.some((x) => x.id === a) ? t('pakete.ablauf.braucht.da', { name: name(a) }) : name(a))).join(', ') })}</>}
        </div>
        {erg.length > 0 && <ErgaenzungenWahl erg={erg} offen={an} wahl={wahl} imPlan={imPlan} schalten={schalten} />}
      </li>
    );
  };

  return (
    <div className="stapel">
      {kategorien.length > 1 && (
        <div className="pd-kategorien" role="group" aria-label={t('pakete.ablauf.kategorien')}>
          <button type="button" className="knopf klein" aria-pressed={kategorie === null} onClick={() => setKategorie(null)}>{t('pakete.ablauf.kategorien.alle')}</button>
          {kategorien.map((k) => (
            <button key={k} type="button" className="knopf klein" aria-pressed={kategorie === k} onClick={() => setKategorie(kategorie === k ? null : k)}>{kategorieName(k)}</button>
          ))}
        </div>
      )}
      <ul className="pd-liste" aria-label={t('pakete.ablauf.auswahl')}>
        {installierteBasen.map((b) => (
          <li key={`da-${b}`}>
            <span><strong>{name(b)}</strong> <span className="chip">{t('pakete.ablauf.installiert')}</span></span>
            <ErgaenzungenWahl erg={ergaenzungen(b)} offen wahl={wahl} imPlan={imPlan} schalten={schalten} />
          </li>
        ))}
        {oben.map(knoten)}
      </ul>
      {!oben.length && !installierteBasen.length && <p className="leise">{t('pakete.ablauf.nichts')}</p>}
      {aufgeloest.probleme.length > 0 && <div className="hinweis warn"><ul>{aufgeloest.probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {meldung && <div className="hinweis schlecht" role="status"><p>{meldung.text}</p>{!!meldung.gruende?.length && <ul>{meldung.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}</div>}
      <p className="leise klein">{t('pakete.ablauf.auswahl.hinweis')}</p>
      <div className="knoepfe">
        <button type="button" className="knopf primaer" disabled={laeuft || !aufgeloest.pakete.length || aufgeloest.probleme.length > 0} onClick={() => void pruefen()}>
          {laeuft ? t('pakete.ablauf.pruefe') : weiterText ?? t('pakete.ablauf.weiter', { anzahl: aufgeloest.pakete.length })}
        </button>
        {aktionen}
      </div>
    </div>
  );
}

/** „Weitere Sprachen?“: Ergänzungen eines Pakets als Häkchen, gruppiert; zu, solange das Paket nicht gewählt ist. */
function ErgaenzungenWahl({ erg, offen, wahl, imPlan, schalten }: { erg: Kandidat[]; offen: boolean; wahl: string[]; imPlan: (id: string) => { gewaehlt: boolean } | undefined; schalten(s: string, an: boolean): void }) {
  const gruppen = [...new Set(erg.map((k) => k.ergaenzt?.gruppe ?? ''))];
  if (!offen) return <p className="pd-darf klein leise">{t('pakete.ablauf.ergaenzungen.zu', { anzahl: erg.length })}</p>;
  return (
    <>
      {gruppen.map((g) => (
        <fieldset key={g} className="pd-ergaenzungen">
          <legend className="klein"><strong>{g ? `${g}?` : t('pakete.ablauf.ergaenzungen')}</strong></legend>
          <div className="pd-ergaenzungsliste">
            {erg.filter((k) => (k.ergaenzt?.gruppe ?? '') === g).map((k) => {
              const p = imPlan(k.id);
              const an = wahl.includes(k.schluessel) || (!!p && !p.gewaehlt);
              return (
                <label key={k.schluessel} className="haken klein" title={k.gesperrt ?? k.beschreibung}>
                  <input type="checkbox" checked={an} disabled={!!k.gesperrt} onChange={(e) => schalten(k.schluessel, e.target.checked)} />
                  <span>{kurz(k.name)}{k.gesperrt && <span className="fehlertext"> {k.gesperrt}</span>}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}

const leer = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Jede Frage einmal (#405) – mit Ausnahmen je Paket –, Zusammenfassung und ein Knopf. Exportiert für den Test ohne Konto (#881). */
export function Fragen({ plan, eingabe, zurueck, neuerPlan, fertig, sammeln, vorgabe }: {
  plan: AblaufPlan<PaketVorschau>; eingabe(): AblaufEingabe; zurueck(): void; neuerPlan(p: AblaufPlan<PaketVorschau>): void; fertig(e: AblaufErgebnis): void;
  sammeln?(w: PaketWahl): void; vorgabe?: PaketVorgabe;
}) {
  const pk = plan.pakete;
  const pa = useContext(PaketApiKontext);
  const konfliktTypen = (p: typeof pk[number]) => p.vorschau.typen.filter((x) => !x.vorhanden && !x.geloescht && x.konflikt);
  const konfliktSichten = (p: typeof pk[number]) => p.vorschau.sichten.filter((x) => !x.vorhanden && x.konflikt);
  const [namen, setNamen] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(pk.map((p) => [p.id, Object.fromEntries(konfliktTypen(p).map((x) => [x.schluessel, x.vorschlag ?? x.name]))])));
  const [sichtNamen, setSichtNamen] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(pk.map((p) => [p.id, Object.fromEntries(konfliktSichten(p).map((x) => [x.schluessel, x.vorschlag ?? x.name]))])));
  const mitBeispielen = pk.filter((p) => p.vorschau.beispiele > 0 && !p.vorschau.update);
  const [beispiele, setBeispiele] = useState(() => !!vorgabe && mitBeispielen.some((p) => vorgabe.beispiele.includes(p.id)));
  const [ohneBeispiele, setOhneBeispiele] = useState<string[]>(() => (vorgabe ? mitBeispielen.filter((p) => !vorgabe.beispiele.includes(p.id)).map((p) => p.id) : []));
  // Mitgelieferte Automatisierungen (#712): Vorgabe ja – abgewählte bleiben aus („paket|schlüssel“).
  const mitAutomatisierungen = pk.filter((p) => (p.vorschau.automatisierungen ?? []).some((a) => a.neu));
  const [ohneAutomatisierung, setOhneAutomatisierung] = useState<string[]>(() => vorgabe?.automatisierungenAus ?? []);
  const angehakt = Object.fromEntries(mitAutomatisierungen.map((p) => [p.id, (p.vorschau.automatisierungen ?? []).filter((a) => a.neu && !ohneAutomatisierung.includes(`${p.id}|${a.schluessel}`)).map((a) => a.schluessel)]));
  const anzahlAn = Object.values(angehakt).reduce((n, l) => n + l.length, 0);
  const [herkunftOk, setHerkunftOk] = useState(false);
  const [rechteOk, setRechteOk] = useState(false);
  const [adresseOk, setAdresseOk] = useState(false);
  const mitEinstellungen = pk.filter((p) => p.einstellungen.length > 0);
  const [werte, setWerte] = useState<Record<string, Record<string, unknown>>>(() => Object.fromEntries(mitEinstellungen.map((p) => [p.id, Object.fromEntries(p.einstellungen.map((f) => [f.schluessel, null]))])));
  const [spaeter, setSpaeter] = useState<string[]>([]);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<{ text: string; gruende?: string[] }>();
  const [laeuft, setLaeuft] = useState(false);

  const mitCode = pk.filter((p) => p.vorschau.laeufer);
  const adressen = mitEinstellungen.filter((p) => !spaeter.includes(p.id)).flatMap((p) => p.einstellungen.filter((f) => f.typ === 'adresse' && !leer(werte[p.id]?.[f.schluessel])).map((f) => ({ paket: p.name, wert: String(werte[p.id][f.schluessel]) })));
  const offenePflicht = mitEinstellungen.filter((p) => !spaeter.includes(p.id) && p.einstellungen.some((f) => leer(werte[p.id]?.[f.schluessel])));
  const leereNamen = pk.some((p) => Object.values(namen[p.id] ?? {}).some((n) => !n.trim()) || Object.values(sichtNamen[p.id] ?? {}).some((n) => !n.trim()));
  const nochKonflikt = pk.some((p) => konfliktTypen(p).some((x) => (namen[p.id]?.[x.schluessel] ?? '').trim().toLowerCase() === x.name.toLowerCase()) || konfliktSichten(p).some((x) => (sichtNamen[p.id]?.[x.schluessel] ?? '').trim().toLowerCase() === x.name.toLowerCase()));
  const beispielPakete = beispiele ? mitBeispielen.filter((p) => !ohneBeispiele.includes(p.id)) : [];
  const fehlt = [
    plan.herkunftBestaetigen && !herkunftOk ? t('pakete.ablauf.fehlt.herkunft') : '',
    plan.rechte.bestaetigen && !rechteOk ? t('pakete.ablauf.fehlt.rechte') : '',
    leereNamen || nochKonflikt ? t('pakete.ablauf.fehlt.namen') : '',
    offenePflicht.length ? t('pakete.ablauf.fehlt.einstellungen', { namen: offenePflicht.map((p) => p.name).join(', ') }) : '',
    adressen.length && !adresseOk ? t('pakete.ablauf.fehlt.adresse') : '',
  ].filter(Boolean);
  const probleme = [...plan.probleme, ...pk.flatMap((p) => p.vorschau.probleme.map((x) => `${p.name}: ${x}`))];
  const neueTypen = pk.reduce((n, p) => n + p.vorschau.typen.filter((x) => !x.vorhanden && !x.geloescht).length, 0);
  const neueSichten = pk.reduce((n, p) => n + p.vorschau.sichten.filter((x) => !x.vorhanden).length, 0);
  const updates = pk.filter((p) => p.vorschau.update);

  const antworten = (): AblaufInstallation => ({
    ...eingabe(), namen, sichtNamen, beispiele: beispielPakete.map((p) => p.id), automatisierungen: angehakt,
    ...(herkunftOk ? { bestaetigt: true } : {}), ...(rechteOk ? { rechteStand: plan.rechte.stand } : {}),
    einstellungen: Object.fromEntries(Object.entries(werte).filter(([id]) => !spaeter.includes(id))), spaeter, ...(adresseOk ? { adresseBestaetigt: true } : {}),
  });

  async function installieren() {
    // Im Einrichtungsassistenten (#804): nur merken – installiert wird erst mit „Jetzt einrichten“.
    if (sammeln) {
      sammeln({
        eingabe: antworten(), neueTypen, mitEinstellungen: mitEinstellungen.some((p) => !spaeter.includes(p.id)),
        pakete: pk.map((p) => ({
          id: p.id, name: p.name, version: p.version, gewaehlt: p.gewaehlt, beispiele: beispielPakete.includes(p),
          automatisierungen: Object.fromEntries((p.vorschau.automatisierungen ?? []).filter((a) => a.neu).map((a) => [a.schluessel, !ohneAutomatisierung.includes(`${p.id}|${a.schluessel}`)])),
        })),
      });
      return;
    }
    setLaeuft(true); setMeldung(undefined); setFehler({});
    try {
      const e = await api.paketAblaufInstallieren(antworten());
      fertig(e);
    } catch (x) {
      const d = x instanceof ApiFehler ? x.details as { rechteStand?: string; felderFehler?: Record<string, string> } | undefined : undefined;
      setMeldung({ text: (x as Error).message, gruende: x instanceof ApiFehler ? x.gruende : [] });
      if (d?.felderFehler) setFehler(d.felderFehler);
      // Die Rechte haben sich geändert (z. B. neuer Katalog): neu zeigen, neu bestätigen.
      if (d?.rechteStand && d.rechteStand !== plan.rechte.stand) { try { neuerPlan(await pa.plan(eingabe())); } catch { /* Meldung steht schon da */ } }
    } finally { setLaeuft(false); }
  }

  async function nochmal() {
    setLaeuft(true); setMeldung(undefined);
    try { neuerPlan(await pa.plan(eingabe())); }
    catch (x) { setMeldung({ text: (x as Error).message, gruende: x instanceof ApiFehler ? x.gruende : [] }); }
    finally { setLaeuft(false); }
  }

  return (
    <div className="stapel pa-fragen">
      {probleme.length > 0 && <div className="hinweis schlecht"><ul>{probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {/* Ein Paket, das sich nicht laden lässt, hält nur sich selbst und was es braucht auf (#646). */}
      {!!plan.ausgelassen?.length && (
        <div className="hinweis warn stapel" role="status">
          <p>{t('pakete.ablauf.ausgelassen')}</p>
          <ul>{plan.ausgelassen.map((a) => <li key={a.id}><strong>{a.name}</strong> {a.version}: {a.grund}</li>)}</ul>
          <div className="knoepfe"><button type="button" className="knopf" disabled={laeuft} onClick={() => void nochmal()}>{t('pakete.ablauf.ausgelassen.nochmal')}</button></div>
        </div>
      )}

      {plan.herkunftBestaetigen && (
        <section className="blatt stapel" aria-label={t('pakete.ablauf.herkunft')}>
          <h2 className="h3">{t('pakete.ablauf.herkunft')}</h2>
          <HerkunftZeile p={plan.herkunft} />
          <div className="hinweis warn" role="alert">
            <p>{t('pakete.ablauf.herkunft.text')}</p>
            <label className="haken"><input type="checkbox" checked={herkunftOk} onChange={(e) => setHerkunftOk(e.target.checked)} /><span>{t('pakete.ablauf.herkunft.ja')}</span></label>
          </div>
        </section>
      )}

      {mitCode.length > 0 && (
        <section className="blatt stapel" aria-label={t('pakete.ablauf.rechte')}>
          <h2 className="h3">{t('pakete.ablauf.rechte')} <Hilfe ort="werkbank.pakete.ablauf" /></h2>
          <p className="leise">{t('pakete.ablauf.rechte.text', { anzahl: mitCode.length })}</p>
          {mitCode.map((p) => (
            <div key={p.schluessel} className="pa-rechte">
              <h3 className="klein">{p.name} {p.version}{p.vorschau.paket.herausgeber && <span className="leise" title={t('werkbank.pakete.herausgeber')}> · {p.vorschau.paket.herausgeber}</span>}{!p.gewaehlt && p.fuer.length > 0 && <span className="leise"> – {t('pakete.ablauf.fuer', { namen: p.fuer.map((id) => pk.find((x) => x.id === id)?.name ?? id).join(', ') })}</span>}</h3>
              <ul className="klein">
                {p.vorschau.laeufer!.rechte.map((r) => (
                  <li key={r.text}>{r.text} <Hilfe ort={r.hilfe} />{r.unter && <ul>{r.unter.map((u) => <li key={u.text}>{u.text} <Hilfe ort={u.hilfe} /></li>)}</ul>}</li>
                ))}
              </ul>
              {!p.vorschau.laeufer!.bestaetigen && <p className="leise klein">{t('pakete.ablauf.rechte.gleich')}</p>}
            </div>
          ))}
          {mitCode.some((p) => p.vorschau.laeufer!.rechte.some((r) => r.hilfe === 'pakete.recht.adresse')) && <p className="klein">{t('pakete.ablauf.adresse.hinweis')}</p>}
          {plan.rechte.bestaetigen && (
            <div className="hinweis warn"><label className="haken"><input type="checkbox" checked={rechteOk} onChange={(e) => setRechteOk(e.target.checked)} /><span>{t('pakete.ablauf.rechte.ja')}</span></label></div>
          )}
        </section>
      )}

      {pk.some((p) => konfliktTypen(p).length || konfliktSichten(p).length) && (
        <section className="blatt stapel" aria-label={t('pakete.ablauf.namen')}>
          <h2 className="h3">{t('pakete.ablauf.namen')}</h2>
          <p className="leise">{t('pakete.ablauf.namen.text')}</p>
          {pk.filter((p) => konfliktTypen(p).length || konfliktSichten(p).length).map((p) => (
            <div key={p.schluessel} className="stapel">
              <h3 className="klein">{p.name}</h3>
              {konfliktTypen(p).map((x) => (
                <label key={x.schluessel} className="paketname"><span>{t('pakete.ablauf.namen.typ', { name: x.name })}</span>
                  <input value={namen[p.id]?.[x.schluessel] ?? ''} onChange={(e) => setNamen({ ...namen, [p.id]: { ...namen[p.id], [x.schluessel]: e.target.value } })} />
                  {(namen[p.id]?.[x.schluessel] ?? '').trim().toLowerCase() === x.name.toLowerCase() && <span className="fehlertext klein">{x.konflikt}</span>}
                </label>
              ))}
              {konfliktSichten(p).map((x) => (
                <label key={x.schluessel} className="paketname"><span>{t('pakete.ablauf.namen.sicht', { name: x.name })}</span>
                  <input value={sichtNamen[p.id]?.[x.schluessel] ?? ''} onChange={(e) => setSichtNamen({ ...sichtNamen, [p.id]: { ...sichtNamen[p.id], [x.schluessel]: e.target.value } })} />
                  {(sichtNamen[p.id]?.[x.schluessel] ?? '').trim().toLowerCase() === x.name.toLowerCase() && <span className="fehlertext klein">{x.konflikt}</span>}
                </label>
              ))}
            </div>
          ))}
        </section>
      )}

      {mitBeispielen.length > 0 && (
        <section className="blatt stapel" aria-label={t('pakete.ablauf.beispiele')}>
          <h2 className="h3">{t('pakete.ablauf.beispiele')}</h2>
          <label className="haken"><input type="checkbox" checked={beispiele} onChange={(e) => setBeispiele(e.target.checked)} />
            <span>{mitBeispielen.length === 1 ? t('pakete.ablauf.beispiele.eins', { anzahl: mitBeispielen[0].vorschau.beispiele, name: mitBeispielen[0].name }) : t('pakete.ablauf.beispiele.alle', { anzahl: mitBeispielen.length })}</span></label>
          {/* Beispiel-Dokumente (#878): wie viele und wie groß, damit niemand von 100 MB überrascht wird. */}
          {mitBeispielen.some((p) => p.vorschau.beispielDokumente?.anzahl) && <p className="leise klein">{t('pakete.ablauf.beispiele.dokumente', { anzahl: mitBeispielen.reduce((n, p) => n + (p.vorschau.beispielDokumente?.anzahl ?? 0), 0), mb: inMB(mitBeispielen.reduce((n, p) => n + (p.vorschau.beispielDokumente?.bytes ?? 0), 0)) })}</p>}
          {beispiele && mitBeispielen.length > 1 && (
            <details className="pa-je-paket">
              <summary className="klein">{t('pakete.ablauf.beispiele.je')}</summary>
              {mitBeispielen.map((p) => (
                <label key={p.schluessel} className="haken klein"><input type="checkbox" checked={!ohneBeispiele.includes(p.id)} onChange={(e) => setOhneBeispiele(e.target.checked ? ohneBeispiele.filter((x) => x !== p.id) : [...ohneBeispiele, p.id])} />
                  <span>{t('pakete.ablauf.beispiele.paket', { name: p.name, anzahl: p.vorschau.beispiele })}</span></label>
              ))}
            </details>
          )}
        </section>
      )}

      {mitAutomatisierungen.length > 0 && (
        <section className="blatt stapel" aria-label={t('pakete.ablauf.automatisierungen')}>
          <h2 className="h3">{t('pakete.ablauf.automatisierungen')}</h2>
          <p className="leise">{t('pakete.ablauf.automatisierungen.text')}</p>
          {mitAutomatisierungen.flatMap((p) => (p.vorschau.automatisierungen ?? []).filter((a) => a.neu).map((a) => {
            const k = `${p.id}|${a.schluessel}`;
            return (
              <label key={k} className="haken"><input type="checkbox" checked={!ohneAutomatisierung.includes(k)} onChange={(e) => setOhneAutomatisierung(e.target.checked ? ohneAutomatisierung.filter((x) => x !== k) : [...ohneAutomatisierung, k])} />
                <span>{a.name} <small className="leise">{t('pakete.ablauf.automatisierungen.paket', { name: p.name })}</small>{a.beschreibung && <small className="hilfe">{a.beschreibung}</small>}</span></label>
            );
          }))}
        </section>
      )}

      {mitEinstellungen.length > 0 && (
        <section className="blatt stapel" aria-label={t('pakete.ablauf.einstellungen')}>
          <h2 className="h3">{t('pakete.ablauf.einstellungen')}</h2>
          <p className="leise">{t('pakete.ablauf.einstellungen.text')}</p>
          {mitEinstellungen.map((p) => (
            <fieldset key={p.schluessel} className="pa-einstellungen stapel">
              <legend><strong>{p.name}</strong></legend>
              <label className="haken klein"><input type="checkbox" checked={spaeter.includes(p.id)} onChange={(e) => setSpaeter(e.target.checked ? [...spaeter, p.id] : spaeter.filter((x) => x !== p.id))} /><span>{t('pakete.ablauf.einstellungen.spaeter')}</span></label>
              {!spaeter.includes(p.id) && p.einstellungen.map((f: EinstellungFeld) => (
                <div key={f.schluessel}>
                  <Eingabe f={f} wert={werte[p.id]?.[f.schluessel]} fehler={fehler[`${p.id}.${f.schluessel}`]?.replace(`${p.name}: `, '')} auswahl={plan.auswahl} id={`pa-${p.id}-${f.schluessel}`}
                    setze={(v) => setWerte((w) => ({ ...w, [p.id]: { ...w[p.id], [f.schluessel]: v } }))} />
                  {f.typ === 'adresse' && f.beispiel && leer(werte[p.id]?.[f.schluessel]) && (
                    <button type="button" className="textknopf klein" onClick={() => setWerte((w) => ({ ...w, [p.id]: { ...w[p.id], [f.schluessel]: f.beispiel } }))}>{t('pakete.ablauf.einstellungen.beispiel', { beispiel: f.beispiel })}</button>
                  )}
                </div>
              ))}
              {spaeter.includes(p.id) && <p className="leise klein">{t('pakete.ablauf.einstellungen.spaeter.text')}</p>}
            </fieldset>
          ))}
          {adressen.length > 0 && (
            <div className="hinweis warn"><label className="haken"><input type="checkbox" checked={adresseOk} onChange={(e) => setAdresseOk(e.target.checked)} />
              <span>{t('pakete.ablauf.adresse.ja', { adressen: adressen.map((a) => `${a.paket} → ${a.wert}`).join(', ') })}</span></label></div>
          )}
        </section>
      )}

      <section className="blatt stapel" aria-label={t('pakete.ablauf.zusammenfassung')}>
        <h2 className="h3">{t('pakete.ablauf.zusammenfassung')}</h2>
        <p>{[
          t('pakete.ablauf.summe.pakete', { anzahl: pk.length }),
          pk.some((p) => !p.gewaehlt) ? t('pakete.ablauf.summe.abh', { anzahl: pk.filter((p) => !p.gewaehlt).length }) : '',
          updates.length ? t('pakete.ablauf.summe.updates', { anzahl: updates.length }) : '',
          neueTypen ? t('pakete.ablauf.summe.typen', { anzahl: neueTypen }) : '',
          neueSichten ? t('pakete.ablauf.summe.sichten', { anzahl: neueSichten }) : '',
          beispielPakete.length ? t('pakete.ablauf.summe.beispiele', { anzahl: beispielPakete.length }) : '',
          anzahlAn ? t('pakete.ablauf.summe.automatisierungen', { anzahl: anzahlAn }) : '',
          mitCode.length ? t('pakete.ablauf.summe.code', { anzahl: mitCode.length }) : '',
          spaeter.length ? t('pakete.ablauf.summe.spaeter', { anzahl: spaeter.length }) : '',
        ].filter(Boolean).join(' · ')}</p>
        <ol className="pa-reihe klein">
          {pk.map((p) => (
            <li key={p.schluessel}><strong>{p.name}</strong> {p.version}{p.vorschau.paket.herausgeber ? ` · ${p.vorschau.paket.herausgeber}` : ''}{p.vorschau.update ? ` (${t('pakete.ablauf.update', { version: p.vorschau.installiert ?? '' })})` : ''}
              {!p.gewaehlt && p.fuer.length > 0 && <span className="leise"> – {t('pakete.ablauf.fuer', { namen: p.fuer.map((id) => pk.find((x) => x.id === id)?.name ?? id).join(', ') })}</span>}
              {p.ergaenzt && <span className="leise"> – {t('pakete.ablauf.ergaenzt', { name: pk.find((x) => x.id === p.ergaenzt!.paket)?.name ?? p.ergaenzt.paket })}</span>}
              {p.vorschau.hinweise.length > 0 && <ul className="leise">{p.vorschau.hinweise.map((h) => <li key={h}>{h}</li>)}</ul>}
            </li>
          ))}
        </ol>
        {meldung && <div className="hinweis schlecht" role="status"><p>{meldung.text}</p>{!!meldung.gruende?.length && <ul>{meldung.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}</div>}
        {fehlt.length > 0 && !probleme.length && <ul className="leise klein">{fehlt.map((f) => <li key={f}>{f}</li>)}</ul>}
        <div className="knoepfe">
          <button type="button" className="knopf primaer" disabled={laeuft || probleme.length > 0 || fehlt.length > 0} onClick={() => void installieren()}>
            {sammeln ? t('einrichtung.pakete.uebernehmen', { anzahl: pk.length }) : laeuft ? t('pakete.ablauf.installiere') : t('pakete.ablauf.installieren', { anzahl: pk.length })}
          </button>
          <button type="button" className="textknopf" disabled={laeuft} onClick={zurueck}>{t('pakete.ablauf.zurueck')}</button>
        </div>
      </section>
    </div>
  );
}

/** Was installiert ist, was nicht – und was noch Einstellungen braucht. */
export function AblaufErgebnisAnsicht({ e, weiter }: { e: AblaufErgebnis; weiter(): void }) {
  const spaeter = e.installiert.filter((x) => x.einstellungen === 'spaeter' || x.einstellungen === 'fehler');
  return (
    <div className="stapel">
      {e.installiert.length > 0 && (
        <div className="hinweis gut" role="status">
          <p><strong>{t('pakete.ablauf.ergebnis.installiert')}</strong> {e.installiert.map((x) => `${x.name} ${x.version}`).join(', ')}.</p>
          {spaeter.length > 0 && <p>{t('pakete.ablauf.ergebnis.spaeter')} {spaeter.map((x, i) => <span key={x.id}>{i > 0 && ', '}<Link to={`/werkbank/pakete/${x.id}?reiter=einstellungen`} className="verweis">{x.name}</Link></span>)}.</p>}
        </div>
      )}
      {/* Zusammenfassung (#646): jedes gescheiterte Paket mit Grund, übersprungene mit Grund, Weg zum Nachholen. */}
      {(e.fehlgeschlagen ?? (e.fehler ? [e.fehler] : [])).map((f) => (
        <div key={f.id} className="hinweis schlecht stapel" role="alert">
          <p><strong>{t('pakete.ablauf.ergebnis.fehler', { name: f.name })}</strong> {f.meldung}</p>
          {f.gruende.length > 0 && <ul>{f.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}
          <p>{t('pakete.ablauf.ergebnis.zurueck')}</p>
        </div>
      ))}
      {e.nichtInstalliert.length > 0 && (
        <div className="hinweis warn stapel" role="status">
          <p><strong>{t('pakete.ablauf.ergebnis.nicht')}</strong></p>
          <ul>{e.nichtInstalliert.map((x) => <li key={x.id}><strong>{x.name}</strong> {x.version}{x.grund ? `: ${x.grund}` : ''}</li>)}</ul>
        </div>
      )}
      {(e.nichtInstalliert.length > 0 || !!e.fehler) && <p className="leise">{t('pakete.ablauf.ergebnis.nachholen')} <Link to="/werkbank/pakete" className="verweis">{t('werkbank.paketablauf.werkbank-pakete')}</Link></p>}
      {!e.installiert.length && !e.fehler && !e.nichtInstalliert.length && <p className="leise">{t('pakete.ablauf.ergebnis.nichts')}</p>}
      <div className="knoepfe"><button type="button" className="knopf primaer" onClick={weiter}>{t('pakete.ablauf.ergebnis.weiter')}</button></div>
    </div>
  );
}
