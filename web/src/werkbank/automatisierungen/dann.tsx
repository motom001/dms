import { feldLabel, optionText } from '../../../../shared/src/beschriftung';
import {
  AUTOMATISIERUNG_GRENZEN,
  paketKarteLeer,
  zielHost,
  type AutomatisierungAnsicht,
  type DannKarte,
  type Empfaenger,
  type Kontextdaten,
  type WennKarte,
} from '../../../../shared/src/automatisierung';
import type { KontextPaket, PaketKarte as PaketKarteBeschreibung } from '../../../../shared/src/automatisierung';
import type { Mappentyp } from '../../../../shared/src/model';
import { Feld, FeldGruppe, HakenFeld, Knopf, Platzhalter, usePlatzhalterEinsetzen } from '../../bausteine';
import { t } from '../../sprache';
import { EmailKarte, platzhalterGruppen, UrlKarte } from '../AutomatisierungAussen';
import { grundArt, neueId, ohneMappeWenn, PAKET_KARTE } from './hilfen';
import { EmpfaengerWahl, empfaengerName } from './und';

/**
 * Dann- und Sonst-Karten einer Automatisierung (#675, #677, #678; #1279 aus Automatisierungen.tsx gezogen): neue Karten,
 * Kurzform, „Feld ändern“, Aufgabe bzw. Benachrichtigung, Favoriten, Anmeldeschutz, nach außen und Karten aus Paketen.
 */

/** „Paket nach Zeitplan ausführen“ – oder eine Karte aus einem Paket (#680): Paket und Aufgabe (= Schlüssel der Karte) stehen fest. */
function neuePaketKarte(art: string, k?: Kontextdaten): DannKarte {
  const pk = PAKET_KARTE.exec(art);
  return pk
    ? { id: neueId(), art: 'paket', paket: pk[1], aufgabe: pk[2] }
    : { id: neueId(), art: 'paket', paket: (k?.pakete ?? []).find((p) => p.zeitplan)?.id ?? '', aufgabe: null };
}

export function neueDann(art: string, w?: WennKarte, k?: Kontextdaten): DannKarte {
  if (grundArt(art) === 'paket') return neuePaketKarte(art, k);
  if (art === 'feld') return { id: neueId(), art: 'feld', werte: {} };
  if (art === 'zusammenfassung' || art === 'favoriten' || art === 'sicherung') return { id: neueId(), art };
  // Nach außen (#671): Adresse vorbelegt mit dem ersten freigegebenen Ziel; Inhalt „nur Meldung“.
  if (art === 'url')
    return { id: neueId(), art: 'url', adresse: k?.ziele?.[0]?.adresse ?? '', methode: 'POST', parameter: [], inhalt: 'meldung' };
  if (art === 'email') return { id: neueId(), art: 'email', an: [], betreff: '', text: '' };
  if (art === 'anmeldeschutz') return { id: neueId(), art: 'anmeldeschutz', was: w?.art === 'benutzer.gesperrt' ? 'konto' : 'sammel' };
  if (art === 'aufgabe') return { id: neueId(), art: 'aufgabe', als: 'aufgabe', empfaenger: [], text: '', faellig: 7 };
  return { id: neueId(), art: 'stopp' };
}

export function dannKurz(k: DannKarte, typ: Mappentyp | null, kx: Kontextdaten): string {
  if (k.art === 'favoriten')
    return k.rollen?.length
      ? t('automatisierung.ui.karte.dann.favoriten.nur', {
          rollen: k.rollen.map((r) => kx.rollen.find((x) => x.id === r)?.name ?? '?').join(', '),
        })
      : '';
  if (k.art === 'stopp' || k.art === 'zusammenfassung' || k.art === 'sicherung') return '';
  if (k.art === 'anmeldeschutz') return t.frei(`automatisierung.ui.karte.dann.anmeldeschutz.${k.was}`);
  if (k.art === 'paket') return `${kx.pakete?.find((p) => p.id === k.paket)?.name ?? k.paket}${k.aufgabe ? ` · ${k.aufgabe}` : ''}`;
  if (k.art === 'url')
    return `${k.methode} ${k.adresse ? zielHost(k.adresse) : '?'} · ${t.frei(`automatisierung.ui.karte.dann.url.inhalt.${k.inhalt}`)}`;
  if (k.art === 'email')
    return `${k.betreff || '?'} → ${k.an.map((e) => (e.art === 'adresse' ? e.adresse : empfaengerName(e, typ, kx))).join(', ') || '?'}`;
  if (k.art === 'feld')
    return Object.entries(k.werte)
      .map(([key, v]) => `${typ?.felder.find((f) => f.key === key)?.label ?? key} = ${String(v ?? '')}`)
      .join(', ');
  return `${t.frei(`automatisierung.karte.aufgabe.als-${k.als}`)} → ${k.empfaenger.map((e) => empfaengerName(e, typ, kx)).join(', ') || '?'}`;
}

