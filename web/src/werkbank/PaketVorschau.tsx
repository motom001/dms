import { useEffect, useState } from 'react';
import { Feld, HakenFeld, Knopf } from '../bausteine';
import { inMB, legtEtwasAn, vorausgewaehlt } from '../../../shared/src/pakete';
import { api, ApiFehler, type PaketVorschau } from '../api';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto';
import { AktionenVorschau } from './PaketAktionen';
import { NamenskonfliktHinweis } from './Namenskonflikt';
import { UmbauVorschau, umbauStart, type UmbauStand } from './PaketUmbau';
import { hatGesamt } from '../../../shared/src/verwaltungsrecht';
import type { UmbauEntscheidungen } from '../../../shared/src/umbau';
import { t as tx, t, tn } from '../sprache';
import { AutomatisierungenSchalter, GeaenderteAutomatisierungen } from './PaketAutomatisierungen';
import { istKernVorlage, kernVorlage } from '../../../shared/src/ablaufvorlagen';
import { HerkunftZeile } from './Herkunft';
import { MitkommtAufklappen } from './PaketMitkommt';
import { sprachname } from '../../../shared/src/beschriftung';
import { MITMACHEN_URL } from '../../../shared/src/sprachwahl';
import type { VorgabePlan } from '../../../shared/src/vorgaben';

/**
 * Vorschau eines Pakets vor dem Installieren bzw. Aktualisieren (aus Pakete.tsx, #1168): mit eigenen Knöpfen oder – für
 * „Alle aktualisieren“ – ohne, dann meldet sie ihre Antworten. Dazu Meldungen und der Herausgeber neben dem Namen.
 */

/** Ergebnis einer Aktion mit ggf. Gründen. */
export type Meldung = { art: 'gut' | 'schlecht'; text: string; gruende?: string[] };
export const alsMeldung = (e: unknown): Meldung => ({ art: 'schlecht', text: (e as Error).message, gruende: e instanceof ApiFehler ? e.gruende : [] });

export function MeldungBox({ m }: { m?: Meldung }) {
  return m ? <div className={`hinweis ${m.art}`} role="status"><p>{m.text}</p>{!!m.gruende?.length && <ul>{m.gruende.map((g) => <li key={g}>{g}</li>)}</ul>}</div> : null;
}

/** Antworten einer Vorschau – was Installieren bzw. Aktualisieren braucht; sichern: vor dem Umbau eine Sicherung (#702). */
export interface VorschauAntwort {
  namen: Record<string, string>; sichtNamen: Record<string, string>; beispiele: boolean; mitAbhaengigkeiten: boolean; automatisierungen: string[];
  rechteBestaetigt?: boolean; bestaetigt?: boolean; herausgeberBestaetigt?: boolean;
  umbauBestaetigt?: boolean; umbauEntscheidungen?: UmbauEntscheidungen; sichtenErsetzen?: string[]; sichern?: boolean;
}

/** „Vorher sichern“ (#702): eine Sicherung starten und abwarten. Liefert den Fehler oder null; scheitert sie, kein Umbau. */
export async function sicherungVorher(): Promise<string | null> {
  try {
    let lauf: Awaited<ReturnType<typeof api.sicherungLauf>> = await api.sicherungJetzt();
    while (lauf?.status === 'laeuft') { await new Promise((r) => setTimeout(r, 1500)); lauf = await api.sicherungLauf(); }
    return lauf?.status === 'fehler' ? t('pakete.umbau.vorschau.sicherung-fehler', { fehler: lauf.fehler ?? '' }) : null;
  } catch (e) { return t('pakete.umbau.vorschau.sicherung-fehler', { fehler: (e as Error).message }); }
}

/**
 * Vorschau mit Namen, Abhängigkeiten und Beispielen. Bei Paketen außerhalb des offiziellen
 * Katalogs (#189) eine deutliche Warnung, die man ausdrücklich bestätigen muss.
 * Auch im Einrichtungsassistenten und für Sammeldateien (#460, #461): je Paket ein Block, eigene Überschrift
 * und „Auslassen“ statt „Abbrechen“.
 */
