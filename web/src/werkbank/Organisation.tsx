import { useCallback, useEffect, useState } from 'react';
import type { Merkmale } from '../../../shared/src/merkmale';
import { VORLAGEN, vorlageFuer } from '../../../shared/src/werkbankansicht';
import { anschriftZeilen, anzeigename, neueNotizen, type Angaben, type EigeneOrganisation, type OrganisationStand, type Stelle, type Verwendung } from '../../../shared/src/organisation';
import { zeitText } from '../../../shared/src/region';
import { werkbankApi } from '../api/werkbank';
import { Feld, HakenFeld, Knopf, KnopfLink, Mehrfachauswahl } from '../bausteine';
import { useDaten } from '../daten';
import { useKonto } from '../konto';
import { Link } from '../ort';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';
import { Kopf } from './Kopf';

/**
 * Werkbank → Einstellungen → Eigene Organisation (#995, seit #1170 unter Einstellungen): oben die Nutzung der Ablage
 * (#1032, Haken „auch beruflich genutzt“), darunter ein schlanker Verweis auf die Organisation(en) mit dem
 * Merkmal „eigene Organisation“ in der Ablage. Ohne „beruflich“ bleibt dieser Teil sichtbar, aber blass: Ablago verwendet
 * eine trotzdem gespeicherte eigene Organisation dann nicht (Auskünfte, Briefkopf, Erkennung) – gelöscht wird nichts. Gezeigt wird nur die feste Liste (Name, Anschrift, E-Mail, Telefon,
 * Verantwortlicher, Datenschutzbeauftragter) – auch wer die Mappe selbst nicht sehen darf, sieht nicht mehr. Ändern
 * lassen sich hier nur die Wahl „für Auskünfte und Unterlagen gilt …“ und die Rollen, die das Merkmal setzen dürfen.
 */
export function useOrganisation(offen: boolean) {
  const [stand, setStand] = useState<OrganisationStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await werkbankApi.organisation()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, setStand, laden };
}
export type OrganisationZustand = ReturnType<typeof useOrganisation>;

/**
 * Merkmale der Ablage (#1032): „beruflich genutzt“. Ändern darf nur „Gesamte Verwaltung“ (der Server lehnt es sonst ab);
 * Mappentypen zeigen damit ihre beruflichen Felder und Abschnitte, die Werkbank-Vorlage folgt, solange sie nicht angepasst ist.
 */
export function useNutzung(offen: boolean) {
  const [stand, setStand] = useState<Merkmale | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await werkbankApi.merkmale()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { if (offen) void laden(); }, [offen, laden]);
  return { stand, fehler, setStand };
}
export type NutzungZustand = ReturnType<typeof useNutzung>;

/** Nutzung (#1032, seit #1170 oben auf dieser Seite): der Haken „auch beruflich genutzt“. Ändern nur mit Gesamter Verwaltung. */
function NutzungAbschnitt({ beruflich, setze, organisationen }: { beruflich: boolean; setze(an: boolean): void; organisationen: EigeneOrganisation[] }) {
  const gesamt = useKonto().verwaltungsmodus.bereiche === null;
  const namen = organisationen.map((o) => anzeigename(o.angaben) || t('werkbank.organisation.ohne-name')).join(', ');
  return (
    <section className="blatt" id="nutzung">
      <HakenFeld beschriftung={t('werkbank.nutzung.beruflich')} hilfe="werkbank.nutzung"
        hinweis={[t('werkbank.nutzung.beruflich.hinweis'), ...(gesamt ? [] : [t('werkbank.nutzung.nur-gesamt')]), t('werkbank.nutzung.ordnung')]}>
        <input id="nutzung-beruflich" type="checkbox" checked={beruflich} disabled={!gesamt} onChange={(x) => setze(x.target.checked)} />
      </HakenFeld>
      <p className="leise klein">{t('werkbank.nutzung.vorlage', { vorlage: VORLAGEN[vorlageFuer({ beruflich })].name })}</p>
      {/* Beim Ausschalten (#1170): nichts wird gelöscht, die eigene Organisation bleibt gespeichert. */}
      {!beruflich && organisationen.length > 0 && <p className="hinweis warn klein" role="status">{t('werkbank.nutzung.bleibt', { name: namen })}</p>}
    </section>
  );
}

/** Angaben einer Stelle in Zeilen: Anschrift, E-Mail, Telefon. */
function AngabenBlock({ a }: { a: Angaben }) {
  const zeilen = anschriftZeilen(a);
  return (
    <>
      {zeilen.map((z, i) => <span key={i} className="zeile">{i === 0 ? <strong>{z}</strong> : z}</span>)}
      {a.email && <span className="zeile">{t('werkbank.organisation.email', { wert: a.email })}</span>}
      {a.telefon && <span className="zeile">{t('werkbank.organisation.telefon', { wert: a.telefon })}</span>}
    </>
  );
}