/** „Feld ändern“: gewählte Felder mit ihrem Wert; Platzhalter an der Schreibmarke des zuletzt benutzten Werts (#1177). */
function FeldKarte({
  karte,
  typ,
  wenn,
  setze,
}: {
  karte: Extract<DannKarte, { art: 'feld' }>;
  typ: Mappentyp | null;
  wenn: WennKarte;
  setze: (k: DannKarte) => void;
}) {
  const ein = usePlatzhalterEinsetzen();
  // Berechnete Felder (#1034) schreibt nur ihr Paket – nicht zur Wahl (bereits gewählte zeigt die Prüfung als Problem).
  // Zusammengesetzte (#1050) setzt Ablago aus ihren Teilen – auch nicht.
  const felder = (typ?.felder ?? []).filter((f) => f.typ !== 'passwort' && f.typ !== 'zusammengesetzt');
  const waehlbar = felder.filter((f) => !f.berechnetVon);
  const gewaehlt = Object.keys(karte.werte);
  return (
    <div className="karte offen">
      {!typ && <p className="fehlertext klein">{t('automatisierung.ui.karte.dann.feld.ohne-typ')}</p>}
      <ul className="stapel">
        {gewaehlt.map((key) => {
          const f = felder.find((x) => x.key === key);
          const v = karte.werte[key];
          return (
            <li key={key} className="bedingungszeile">
              <strong>{f ? feldLabel(f) : key}</strong>
              <Feld beschriftung={f ? feldLabel(f) : key} beschriftungVerbergen>
                {f?.typ === 'auswahl' ? (
                  <select value={String(v ?? '')} onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value } })}>
                    <option value="">–</option>
                    {(f.optionen ?? []).map((o) => (
                      <option key={o} value={o}>
                        {optionText(f, o)}
                      </option>
                    ))}
                  </select>
                ) : f?.typ === 'janein' ? (
                  <select
                    value={v === true ? 'ja' : v === false ? 'nein' : ''}
                    onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value === 'ja' } })}>
                    <option value="ja">{t('automatisierung.ui.ja')}</option>
                    <option value="nein">{t('automatisierung.ui.nein')}</option>
                  </select>
                ) : (
                  <input
                    {...ein.feld(key, String(v ?? ''), (w) => setze({ ...karte, werte: { ...karte.werte, [key]: w } }))}
                    value={String(v ?? '')}
                    placeholder={f?.typ === 'datum' ? t('automatisierung.ui.karte.dann.feld.datum') : ''}
                    onChange={(x) => setze({ ...karte, werte: { ...karte.werte, [key]: x.target.value } })}
                  />
                )}
              </Feld>
              <Knopf
                art="link"
                groesse="klein"
                symbol="schliessen"
                onClick={() => {
                  const w = { ...karte.werte };
                  delete w[key];
                  setze({ ...karte, werte: w });
                }}>
                {t('automatisierung.ui.entfernen')}
              </Knopf>
            </li>
          );
        })}
      </ul>
      {typ && (
        <Feld beschriftung={t('automatisierung.ui.karte.dann.feld.waehlen')} beschriftungVerbergen>
          <select
            value=""
            onChange={(x) => {
              if (x.target.value) setze({ ...karte, werte: { ...karte.werte, [x.target.value]: '' } });
            }}>
            <option value="">{t('automatisierung.ui.karte.dann.feld.waehlen')}</option>
            {waehlbar
              .filter((f) => !gewaehlt.includes(f.key))
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {feldLabel(f)}
                </option>
              ))}
          </select>
        </Feld>
      )}
      {gewaehlt.length > 0 && <Platzhalter einsetzen={ein.einsetzen} gruppen={platzhalterGruppen(wenn, typ)} />}
    </div>
  );
}

