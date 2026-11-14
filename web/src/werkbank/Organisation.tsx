import { useCallback, useEffect, useState } from 'react';
import { anschriftZeilen, anzeigename, neueNotizen, type Angaben, type EigeneOrganisation, type OrganisationStand, type Stelle, type Verwendung } from '../../../shared/src/organisation';
import { zeitText } from '../../../shared/src/region';
import { werkbankApi } from '../api/werkbank';
import { Feld, HakenFeld, Knopf, KnopfLink } from '../bausteine';
import { useDaten } from '../daten';
import { Link } from '../ort';
import { t } from '../sprache';
import { Kopf } from './Kopf';

/**
 * Werkbank → Benutzer und Sicherheit → Eigene Organisation (#995): ein schlanker Verweis auf die Organisation(en) mit dem
 * Merkmal „eigene Organisation“ in der Ablage. Gezeigt wird nur die feste Liste (Name, Anschrift, E-Mail, Telefon,
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

export function OrganisationPanel({ z }: { z: OrganisationZustand }) {
  const d = useDaten();
  const s = z.stand;
  const [auswahl, setAuswahl] = useState<string>('');
  const [rollen, setRollen] = useState<string[] | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { if (s) { setAuswahl(s.einstellung.auskunft ?? ''); setRollen(s.einstellung.rollen); } }, [s]);
  if (!s || rollen === null) return z.fehler ? <div className="hinweis schlecht"><p>{z.fehler}</p></div> : <p className="leise">{t('werkbank.organisation.lade')}</p>;
  const mehrere = s.organisationen.length > 1;
  const neu = neueNotizen(s.einstellung);
  async function setze(e: Record<string, unknown>, text: string) {
    try { z.setStand(await werkbankApi.setzeOrganisation(e)); setMeldung({ art: 'gut', text }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  async function uebernehmen() {
    try { z.setStand(await werkbankApi.organisationUebernehmen()); await d.neuLaden(); setMeldung({ art: 'gut', text: t('werkbank.organisation.uebernommen') }); } catch (x) { setMeldung({ art: 'schlecht', text: (x as Error).message }); }
  }
  return (
    <div className="einspaltig">
      <Kopf titel={t('werkbank.bereich.organisation.name')} hilfe="werkbank.organisation">
        <p className="leise">{t('werkbank.organisation.einleitung')}</p>
      </Kopf>
      {meldung && <div className={`hinweis ${meldung.art}`} role="status"><p>{meldung.text}</p></div>}
      {neu.length > 0 && <Notizen neu={neu} gesehen={() => setze({ gesehen: true }, t('werkbank.organisation.notizen.gesehen-ok'))} />}
      {!s.typen.length && (
        <div className="hinweis info">
          <p>{t('werkbank.organisation.ohne-basis')}</p>
          <KnopfLink to="/werkbank/pakete">{t('werkbank.organisation.zu-paketen')}</KnopfLink>
        </div>
      )}
      {s.typen.length > 0 && !s.organisationen.length && (
        <div className="hinweis info">
          <p>{t('werkbank.organisation.keine', { typ: s.typen[0].name, feld: s.typen[0].feld })}</p>
          <KnopfLink to={`/ablage/${s.typen[0].id}`}>{t('werkbank.organisation.zur-ablage', { typ: s.typen[0].name })}</KnopfLink>
        </div>
      )}
      {s.organisationen.map((o) => <Karte key={o.mappeId} o={o} mehrere={mehrere} geltend={s.geltend === o.mappeId} />)}
      {mehrere && (
        <section className="blatt">
          <Feld beschriftung={t('werkbank.organisation.gilt-fuer')} hinweis={s.geltend ? undefined : t('werkbank.organisation.bitte-waehlen')}>
            <select value={auswahl} onChange={(x) => setAuswahl(x.target.value)}>
              <option value="">{t('werkbank.organisation.keine-wahl')}</option>
              {s.organisationen.map((o) => <option key={o.mappeId} value={o.mappeId}>{anzeigename(o.angaben) || t('werkbank.organisation.ohne-name')}</option>)}
            </select>
          </Feld>
          <Knopf art="haupt" onClick={() => setze({ auskunft: auswahl || null }, t('werkbank.organisation.gespeichert'))} gesperrt={auswahl === (s.einstellung.auskunft ?? '')}>{t('werkbank.organisation.speichern')}</Knopf>
        </section>
      )}
      {s.bisher.trim() && (
        <section className="blatt" data-anker="organisation.bisher">
          <h2>{t('werkbank.organisation.bisher.titel')}</h2>
          <p className="leise">{s.organisationen.length ? t('werkbank.organisation.bisher.ersetzt') : t('werkbank.organisation.bisher.text')}</p>
          <pre className="mehrzeilig">{s.bisher}</pre>
          {!s.organisationen.length && s.typen.length > 0 && <Knopf art="haupt" onClick={uebernehmen}>{t('werkbank.organisation.bisher.uebernehmen')}</Knopf>}
        </section>
      )}
      <section className="blatt">
        <h2>{t('werkbank.organisation.rollen.titel')}</h2>
        <p className="leise">{t('werkbank.organisation.rollen.text')}</p>
        {s.rollen.length ? s.rollen.map((r) => (
          <HakenFeld key={r.id} beschriftung={r.name}>
            <input type="checkbox" checked={rollen.includes(r.id)} onChange={(x) => setRollen(x.target.checked ? [...rollen, r.id] : rollen.filter((y) => y !== r.id))} />
          </HakenFeld>
        )) : <p className="leise">{t('werkbank.organisation.rollen.keine')}</p>}
        {s.rollen.length > 0 && <Knopf onClick={() => setze({ rollen }, t('werkbank.organisation.gespeichert'))} gesperrt={[...rollen].sort().join(',') === [...s.einstellung.rollen].sort().join(',')}>{t('werkbank.organisation.speichern')}</Knopf>}
      </section>
      <section className="blatt">
        <h2>{t('werkbank.organisation.verwendung.titel')}</h2>
        <ul>{s.verwendungen.map((v, i) => <li key={i}>{v.art === 'anzeige' ? <Link to={`/werkbank/typen/${v.typId}`} className="verweis">{verwendungText(v)}</Link> : verwendungText(v)}</li>)}</ul>
        <p className="leise klein">{t('werkbank.organisation.nur-liste')}</p>
      </section>
      <p className="leise klein">{t('werkbank.organisation.keine-rechtsberatung')}</p>
    </div>
  );
}