function stelleText(s: Stelle | null | undefined): string {
  return s ? anzeigename(s.angaben) || t('werkbank.organisation.ohne-name') : '';
}

function Karte({ o, mehrere, geltend }: { o: EigeneOrganisation; mehrere: boolean; geltend: boolean }) {
  const v = o.verantwortlicher;
  const verantwortlich = !v ? t('werkbank.organisation.verantwortlicher-unbekannt') : 'selbst' in v ? t('werkbank.organisation.selbst') : stelleText(v);
  return (
    <section className="blatt organisation-karte" data-anker={`organisation:${o.mappeId}`}>
      <p className="organisation-anschrift">
        {anschriftZeilen(o.angaben).length || o.angaben.email || o.angaben.telefon ? <AngabenBlock a={o.angaben} /> : <span className="leise">{t('werkbank.organisation.ohne-angaben')}</span>}
      </p>
      {mehrere && geltend && <p><span className="chip gut">{t('werkbank.organisation.gilt')}</span></p>}
      <dl className="eigenschaften">
        <dt>{t('werkbank.organisation.verantwortlicher')}</dt>
        <dd>{verantwortlich}</dd>
        <dt>{t('werkbank.organisation.datenschutzbeauftragter')}</dt>
        <dd>{o.datenschutzbeauftragter ? stelleText(o.datenschutzbeauftragter) : <span className="leise">{t('werkbank.organisation.keiner')}</span>}</dd>
      </dl>
      <KnopfLink to={`/ablage/${o.typId}/${o.mappeId}`} anker="organisation.bearbeiten">{t('werkbank.organisation.bearbeiten')}</KnopfLink>
    </section>
  );
}

function verwendungText(v: Verwendung): string {
  if (v.art === 'anzeige') return t('werkbank.organisation.verwendung.anzeige', { typ: v.typ });
  if (v.art === 'auskunft') return t('werkbank.organisation.verwendung.auskunft');
  if (v.art === 'loeschkonzept') return t('werkbank.organisation.verwendung.loeschkonzept');
  if (v.art === 'briefkopf') return t('werkbank.organisation.verwendung.briefkopf');
  return t('werkbank.organisation.verwendung.erkennung');
}

/** Notizen an die Verwaltung (Ergänzung Sicherheit): was sich seit dem letzten Blick geändert hat. */
function Notizen({ neu, gesehen }: { neu: OrganisationStand['einstellung']['notizen']; gesehen(): Promise<void> }) {
  return (
    <div className="hinweis warn" data-anker="organisation.notizen">
      <p><strong>{t('werkbank.organisation.notizen.titel')}</strong></p>
      <ul>{neu.map((n, i) => <li key={i}>{t('werkbank.organisation.notizen.zeile', { wann: zeitText(new Date(n.am), { dateStyle: 'short', timeStyle: 'short' }), name: n.titel || '–', was: t.frei(`werkbank.organisation.notiz.${n.was}`), von: n.von })}</li>)}</ul>
      <Knopf onClick={gesehen}>{t('werkbank.organisation.notizen.gesehen')}</Knopf>
    </div>
  );
}

/** Ohne Paket Basis bzw. ohne eigene Organisation: was zu tun ist. */
function OhneOrganisation({ s }: { s: OrganisationStand }) {
  if (!s.typen.length) return (
    <div className="hinweis info">
      <p>{t('werkbank.organisation.ohne-basis')}</p>
      <KnopfLink to="/werkbank/pakete">{t('werkbank.organisation.zu-paketen')}</KnopfLink>
    </div>
  );
  if (s.organisationen.length) return null;
  return (
    <div className="hinweis info">
      <p>{t('werkbank.organisation.keine', { typ: s.typen[0].name, feld: s.typen[0].feld })}</p>
      <KnopfLink to={`/ablage/${s.typen[0].id}`}>{t('werkbank.organisation.zur-ablage', { typ: s.typen[0].name })}</KnopfLink>
    </div>
  );
}