/** #1001: Wer Favoriten-Änderungen bekommt und die Vorgabe für neue Benutzer – früher unter Werkbank → Aufgaben. */
function FavoritenKarte({
  karte,
  k,
  setze,
}: {
  karte: Extract<DannKarte, { art: 'favoriten' }>;
  k: Kontextdaten;
  setze: (k: DannKarte) => void;
}) {
  return (
    <div className="karte offen">
      <p className="leise klein">{t('automatisierung.ui.karte.dann.favoriten.text')}</p>
      <FeldGruppe
        beschriftung={t('automatisierung.ui.karte.dann.favoriten.rollen')}
        hinweis={t('automatisierung.ui.karte.dann.favoriten.rollen.hilfe')}>
        {k.rollen.map((r) => (
          <label key={r.id} className="haken">
            <input
              type="checkbox"
              checked={!!karte.rollen?.includes(r.id)}
              onChange={(x) => {
                const neu = x.target.checked ? [...(karte.rollen ?? []), r.id] : (karte.rollen ?? []).filter((y) => y !== r.id);
                setze({ ...karte, rollen: neu.length ? neu : undefined });
              }}
            />
            <span>{r.name}</span>
          </label>
        ))}
      </FeldGruppe>
      <HakenFeld
        beschriftung={t('automatisierung.ui.karte.dann.favoriten.vorgabe')}
        hinweis={t('automatisierung.ui.karte.dann.favoriten.vorgabe.hilfe')}>
        <input
          type="checkbox"
          checked={karte.vorgabe !== false}
          onChange={(x) => setze({ ...karte, vorgabe: x.target.checked ? undefined : false })}
        />
      </HakenFeld>
    </div>
  );
}

/** Anmeldeschutz (#678): Sammelmeldung oder gesperrtes Konto. */
function AnmeldeschutzKarte({ karte, setze }: { karte: Extract<DannKarte, { art: 'anmeldeschutz' }>; setze: (k: DannKarte) => void }) {
  return (
    <div className="karte offen">
      <Feld beschriftung={t('automatisierung.ui.karte.dann.anmeldeschutz.was')}>
        <select value={karte.was} onChange={(x) => setze({ ...karte, was: x.target.value === 'konto' ? 'konto' : 'sammel' })}>
          <option value="sammel">{t('automatisierung.ui.karte.dann.anmeldeschutz.sammel')}</option>
          <option value="konto">{t('automatisierung.ui.karte.dann.anmeldeschutz.konto')}</option>
        </select>
      </Feld>
      <p className="leise klein">{t.frei(`automatisierung.ui.karte.dann.anmeldeschutz.${karte.was}.text`)}</p>
    </div>
  );
}

/** Aufgabe bzw. Benachrichtigung: Fälligkeit, Empfänger, Text mit Platzhaltern (#1177). */
function AufgabeKarte({
  karte,
  typ,
  wenn,
  k,
  setze,
}: {
  karte: Extract<DannKarte, { art: 'aufgabe' }>;
  typ: Mappentyp | null;
  wenn: WennKarte;
  k: Kontextdaten;
  setze: (k: DannKarte) => void;
}) {
  // Platzhalter zum Anklicken (#1177): an der Schreibmarke des zuletzt benutzten Felds.
  const ein = usePlatzhalterEinsetzen();
  return (
    <div className="karte offen">
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.karte.dann.aufgabe.als')}>
          <select value={karte.als} onChange={(x) => setze({ ...karte, als: x.target.value as 'aufgabe' | 'benachrichtigung' })}>
            <option value="aufgabe">{t('automatisierung.karte.aufgabe.als-aufgabe')}</option>
            <option value="benachrichtigung">{t('automatisierung.karte.aufgabe.als-benachrichtigung')}</option>
          </select>
        </Feld>
        {karte.als === 'aufgabe' && wenn.art !== 'datum' && (
          <Feld beschriftung={t('automatisierung.ui.karte.dann.aufgabe.faellig')}>
            <input
              type="number"
              min={0}
              max={3650}
              value={karte.faellig ?? ''}
              onChange={(x) => setze({ ...karte, faellig: x.target.value === '' ? null : Number(x.target.value) })}
            />
          </Feld>
        )}
        {karte.als === 'aufgabe' && wenn.art === 'datum' && (
          <p className="leise breit">{t('automatisierung.ui.karte.dann.aufgabe.frist')}</p>
        )}
      </div>
      <fieldset className="eigenschaft breit">
        <legend>{t('automatisierung.ui.empfaenger')}</legend>
        <ul className="stapel">
          {karte.empfaenger.map((e, i) => (
            <li key={i} className="bedingungszeile">
              <EmpfaengerWahl
                e={e}
                typ={typ}
                k={k}
                wenn={wenn}
                setze={(n) => setze({ ...karte, empfaenger: karte.empfaenger.map((x, j) => (j === i ? (n as Empfaenger) : x)) })}
              />
              <Knopf
                art="link"
                groesse="klein"
                symbol="schliessen"
                onClick={() => setze({ ...karte, empfaenger: karte.empfaenger.filter((_, j) => j !== i) })}>
                {t('automatisierung.ui.entfernen')}
              </Knopf>
            </li>
          ))}
        </ul>
        <Knopf groesse="klein" onClick={() => setze({ ...karte, empfaenger: [...karte.empfaenger, { art: 'person', id: '' }] })}>
          {t('automatisierung.ui.empfaenger.hinzu')}
        </Knopf>
      </fieldset>
      <Feld beschriftung={t('automatisierung.ui.karte.dann.aufgabe.text')} className="breit">
        <textarea
          {...ein.feld('text', karte.text, (x) => setze({ ...karte, text: x }))}
          rows={3}
          value={karte.text}
          maxLength={AUTOMATISIERUNG_GRENZEN.text}
          onChange={(x) => setze({ ...karte, text: x.target.value })}
        />
      </Feld>
      <Platzhalter einsetzen={ein.einsetzen} gruppen={platzhalterGruppen(wenn, typ)} />
      <p className="leise klein">
        {ohneMappeWenn(wenn) ? t('automatisierung.ui.karte.dann.aufgabe.ohne-mappe') : t('automatisierung.ui.karte.dann.aufgabe.rechte')}
      </p>
    </div>
  );
}