export function VorschauBlock({ v, warnung, los, abbrechen, melde, ohne = [], titel, abbrechenText = t('werkbank.pakete.abbrechen'), herkunftBestaetigt = false }: {
  v: PaketVorschau; warnung: string | null; titel?: string; abbrechenText?: string;
  /** Herkunft schon vorher bestätigt (Sammeldatei): kein zweiter Haken. */
  herkunftBestaetigt?: boolean;
  /** Mit eigenen Knöpfen: Installieren bzw. Aktualisieren und Abbrechen. */
  los?(x: VorschauAntwort): Promise<void>;
  abbrechen?(): void;
  /**
   * Ohne eigene Knöpfe (#1168, „Alle aktualisieren“): meldet die Antworten bei jeder Änderung – null, solange etwas fehlt
   * (Bestätigung, Name, Problem). Die Funktion muss gleich bleiben (useCallback), sonst meldet der Block bei jedem Zeichnen.
   */
  melde?(x: VorschauAntwort | null): void;
  /** Einträge aus `probleme`, die hier nicht zählen (#1168: Abhängigkeit, die dieselbe Runde vorher aktualisiert). */
  ohne?: string[];
}) {
  // Mitgelieferte Automatisierungen (#712): abgewählte bleiben aus. Vorausgewählt (#1082): die mit eingeschaltet: true –
  // nennt das Paket das nirgends, wie bisher alle.
  const neueAutos = (v.automatisierungen ?? []).filter((a) => a.neu);
  const [ohneAuto, setOhneAuto] = useState<string[]>(() => { const an = vorausgewaehlt(v.automatisierungen ?? []); return neueAutos.filter((a) => !an.includes(a.schluessel)).map((a) => a.schluessel); });
  const [namen, setNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.typen.filter((eintrag) => !eintrag.vorhanden).map((eintrag) => [eintrag.schluessel, eintrag.vorschlag ?? eintrag.name])));
  const [sichtNamen, setSichtNamen] = useState<Record<string, string>>(() => Object.fromEntries(v.sichten.filter((s) => !s.vorhanden && !s.ausgelassen).map((s) => [s.schluessel, s.vorschlag ?? s.name])));
  // Ansichten (#1125): geänderte bzw. vor #1125 installierte bleiben – außer, sie sind hier angehakt.
  const [ersetzen, setErsetzen] = useState<string[]>([]);
  const [beispiele, setBeispiele] = useState(false);
  const [mit, setMit] = useState(true);
  const [ok, setOk] = useState(false);
  const [rechteOk, setRechteOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const rechteFehlen = !!v.laeufer?.bestaetigen && !rechteOk;
  // Erstmals ein Herausgeber an einem Bestandspaket (#1084): eigener Haken, sonst kein Update.
  const [herausgeberOk, setHerausgeberOk] = useState(false);
  const herausgeberFehlt = !!v.herausgeberBestaetigen && !herausgeberOk;
  // Umbau (#1041): Rückfragen, „Vorher sichern“ und Bestätigung – nur „Gesamte Verwaltung“.
  const { ich } = useKonto();
  const umbau = v.umbau ?? [];
  const [umbauStand, setUmbauStand] = useState<UmbauStand>(() => umbauStart(umbau));
  const [sicherungFehler, setSicherungFehler] = useState<string | null>(null);
  const umbauFehlt = umbau.length > 0 && (!umbauStand.bestaetigt || !hatGesamt(ich));
  /** „Vorher sichern“ (#702): eine Sicherung starten und abwarten; scheitert sie, kein Umbau. */
  const sichereVorher = async (): Promise<boolean> => {
    setSicherungFehler(null);
    const f = await sicherungVorher();
    setSicherungFehler(f);
    return !f;
  };
  const fehlend = v.abhaengigkeiten.filter((a) => !a.installiert);
  const konflikt = v.typen.some((eintrag) => !eintrag.vorhanden && eintrag.konflikt && (namen[eintrag.schluessel] ?? '').trim().toLowerCase() === eintrag.name.toLowerCase())
    || v.sichten.some((s) => !s.vorhanden && !s.ausgelassen && s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase());
  const leer = Object.values(namen).some((n) => !n.trim()) || Object.values(sichtNamen).some((n) => !n.trim());
  // Namenskonflikte (#1123) stehen auch in den Problemen; sie verhindern nichts, wenn oben umbenannt ist.
  const probleme = v.probleme.filter((p) => !v.namenskonflikte?.includes(p) && !ohne.includes(p));
  // Herkunft bestätigen (#189, #594): außerhalb des offiziellen Katalogs bzw. ohne gültige Signatur.
  const pruefWarnung = warnung ?? (v.pruefung?.bestaetigen ? (v.pruefung.art === 'ungueltig' ? tx('pakete.herkunft.warnung.ungueltig') : '') : null);
  const bestaetigen = pruefWarnung !== null && !herkunftBestaetigt;
  const gesperrt = probleme.length > 0 || konflikt || leer || (bestaetigen && !ok) || rechteFehlen || herausgeberFehlt || umbauFehlt;
  const antwort: VorschauAntwort = { namen, sichtNamen, beispiele, mitAbhaengigkeiten: mit, automatisierungen: neueAutos.map((a) => a.schluessel).filter((k) => !ohneAuto.includes(k)), ...(rechteOk ? { rechteBestaetigt: true } : {}), ...(herausgeberOk ? { herausgeberBestaetigt: true } : {}), ...(bestaetigen && ok ? { bestaetigt: true } : {}),
    ...(umbau.length ? { umbauBestaetigt: true, umbauEntscheidungen: umbauStand.entscheidungen, ...(umbauStand.sichern ? { sichern: true } : {}) } : {}), ...(ersetzen.length ? { sichtenErsetzen: ersetzen } : {}) };
  // Ohne eigene Knöpfe (#1168): bei jeder Änderung melden – verglichen als Text, damit gleiche Antworten nicht erneut kommen.
  const gemeldet = JSON.stringify(gesperrt ? null : antwort);
  useEffect(() => { melde?.(JSON.parse(gemeldet) as VorschauAntwort | null); }, [gemeldet, melde]);
  return (
    <section className="blatt" aria-label={melde ? t('werkbank.pakete.vorschau-von', { name: v.paket.name }) : t('werkbank.pakete.vorschau')}>
      <h2 className="h3">{titel ?? (v.update ? t('werkbank.pakete.update-auf', { version: v.paket.version }) : t('werkbank.pakete.vorschau-2', { name: v.paket.name, version: v.paket.version }))}<Herausgeber wer={v.paket.herausgeber} geprueft={v.paket.herausgeberGeprueft} /></h2>
      <HerkunftZeile p={v.pruefung} />
      {/* Was mitkommt (#1047): alles, was das Paket mitbringt; beim Update mit „neu in dieser Version“. */}
      <MitkommtAufklappen m={v.mitkommt} />
      {bestaetigen && (
        <div className="hinweis warn" role="alert">
          <p>{tn('werkbank.pakete.installiere-nur-pakete-deren', { b: <strong>{t('werkbank.pakete.nicht-vom-ablago-projekt-2')}</strong>, wert: pruefWarnung ? `${pruefWarnung.replace(/\.$/, '')}. ` : '' })}</p>
          <HakenFeld beschriftung={t('werkbank.pakete.ich-weiss-woher-das')}>
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          </HakenFeld>
        </div>
      )}
      {v.laeufer && (
        // Erst lesen, dann bestätigen (#449): Liste, darunter links der Haken – untereinander, auch am Handy.
        <div className={`hinweis stapel ${v.laeufer.bestaetigen ? 'warn' : 'info'}`} role={v.laeufer.bestaetigen ? 'alert' : undefined}>
          <p>{tn('werkbank.pakete.er-laeuft-im-paket', { b: <strong>{t('werkbank.pakete.das-paket-enthaelt-code')}</strong> })}</p>
          <ul>
            {v.laeufer.rechte.map((r) => (
              <li key={r.text}>
                {r.text} <Hilfe ort={r.hilfe} />
                {r.unter && <ul>{r.unter.map((u) => <li key={u.text}>{u.text} <Hilfe ort={u.hilfe} /></li>)}</ul>}
              </li>
            ))}
          </ul>
          {v.laeufer.bestaetigen
            ? <HakenFeld beschriftung={v.update ? t('werkbank.pakete.die-rechte-haben-sich') : t('werkbank.pakete.ich-erlaube-dem-paket')}>
              <input type="checkbox" checked={rechteOk} onChange={(e) => setRechteOk(e.target.checked)} />
            </HakenFeld>
            : <p className="leise">{t('werkbank.pakete.die-rechte-sind-dieselben')}</p>}
          {/* Dienst-Adresse (#444): Hinweis auf die Vertrauensbeziehung schon bei der Installation. */}
          {v.laeufer.rechte.some((r) => r.hilfe === 'pakete.recht.adresse') && <p>{tx('fragen.adresse.installation')}</p>}
        </div>
      )}
      <FremdeMappenVorschau v={v} />
      <AktionenVorschau aktionen={v.aktionen} update={v.update} />
      {probleme.length > 0 && <div className="hinweis schlecht"><ul>{probleme.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {v.hinweise?.length > 0 && <div className="hinweis info"><ul>{v.hinweise.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {v.sprache && <SprachVorschau s={v.sprache} />}
      {v.einstellungen && (v.einstellungen.neu.length > 0 || v.einstellungen.weg.length > 0) && (
        <div className="hinweis info"><p>{t('werkbank.pakete.einstellungen-2')}{v.update && v.einstellungen.neu.length > 0 && <> {' '}{t('werkbank.pakete.neu-mit-vorgabe', { neu: v.einstellungen.neu.join(', ') })}</>}{!v.update && <> {' '}{t('werkbank.pakete.das-paket-hat-einstellungen')}</>}{v.einstellungen.weg.length > 0 && <> {' '}{tn('werkbank.pakete.ihre-werte-werden-entfernt', { b: <strong>{t('werkbank.pakete.fallen-weg')}</strong>, weg: v.einstellungen.weg.join(', ') })}</>}</p></div>
      )}
      {/* Nur, wenn wirklich etwas angelegt wird (#643); Namenskonflikte stehen direkt am betroffenen Namen. */}
      {v.update
        ? <p className="leise">{umbau.length ? tx('pakete.umbau.vorschau.update') : tx('pakete.vorschau.update')}</p>
        : legtEtwasAn(v) ? <p className="leise">{tx('pakete.vorschau.anlegen')}</p>
        : v.paket.beschreibung ? <p>{v.paket.beschreibung}</p> : null}
      {v.typen.length > 0 && <h3>{t('werkbank.pakete.mappentypen-2')}</h3>}
      <ul className="stapel">
        {v.typen.map((eintrag) => (
          <li key={eintrag.schluessel}>
            {eintrag.vorhanden
              ? <span><strong>{eintrag.name}</strong> – {eintrag.neueFelder.length || eintrag.neueRegister.length || eintrag.erkennung?.length || eintrag.wiederfinden?.length || eintrag.vorbelegen?.length || eintrag.typAngaben || eintrag.formate?.length || eintrag.beschriftungen || eintrag.abschnitte?.length ? [eintrag.neueFelder.length || eintrag.neueRegister.length ? t('werkbank.pakete.neu', { wert: [...eintrag.neueFelder.map((f) => t('werkbank.pakete.feld', { f })), ...eintrag.neueRegister.map((r) => t('werkbank.pakete.register', { r }))].join(', ') }) : '', eintrag.erkennung?.length ? t('werkbank.pakete.aus-dokument-fuellen', { map: eintrag.erkennung.map((f) => `„${f}“`).join(', ') }) : '', eintrag.wiederfinden?.length ? t('werkbank.pakete.zum-wiederfinden', { map: eintrag.wiederfinden.map((f) => `„${f}“`).join(', ') }) : '', eintrag.vorbelegen?.length ? t('werkbank.pakete.vorbelegen', { map: eintrag.vorbelegen.map((f) => `„${f}“`).join(', ') }) : '', eintrag.typAngaben ? t('werkbank.pakete.dokument-uebernehmen') : '', eintrag.formate?.length ? tx('felder.paket.formate', { felder: eintrag.formate.map((f) => `„${f}“`).join(', ') }) : '', eintrag.beschriftungen ? t('werkbank.pakete.beschriftungen', { anzahl: eintrag.beschriftungen }) : '', eintrag.abschnitte?.length ? t('werkbank.pakete.abschnitte', { map: eintrag.abschnitte.map((r) => `„${r}“`).join(', ') }) : ''].filter(Boolean).join('; ') : t('werkbank.pakete.keine-aenderung')}</span>
              : eintrag.geloescht ? <span className="leise">{t('werkbank.pakete.hast-du-geloescht-bleibt', { name: eintrag.name })}</span>
              : <Feld beschriftung={t('werkbank.pakete.name-fuer', { name: eintrag.name })} hinweis={tn('werkbank.pakete.felder-kennung', { felder: eintrag.felder, code: <code>{eintrag.dmsSchluessel}</code> })}
                  fehler={eintrag.konflikt && (namen[eintrag.schluessel] ?? '').trim().toLowerCase() === eintrag.name.toLowerCase() ? eintrag.konflikt : undefined}>
                  <input value={namen[eintrag.schluessel] ?? eintrag.name} onChange={(e) => setNamen({ ...namen, [eintrag.schluessel]: e.target.value })} />
                </Feld>}
            {/* Umbau (#1041): Der Typ entsteht aus einem vorhandenen – gleiche Mappen, Rechte und Ansichten. */}
            {eintrag.uebernimmt && <p className="leise klein">{t('pakete.umbau.vorschau.typ-aus', { name: eintrag.uebernimmt })}</p>}
            {/* Archivmodus aus dem Paket (#1051): nur für neue Typen, danach am Mappentyp änderbar. */}
            {!eintrag.vorhanden && !eintrag.geloescht && !eintrag.uebernimmt && eintrag.archiv && <p className="leise klein">{eintrag.archiv.stichtag && eintrag.archiv.leererStichtag === 'laeuftNicht'
              ? t('werkbank.pakete.archiv-laeuft-nicht', { anzahl: eintrag.archiv.jahre, ab: eintrag.archiv.stichtagName ?? '' })
              : t('werkbank.pakete.archiv', { anzahl: eintrag.archiv.jahre, ab: eintrag.archiv.stichtagName ? `„${eintrag.archiv.stichtagName}“` : t('werkbank.pakete.archiv-anlagedatum') })}</p>}
            {/* Text → Verweis (#534): Das Update ändert vorhandene Angaben nicht; umgewandelt wird danach mit Vorschau. */}
            {eintrag.vorhanden && eintrag.umwandeln?.filter((u) => u.anzahl > 0).map((u) => <p key={u.feld} className="leise klein">{tx('pakete.update.umwandeln', { feld: u.feld, aus: u.aus, anzahl: u.anzahl })}</p>)}
          </li>
        ))}
      </ul>
      {v.sichten.length > 0 && <h3>{t('werkbank.pakete.ansichten-2')}</h3>}
      <ul className="stapel">
        {v.sichten.map((s) => (
          <li key={s.schluessel}>
            {s.vorhanden ? <SichtZustandZeile s={s} ersetzen={ersetzen.includes(s.schluessel)} setze={(an) => setErsetzen(an ? [...ersetzen, s.schluessel] : ersetzen.filter((k) => k !== s.schluessel))} />
              : s.ausgelassen ? <span className="leise">{s.ausgelassen}</span>
              : <Feld beschriftung={t('werkbank.pakete.name-fuer-ansicht', { name: s.name })} hinweis={s.eltern ? t('werkbank.pakete.unter', { wert: v.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern }) : t('werkbank.pakete.oberste-ebene')}
                  fehler={s.konflikt && (sichtNamen[s.schluessel] ?? '').trim().toLowerCase() === s.name.toLowerCase() ? s.konflikt : undefined}>
                  <input value={sichtNamen[s.schluessel] ?? s.name} onChange={(e) => setSichtNamen({ ...sichtNamen, [s.schluessel]: e.target.value })} />
                </Feld>}
          </li>
        ))}
      </ul>
      <VorgabenVorschau v={v} />
      <UmbauVorschau plaene={umbau} stand={umbauStand} setze={setUmbauStand} gesamt={hatGesamt(ich)} />
      {sicherungFehler && <div className="hinweis schlecht" role="alert"><p>{sicherungFehler}</p></div>}
      {v.abhaengigkeiten.length > 0 && (
        <>
          <h3>{t('werkbank.pakete.abhaengigkeiten')}</h3>
          <ul className="klein">{v.abhaengigkeiten.map((a) => <li key={a.id}>{a.id} {a.bereich}: {a.installiert ? t('werkbank.pakete.installiert-2', { installiert: a.installiert, wert: a.ok ? '' : t('werkbank.pakete.passt-nicht') }) : a.verfuegbar ? t('werkbank.pakete.fehlt-im-katalog-gibt', { verfuegbar: a.verfuegbar }) : t('werkbank.pakete.fehlt-und-ist-nicht')}</li>)}</ul>
          {!v.update && fehlend.length > 0 && <HakenFeld beschriftung={t('werkbank.pakete.fehlende-pakete-mitinstallieren')}>
            <input type="checkbox" checked={mit} onChange={(e) => setMit(e.target.checked)} />
          </HakenFeld>}
        </>
      )}
      {!v.update && v.beispiele > 0 && <HakenFeld beschriftung={<>{t('werkbank.pakete.beispiel-mappen-anlegen', { beispiele: v.beispiele })}{v.beispielDokumente?.anzahl ? ` ${t('werkbank.pakete.mit-beispiel-dokumenten', { anzahl: v.beispielDokumente.anzahl, mb: inMB(v.beispielDokumente.bytes) })}` : ''}</>}>
        <input type="checkbox" checked={beispiele} onChange={(e) => setBeispiele(e.target.checked)} />
      </HakenFeld>}
      {/* Mitgelieferte Automatisierungen (#1174): Schalter statt Haken – angelegt werden alle, gewählt wird, welche gleich laufen. */}
      {neueAutos.length > 0 && (
        <section className="stapel" aria-label={tx('pakete.ablauf.automatisierungen')}>
          <h3>{tx('pakete.ablauf.automatisierungen')}</h3>
          <AutomatisierungenSchalter aus={ohneAuto} setAus={setOhneAuto}
            liste={neueAutos.map((a) => ({ schluessel: a.schluessel, name: a.name, hinweis: [a.zeitplan && tx('pakete.ablauf.automatisierungen.zeitplan', { zeitplan: a.zeitplan }), a.beschreibung].filter(Boolean).join(' · ') || undefined }))} />
        </section>
      )}
      {v.update && <GeaenderteAutomatisierungen liste={v.automatisierungen ?? []} />}
      {/* Automatisierungsvorlagen (#1044, Rechte-Vorschau): jede mit ihren Karten – nur Aufgaben und Benachrichtigungen. */}
      {!!v.ablaufvorlagen?.length && (
        <div className="stapel" data-anker="pakete.ablaufvorlagen">
          <p><strong>{tx('pakete.ablauf.vorlagen')}</strong></p>
          <p className="leise klein">{tx('pakete.ablauf.vorlagen.text')}</p>
          <ul>{v.ablaufvorlagen.map((a) => (
            <li key={a.schluessel}>{a.name}: {a.karten.join(', ')}
              {istKernVorlage(a.ersetzt) && <> <small className="leise">{tx('pakete.ablauf.vorlagen.ersetzt', { name: kernVorlage(a.ersetzt).name })}</small></>}
              {v.update && (a.neu || a.geaendert) && <> <span className="chip warn klein">{a.neu ? tx('pakete.ablauf.vorlagen.neu') : tx('pakete.ablauf.vorlagen.geaendert')}</span></>}
            </li>
          ))}</ul>
        </div>
      )}
      {v.herausgeberBestaetigen && (
        <div className="hinweis warn">
          <HakenFeld beschriftung={t('werkbank.pakete.herausgeber-bestaetigen', { herausgeber: v.herausgeberBestaetigen })}><input type="checkbox" checked={herausgeberOk} onChange={(e) => setHerausgeberOk(e.target.checked)} /></HakenFeld>
        </div>
      )}
      {konflikt && !!v.namenskonflikte?.length && <NamenskonfliktHinweis liste={v.namenskonflikte} />}
      {los && (
        <div className="knoepfe">
          <Knopf art="haupt" gesperrt={gesperrt}
            laeuft={laeuft} laeuftText={v.update ? t('werkbank.pakete.aktualisiere') : t('werkbank.pakete.installiere')} onClick={() => {
              setLaeuft(true);
              void (async () => {
                const { sichern, ...x } = antwort;
                if (sichern && !(await sichereVorher())) return;
                await los(x);
              })().finally(() => setLaeuft(false));
            }}>
            {v.update ? t('werkbank.pakete.aktualisieren') : t('werkbank.pakete.installieren-2')}
          </Knopf>
          {abbrechen && <Knopf onClick={abbrechen}>{abbrechenText}</Knopf>}
        </div>
      )}
    </section>
  );
}

/**
 * Eine vorhandene Ansicht des Pakets in der Vorschau (#1125): vorhanden, wird ersetzt, oder bleibt (geändert bzw. ohne
 * Prüfwert) – dann mit Haken „trotzdem ersetzen“.
 */
function SichtZustandZeile({ s, ersetzen, setze }: { s: PaketVorschau['sichten'][number]; ersetzen: boolean; setze(an: boolean): void }) {
  if (s.zustand === 'aktualisiert') return <span>{t('werkbank.pakete.ansicht.aktualisiert', { name: s.name })}</span>;
  if (s.zustand !== 'geaendert' && s.zustand !== 'unbekannt') return <span className="leise">{t('werkbank.pakete.vorhanden', { name: s.name })}</span>;
  return (
    <div className="stapel">
      <span>{t(s.zustand === 'geaendert' ? 'werkbank.pakete.ansicht.geaendert' : 'werkbank.pakete.ansicht.unbekannt', { name: s.name })}</span>
      <HakenFeld beschriftung={t('werkbank.pakete.ansicht.ersetzen')}><input type="checkbox" checked={ersetzen} onChange={(e) => setze(e.target.checked)} /></HakenFeld>
    </div>
  );
}

/** Was mit einer Vorgabe geschieht (#1038), als kurzer Zusatz hinter ihrem Namen. */
function vorgabeZustand(x: VorgabePlan, update: boolean): string {
  const teile = [
    x.zustand === 'neu' ? (update ? t('werkbank.pakete.vorgaben.neu') : '')
      : x.zustand === 'aktualisiert' ? t('werkbank.pakete.vorgaben.aktualisiert')
      : x.zustand === 'geaendert' ? (x.neueFassung ? t('werkbank.pakete.vorgaben.geaendert-neue-fassung') : t('werkbank.pakete.vorgaben.geaendert'))
      : x.zustand === 'geloescht' ? t('werkbank.pakete.vorgaben.geloescht')
      : x.zustand === 'uebernommen' ? t('werkbank.pakete.vorgaben.uebernommen') : '',
    x.vorlagen ? t('werkbank.pakete.vorgaben.vorlagen', { anzahl: x.vorlagen }) : '',
  ].filter(Boolean);
  return teile.join(', ');
}

/**
 * Vorgaben in der Vorschau (#1038): Mappen, die das Paket zum Behalten mitbringt – je Mappentyp. Beim Update nur, was
 * sich tut; was unverändert bleibt, steht als Zahl darunter.
 */
function VorgabenVorschau({ v }: { v: PaketVorschau }) {
  const alle = (v.vorgaben ?? []).filter((x) => !x.fremd);
  if (!alle.length) return null;
  const zeigen = v.update ? alle.filter((x) => x.zustand !== 'gleich' || x.vorlagen > 0) : alle;
  const typen = [...new Set(zeigen.map((x) => x.typ))];
  const gleich = alle.length - zeigen.length;
  return (
    <section className="stapel" aria-label={t('werkbank.pakete.vorgaben.titel')} data-anker="pakete.vorgaben">
      <h3>{t('werkbank.pakete.vorgaben.titel')} <Hilfe ort="pakete.vorgaben" /></h3>
      <p className="leise klein">{v.update ? t('werkbank.pakete.vorgaben.text-update') : t('werkbank.pakete.vorgaben.text')}</p>
      {typen.map((typ) => (
        <div key={typ}>
          <p className="klein"><strong>{typ}</strong></p>
          <ul className="klein">
            {zeigen.filter((x) => x.typ === typ).map((x) => { const z = vorgabeZustand(x, v.update); return <li key={x.schluessel}>{x.name}{z && <span className="leise"> · {z}</span>}</li>; })}
          </ul>
        </div>
      ))}
      {gleich > 0 && <p className="leise klein">{t('werkbank.pakete.vorgaben.unveraendert', { anzahl: gleich })}</p>}
    </section>
  );
}

/**
 * Mappen anderer Pakete (#1038) – Teil der Rechte-Vorschau: Vorgaben in deren Mappentypen und Vorlagen, die das Paket an
 * ihre Vorgaben hängt. Mehr darf es dort nicht (keine Felder, keine Rechte, nichts löschen).
 */
function FremdeMappenVorschau({ v }: { v: PaketVorschau }) {
  const fremd = (v.vorgaben ?? []).filter((x) => x.fremd && (x.zustand === 'neu' || x.vorlagen > 0));
  const erg = (v.ergaenzungen ?? []).filter((e) => !e.fehlt && e.vorlagen > 0);
  if (!fremd.length && !erg.length) return null;
  return (
    <div className="hinweis info stapel" data-anker="pakete.fremde-mappen">
      <p><strong>{t('werkbank.pakete.fremde-mappen.titel')}</strong></p>
      <ul>
        {fremd.map((x) => <li key={x.schluessel}>{t('werkbank.pakete.fremde-mappen.vorgabe', { name: x.name, typ: x.typ, paket: x.fremd ?? '' })}</li>)}
        {erg.map((e) => <li key={e.ziel}>{t('werkbank.pakete.fremde-mappen.vorlagen', { anzahl: e.vorlagen, name: e.name, paket: e.paket })}</li>)}
      </ul>
      <p className="leise klein">{t('werkbank.pakete.fremde-mappen.grenze')}</p>
    </div>
  );
}

/** Sprachpaket in der Vorschau (#731): Sprache, Abdeckung, maschinell/geprüft, Beschriftungen für andere Pakete. */
function SprachVorschau({ s }: { s: NonNullable<PaketVorschau['sprache']> }) {
  return (
    <div className="hinweis info stapel">
      <p>{t('werkbank.pakete.sprache.vorschau', { sprache: sprachname(s.kennung), prozent: s.abdeckung.prozent, vorhanden: s.abdeckung.vorhanden, gesamt: s.abdeckung.gesamt, ablago: s.ablago })}</p>
      <SprachHerkunft maschinell={s.maschinell} geprueftVon={s.geprueftVon} />
      {s.pakete.length > 0 && <p>{t('werkbank.pakete.sprache.beschriftungen', { pakete: s.pakete.join(', ') })}</p>}
      <p className="leise klein">{t('werkbank.pakete.sprache.erlauben')}</p>
    </div>
  );
}
/** „Maschinell übersetzt – Verbesserungen willkommen“ bzw. „Geprüft von …“ (#731) – wie in Mein Konto. */
export function SprachHerkunft({ maschinell, geprueftVon }: { maschinell: boolean; geprueftVon?: string }) {
  if (geprueftVon) return <p className="leise klein">{t('werkbank.pakete.sprache.geprueft', { wer: geprueftVon })}</p>;
  if (!maschinell) return null;
  return <p className="leise klein">{tn('werkbank.pakete.sprache.maschinell', { link: <a href={MITMACHEN_URL} target="_blank" rel="noreferrer">{t('werkbank.pakete.sprache.mitmachen')}</a> })}</p>;
}

/**
 * Herausgeber neben dem Namen (#1084): „Verträge · app.ablago“, immer vollständig (nie gekürzt – sonst sähe
 * app.ablago-community wie app.ablago aus). Nicht belegte als „Herausgeber laut Paket: … – nicht geprüft“.
 */
export function Herausgeber({ wer, geprueft }: { wer?: string | null; geprueft?: boolean }) {
  if (!wer) return null;
  return <span className="leise" title={t('werkbank.pakete.herausgeber')}> · {geprueft ? wer : t('werkbank.pakete.herausgeber-ungeprueft', { wer })}</span>;
}