/** Bisherige Angabe der Auskunft (Text) – mit „Als eigene Organisation anlegen“, solange es keine gibt. */
function Bisher({ s, uebernehmen }: { s: OrganisationStand; uebernehmen(): Promise<void> }) {
  return (
    <section className="blatt" data-anker="organisation.bisher">
      <h2>{t('werkbank.organisation.bisher.titel')}</h2>
      <p className="leise">{s.organisationen.length ? t('werkbank.organisation.bisher.ersetzt') : t('werkbank.organisation.bisher.text')}</p>
      <pre className="mehrzeilig">{s.bisher}</pre>
      {!s.organisationen.length && s.typen.length > 0 && <Knopf art="haupt" onClick={uebernehmen}>{t('werkbank.organisation.bisher.uebernehmen')}</Knopf>}
    </section>
  );
}

/** Was diese Seite speichert (#1182: eine Speicherleiste für alles): Nutzung, „gilt für …“, freigegebene Rollen. */
interface Entwurf { beruflich: boolean; auskunft: string; rollen: string[] }
const entwurfAus = (s: OrganisationStand, m: Merkmale): Entwurf => ({ beruflich: m.beruflich, auskunft: s.einstellung.auskunft ?? '', rollen: [...s.einstellung.rollen].sort() });

/**
 * Rollen, die das Merkmal setzen dürfen (#1182): Verweisfeld mit Mehrfachauswahl wie in den Mappen statt Haken; darunter,
 * wer es ohnehin darf, und der Weg zu den Rollen.
 */
function RollenWahl({ rollen, gewaehlt, setze }: { rollen: OrganisationStand['rollen']; gewaehlt: string[]; setze(ids: string[]): void }) {
  const d = useDaten();
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const q = eingabe.trim().toLocaleLowerCase('de');
  const name = (id: string) => rollen.find((r) => r.id === id)?.name ?? id;
  const rollenTyp = d.typen.find((x) => x.system === 'rolle');
  return (
    <Feld beschriftung={t('werkbank.organisation.rollen.titel')} id="organisation-rollen" anker="organisation.rollen"
      hinweis={[t('werkbank.organisation.rollen.text'), <>{t('werkbank.organisation.rollen.immer')}{rollenTyp && <> <Link to={`/ablage/${rollenTyp.id}`} className="verweis">{t('werkbank.organisation.rollen.verwalten')}</Link></>}</>]}>
      {(v) => (
        <Mehrfachauswahl id={v.id} name={t('werkbank.organisation.rollen.titel')} platzhalter={t('werkbank.organisation.rollen.suchen')}
          eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen}
          vorschlaege={rollen.filter((r) => !gewaehlt.includes(r.id) && (!q || r.name.toLocaleLowerCase('de').includes(q))).map((r) => ({ id: r.id, text: r.name }))}
          leerText={rollen.length ? t('werkbank.organisation.rollen.alle') : t('werkbank.organisation.rollen.keine')}
          waehle={(id) => { setze([...gewaehlt, id].sort()); setEingabe(''); }}
          gewaehlt={gewaehlt.map((id) => ({ id, inhalt: name(id), entfernenText: t('werkbank.organisation.rollen.entfernen', { name: name(id) }) }))}
          entferne={(id) => setze(gewaehlt.filter((x) => x !== id))} />
      )}
    </Feld>
  );
}

/** „Wo Ablago diese Angaben verwendet“ (#1182): jede Stelle mit Bereich in der Werkbank als Link dorthin. */
function verwendungZiel(v: Verwendung): string | null {
  if (v.art === 'anzeige') return `/werkbank/typen/${v.typId}`;
  if (v.art === 'auskunft') return '/werkbank/auskuenfte';
  if (v.art === 'loeschkonzept') return '/werkbank/loeschkonzept';
  return null;
}