export function DannEditor({
  karte,
  typ,
  wenn,
  k,
  a,
  eigenesPaket,
  setze,
}: {
  karte: DannKarte;
  typ: Mappentyp | null;
  wenn: WennKarte;
  k: Kontextdaten;
  a?: AutomatisierungAnsicht;
  eigenesPaket?: string | null;
  setze: (k: DannKarte) => void;
}) {
  if (karte.art === 'paket') return <PaketKarte karte={karte} k={k} eigenesPaket={eigenesPaket} setze={setze} />;
  // Nach außen (#671).
  if (karte.art === 'url') return <UrlKarte karte={karte} wenn={wenn} typ={typ} k={k} a={a} setze={setze} />;
  if (karte.art === 'email')
    return (
      <EmailKarte
        karte={karte}
        wenn={wenn}
        typ={typ}
        ohneMappe={ohneMappeWenn(wenn)}
        setze={setze}
        wahl={(e, s, extra) => <EmpfaengerWahl e={e} typ={typ} k={k} wenn={wenn} setze={s} extra={extra} />}
      />
    );
  if (karte.art === 'stopp') return <p className="leise klein">{t('automatisierung.ui.karte.dann.stopp.text')}</p>;
  if (karte.art === 'zusammenfassung') return <p className="leise klein">{t('automatisierung.ui.karte.dann.zusammenfassung.text')}</p>;
  if (karte.art === 'sicherung') return <p className="leise klein">{t('automatisierung.ui.karte.dann.sicherung.text')}</p>;
  // #1001: Wer Favoriten-Änderungen bekommt und die Vorgabe für neue Benutzer – früher unter Werkbank → Aufgaben.
  if (karte.art === 'favoriten') return <FavoritenKarte karte={karte} k={k} setze={setze} />;
  if (karte.art === 'anmeldeschutz') return <AnmeldeschutzKarte karte={karte} setze={setze} />;
  if (karte.art === 'feld') return <FeldKarte karte={karte} typ={typ} wenn={wenn} setze={setze} />;
  return <AufgabeKarte karte={karte} typ={typ} wenn={wenn} k={k} setze={setze} />;
}

/**
 * „Paket nach Zeitplan ausführen“ (#1082): Paket und optional eine Aufgabe. Zur Wahl stehen nur Pakete, die Zeitpläne
 * annehmen; eine mitgelieferte Automatisierung ruft nur ihr eigenes Paket (fest). Aufgaben: die Kennungen, die die
 * mitgelieferten Automatisierungen des Pakets benutzen.
 */
/** Karten aus dem Paket (#680) mit Namen; dazu die Kennungen der mitgelieferten Automatisierungen und die gewählte Karte. */
function aufgabenWahl(p: KontextPaket | undefined, aufgabe: string | null) {
  const karten = p?.karten ?? [];
  const aufgaben = [...new Set([...(p?.aufgaben ?? []), ...(aufgabe ? [aufgabe] : [])])].filter(
    (x) => !karten.some((c) => c.schluessel === x),
  );
  return { karten, aufgaben, pk: karten.find((c) => c.schluessel === aufgabe) };
}

/** Felder einer Karte aus dem Paket (#680): gehen mit dem Ereignis ans Paket. */
function KartenFelder({
  pk,
  karte,
  setze,
}: {
  pk: PaketKarteBeschreibung;
  karte: Extract<DannKarte, { art: 'paket' }>;
  setze: (k: DannKarte) => void;
}) {
  const setzeWert = (s: string, w: string | number | boolean | null) => {
    const n = { ...karte.werte };
    if (w === null || w === '') delete n[s];
    else n[s] = w;
    setze({ ...karte, werte: n });
  };
  return (
    <>
      {(pk.felder ?? []).map((f) =>
        f.typ === 'janein' ? (
          <HakenFeld key={f.schluessel} beschriftung={f.name}>
            <input
              type="checkbox"
              checked={karte.werte?.[f.schluessel] === true}
              onChange={(x) => setzeWert(f.schluessel, x.target.checked)}
            />
          </HakenFeld>
        ) : (
          <Feld key={f.schluessel} beschriftung={f.name} optional>
            <input
              type={f.typ === 'zahl' ? 'number' : 'text'}
              value={String(karte.werte?.[f.schluessel] ?? '')}
              onChange={(x) =>
                setzeWert(f.schluessel, f.typ === 'zahl' ? (x.target.value === '' ? null : Number(x.target.value)) : x.target.value)
              }
            />
          </Feld>
        ),
      )}
    </>
  );
}

function PaketKarte({
  karte,
  k,
  eigenesPaket,
  setze,
}: {
  karte: Extract<DannKarte, { art: 'paket' }>;
  k: Kontextdaten;
  eigenesPaket?: string | null;
  setze: (k: DannKarte) => void;
}) {
  const pakete = k.pakete ?? [];
  const fest = eigenesPaket !== undefined;
  const ziel = fest ? (eigenesPaket ?? '') : karte.paket;
  const waehlbar = pakete.filter((p) => p.zeitplan || p.id === ziel);
  const gewaehlt = pakete.find((p) => p.id === ziel);
  const { karten, aufgaben, pk } = aufgabenWahl(gewaehlt, karte.aufgabe ?? null);
  const leer = ziel ? paketKarteLeer(ziel, pakete) : null;
  return (
    <div className="karte offen" data-paketkarte={karte.paket}>
      <div className="raster">
        <Feld beschriftung={t('automatisierung.ui.karte.dann.paket.paket')}>
          <select value={ziel} disabled={fest} onChange={(x) => setze({ ...karte, paket: x.target.value, aufgabe: null })}>
            {!ziel && <option value="">{t('automatisierung.ui.karte.dann.paket.waehlen')}</option>}
            {!gewaehlt && ziel && <option value={ziel}>{ziel}</option>}
            {waehlbar.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Feld>
        <Feld beschriftung={t('automatisierung.ui.karte.dann.paket.aufgabe')}>
          <select value={karte.aufgabe ?? ''} onChange={(x) => setze({ ...karte, aufgabe: x.target.value || null, werte: undefined })}>
            <option value="">{t('automatisierung.ui.karte.dann.paket.ohne-aufgabe')}</option>
            {karten.map((c) => (
              <option key={c.schluessel} value={c.schluessel}>
                {c.name}
              </option>
            ))}
            {aufgaben.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Feld>
        {pk && <KartenFelder pk={pk} karte={karte} setze={setze} />}
      </div>
      {pk?.hilfe && <p className="klein">{pk.hilfe}</p>}
      {fest && <p className="leise klein">{t('automatisierung.ui.karte.dann.paket.fest')}</p>}
      {!fest && !pakete.some((p) => p.zeitplan) && <p className="leise klein">{t('automatisierung.ui.karte.dann.paket.keine')}</p>}
      {leer && <p className="fehlertext klein">{leer}</p>}
      <p className="leise klein">{t('automatisierung.ui.karte.dann.paket.text')}</p>
    </div>
  );
}