export function OrganisationPanel({ z, nutzung }: { z: OrganisationZustand; nutzung: NutzungZustand }) {
  const d = useDaten();
  const s = z.stand;
  const m = nutzung.stand;
  const gespeichert = s && m ? entwurfAus(s, m) : null;
  const [e, setE] = useState<Entwurf | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  const [sendet, setSendet] = useState(false);
  useEffect(() => { if (gespeichert && !e) setE(gespeichert); }, [gespeichert, e]);
  const ent = useEntwurf(gespeichert, e, { aus: !e, zuruecksetzen: () => { setE(gespeichert); setMeldung(undefined); } });
  if (!s || !m || !e || !gespeichert) {
    const fehler = z.fehler ?? nutzung.fehler;
    return fehler ? <div className="hinweis schlecht"><p>{fehler}</p></div> : <p className="leise">{t('werkbank.organisation.lade')}</p>;
  }
  const mehrere = s.organisationen.length > 1;
  const neu = neueNotizen(s.einstellung);
  // Gespeichertes Merkmal, nicht der Entwurf: blass ist, was Ablago gerade nicht verwendet.
  const beruflich = m.beruflich;
  async function speichern() {
    const g = gespeichert!; const x = e!;
    setSendet(true); setMeldung(undefined);
    try {
      const org: Record<string, unknown> = {};
      if (x.auskunft !== g.auskunft) org.auskunft = x.auskunft || null;
      if (x.rollen.join(',') !== g.rollen.join(',')) org.rollen = x.rollen;
      const stand = Object.keys(org).length ? await werkbankApi.setzeOrganisation(org) : s!;
      const merkmale = x.beruflich !== g.beruflich ? await werkbankApi.setzeMerkmale({ beruflich: x.beruflich }) : m!;
      z.setStand(stand); nutzung.setStand(merkmale); setE(entwurfAus(stand, merkmale));
      // Formulare der Ablage zeigen gleich, was jetzt dazugehört.
      if (x.beruflich !== g.beruflich) await d.neuLaden();
      setMeldung({ art: 'gut', text: x.beruflich !== g.beruflich ? t('werkbank.nutzung.gespeichert') : t('werkbank.organisation.gespeichert') });
    } catch (f) { setMeldung({ art: 'schlecht', text: (f as Error).message }); } finally { setSendet(false); }
  }
  async function notizenGesehen() {
    try { z.setStand(await werkbankApi.setzeOrganisation({ gesehen: true })); setMeldung({ art: 'gut', text: t('werkbank.organisation.notizen.gesehen-ok') }); } catch (f) { setMeldung({ art: 'schlecht', text: (f as Error).message }); }
  }
  async function uebernehmen() {
    try { z.setStand(await werkbankApi.organisationUebernehmen()); await d.neuLaden(); setMeldung({ art: 'gut', text: t('werkbank.organisation.uebernommen') }); } catch (f) { setMeldung({ art: 'schlecht', text: (f as Error).message }); }
  }
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.bereich.organisation.name')} hilfe="werkbank.organisation">
        <p className="leise">{t('werkbank.organisation.einleitung')}</p>
      </Kopf>
      {neu.length > 0 && <Notizen neu={neu} gesehen={notizenGesehen} />}
      <form className="stapel" id="organisation-formular" onSubmit={(x) => { x.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
        <NutzungAbschnitt beruflich={e.beruflich} setze={(an) => setE({ ...e, beruflich: an })} organisationen={s.organisationen} />
        {/* Ohne „beruflich“ sichtbar, aber blass (#1170) – nicht aus- und eingeblendet. */}
        <div className={`stapel${beruflich ? '' : ' organisation-blass'}`} id="eigene-organisation">
          {!beruflich && <p className="leise">{t('werkbank.organisation.nur-beruflich')}</p>}
          <OhneOrganisation s={s} />
          {s.organisationen.map((o) => <Karte key={o.mappeId} o={o} mehrere={mehrere} geltend={s.geltend === o.mappeId} />)}
          {s.bisher.trim() && <Bisher s={s} uebernehmen={uebernehmen} />}
          {/* Kompakt (#1182): Wahl und Rollen als normale Felder in einem Blatt, gespeichert mit der Leiste unten. */}
          <section className="blatt stapel" id="organisation-einstellungen">
            {mehrere && (
              <Feld beschriftung={t('werkbank.organisation.gilt-fuer')} hinweis={s.geltend ? undefined : t('werkbank.organisation.bitte-waehlen')}>
                <select value={e.auskunft} onChange={(x) => setE({ ...e, auskunft: x.target.value })}>
                  <option value="">{t('werkbank.organisation.keine-wahl')}</option>
                  {s.organisationen.map((o) => <option key={o.mappeId} value={o.mappeId}>{anzeigename(o.angaben) || t('werkbank.organisation.ohne-name')}</option>)}
                </select>
              </Feld>
            )}
            <RollenWahl rollen={s.rollen} gewaehlt={e.rollen} setze={(rollen) => setE({ ...e, rollen })} />
          </section>
          <section className="blatt">
            <h2 className="h3">{t('werkbank.organisation.verwendung.titel')}</h2>
            <ul>{s.verwendungen.map((v, i) => { const ziel = verwendungZiel(v); return <li key={i}>{ziel ? <Link to={ziel} className="verweis">{verwendungText(v)}</Link> : verwendungText(v)}</li>; })}</ul>
            <p className="leise klein">{t('werkbank.organisation.nur-liste')}</p>
          </section>
          <p className="leise klein">{t('werkbank.organisation.keine-rechtsberatung')}</p>
        </div>
        <Speicherleiste ent={ent} gegenstand={t('werkbank.bereich.organisation.name')} sendet={sendet} meldung={meldung} />
      </form>
    </div>
  );
}
