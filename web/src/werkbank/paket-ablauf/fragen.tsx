import { inMB, type AblaufEingabe, type AblaufErgebnis, type AblaufPlan } from '../../../../shared/src/pakete';
import type { EinstellungFeld } from '../../../../shared/src/paketeinstellungen';
import { Feld, HakenFeld, Knopf } from '../../bausteine';
import type { PaketVorschau } from '../../api/pakete';
import { Hilfe } from '../../Hilfe';
import { t } from '../../sprache';
import { HerkunftZeile } from '../Herkunft';
import { NamenskonfliktHinweis } from '../Namenskonflikt';
import { automatisierungHinweis, AutomatisierungenSchalter } from '../PaketAutomatisierungen';
import { MitkommtAufklappen } from '../PaketMitkommt';
import { Eingabe } from '../PaketEinstellungen';
import { AblaufMeldung } from './auswahl';
import {
  installiere,
  konfliktSichten,
  konfliktTypen,
  leer,
  nochmal,
  useFragen,
  wahlVon,
  type AblaufPaketV,
  type FragenZustand,
} from './fragen-zustand';
import type { PaketVorgabe, PaketWahl } from './kontext';

/**
 * Fragen im Paket-Ablauf (#405; #1279 aus PaketAblauf.tsx gezogen): jede Frage einmal – Herkunft, Rechte, Namen nur bei
 * Konflikten, Beispiele, Automatisierungen, Pflicht-Einstellungen – und die Zusammenfassung mit einem Knopf.
 */

type Z = FragenZustand;
type Plan = AblaufPlan<PaketVorschau>;
const gleich = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.toLowerCase();
/** „– für …“ hinter einem Paket, das als Abhängigkeit mitkommt. */
const fuerText = (p: AblaufPaketV, pk: AblaufPaketV[]) =>
  t('pakete.ablauf.fuer', { namen: p.fuer.map((id) => pk.find((x) => x.id === id)?.name ?? id).join(', ') });

/** Probleme des Plans und Pakete, die sich nicht laden ließen (#646) – mit „Nochmal versuchen“. */
function Probleme({ z, plan, nochmalLos }: { z: Z; plan: Plan; nochmalLos(): void }) {
  return (
    <>
      {z.probleme.length > 0 && (
        <div className="hinweis schlecht">
          <ul>
            {z.probleme.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {/* Ein Paket, das sich nicht laden lässt, hält nur sich selbst und was es braucht auf (#646). */}
      {!!plan.ausgelassen?.length && (
        <div className="hinweis warn stapel" role="status">
          <p>{t('pakete.ablauf.ausgelassen')}</p>
          <ul>
            {plan.ausgelassen.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong> {a.version}: {a.grund}
              </li>
            ))}
          </ul>
          <div className="knoepfe">
            <Knopf gesperrt={z.laeuft} onClick={nochmalLos}>
              {t('pakete.ablauf.ausgelassen.nochmal')}
            </Knopf>
          </div>
        </div>
      )}
    </>
  );
}

function Herkunft({ z, plan }: { z: Z; plan: Plan }) {
  if (!plan.herkunftBestaetigen) return null;
  return (
    <section className="blatt stapel" aria-label={t('pakete.ablauf.herkunft')}>
      <h2 className="h3">{t('pakete.ablauf.herkunft')}</h2>
      <HerkunftZeile p={plan.herkunft} />
      <div className="hinweis warn" role="alert">
        <p>{t('pakete.ablauf.herkunft.text')}</p>
        <HakenFeld beschriftung={t('pakete.ablauf.herkunft.ja')}>
          <input type="checkbox" checked={z.herkunftOk} onChange={(e) => z.setHerkunftOk(e.target.checked)} />
        </HakenFeld>
      </div>
    </section>
  );
}

/** Rechte eines Pakets mit Code: Herausgeber, wofür es mitkommt, die Rechte mit Hilfe. */
function PaketRechte({ p, pk }: { p: AblaufPaketV; pk: AblaufPaketV[] }) {
  return (
    <div className="pa-rechte">
      <h3 className="klein">
        {p.name} {p.version}
        {p.vorschau.paket.herausgeber && (
          <span className="leise" title={t('werkbank.pakete.herausgeber')}>
            {' '}
            ·{' '}
            {p.vorschau.paket.herausgeberGeprueft
              ? p.vorschau.paket.herausgeber
              : t('werkbank.pakete.herausgeber-ungeprueft', { wer: p.vorschau.paket.herausgeber })}
          </span>
        )}
        {!p.gewaehlt && p.fuer.length > 0 && <span className="leise"> – {fuerText(p, pk)}</span>}
      </h3>
      <ul className="klein">
        {p.vorschau.laeufer!.rechte.map((r) => (
          <li key={r.text}>
            {r.text} <Hilfe ort={r.hilfe} />
            {r.unter && (
              <ul>
                {r.unter.map((u) => (
                  <li key={u.text}>
                    {u.text} <Hilfe ort={u.hilfe} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {!p.vorschau.laeufer!.bestaetigen && <p className="leise klein">{t('pakete.ablauf.rechte.gleich')}</p>}
    </div>
  );
}

function Rechte({ z, plan }: { z: Z; plan: Plan }) {
  if (!z.mitCode.length) return null;
  return (
    <section className="blatt stapel" aria-label={t('pakete.ablauf.rechte')}>
      <h2 className="h3">
        {t('pakete.ablauf.rechte')} <Hilfe ort="werkbank.pakete.ablauf" />
      </h2>
      <p className="leise">{t('pakete.ablauf.rechte.text', { anzahl: z.mitCode.length })}</p>
      {z.mitCode.map((p) => (
        <PaketRechte key={p.schluessel} p={p} pk={z.pk} />
      ))}
      {z.mitCode.some((p) => p.vorschau.laeufer!.rechte.some((r) => r.hilfe === 'pakete.recht.adresse')) && (
        <p className="klein">{t('pakete.ablauf.adresse.hinweis')}</p>
      )}
      {z.erstmals.length > 0 && (
        <div className="hinweis warn">
          <HakenFeld
            beschriftung={t('pakete.ablauf.herausgeber.ja', {
              liste: z.erstmals.map((p) => `${p.name}: ${p.vorschau.herausgeberBestaetigen}`).join(', '),
            })}>
            <input type="checkbox" checked={z.herausgeberOk} onChange={(e) => z.setHerausgeberOk(e.target.checked)} />
          </HakenFeld>
        </div>
      )}
      {plan.rechte.bestaetigen && (
        <div className="hinweis warn">
          <HakenFeld beschriftung={t('pakete.ablauf.rechte.ja')}>
            <input type="checkbox" checked={z.rechteOk} onChange={(e) => z.setRechteOk(e.target.checked)} />
          </HakenFeld>
        </div>
      )}
    </section>
  );
}

/** Namen, die es schon gibt (#1123): je Paket neue Namen für Mappentypen und Ansichten. */
function Namen({ z }: { z: Z }) {
  const mitKonflikt = z.pk.filter((p) => konfliktTypen(p).length || konfliktSichten(p).length);
  if (!mitKonflikt.length) return null;
  return (
    <section className="blatt stapel" aria-label={t('pakete.ablauf.namen')}>
      <h2 className="h3">{t('pakete.ablauf.namen')}</h2>
      <p className="leise">{t('pakete.ablauf.namen.text')}</p>
      {mitKonflikt.map((p) => (
        <div key={p.schluessel} className="stapel">
          <h3 className="klein">{p.name}</h3>
          {konfliktTypen(p).map((x) => (
            <Feld
              key={x.schluessel}
              beschriftung={t('pakete.ablauf.namen.typ', { name: x.name })}
              fehler={gleich(z.namen[p.id]?.[x.schluessel], x.name) ? x.konflikt : undefined}>
              <input
                value={z.namen[p.id]?.[x.schluessel] ?? ''}
                onChange={(e) => z.setNamen({ ...z.namen, [p.id]: { ...z.namen[p.id], [x.schluessel]: e.target.value } })}
              />
            </Feld>
          ))}
          {konfliktSichten(p).map((x) => (
            <Feld
              key={x.schluessel}
              beschriftung={t('pakete.ablauf.namen.sicht', { name: x.name })}
              fehler={gleich(z.sichtNamen[p.id]?.[x.schluessel], x.name) ? x.konflikt : undefined}>
              <input
                value={z.sichtNamen[p.id]?.[x.schluessel] ?? ''}
                onChange={(e) => z.setSichtNamen({ ...z.sichtNamen, [p.id]: { ...z.sichtNamen[p.id], [x.schluessel]: e.target.value } })}
              />
            </Feld>
          ))}
        </div>
      ))}
    </section>
  );
}

/** Beispiel-Mappen: ein Haken für alle, je Paket abwählbar; Zahl und Größe der Beispiel-Dokumente (#878). */
function Beispiele({ z }: { z: Z }) {
  const mit = z.mitBeispielen;
  if (!mit.length) return null;
  return (
    <section className="blatt stapel" aria-label={t('pakete.ablauf.beispiele')}>
      <h2 className="h3">{t('pakete.ablauf.beispiele')}</h2>
      <HakenFeld
        beschriftung={
          mit.length === 1
            ? t('pakete.ablauf.beispiele.eins', { anzahl: mit[0].vorschau.beispiele, name: mit[0].name })
            : t('pakete.ablauf.beispiele.alle', { anzahl: mit.length })
        }>
        <input type="checkbox" checked={z.beispiele} onChange={(e) => z.setBeispiele(e.target.checked)} />
      </HakenFeld>
      {/* Beispiel-Dokumente (#878): wie viele und wie groß, damit niemand von 100 MB überrascht wird. */}
      {mit.some((p) => p.vorschau.beispielDokumente?.anzahl) && (
        <p className="leise klein">
          {t('pakete.ablauf.beispiele.dokumente', {
            anzahl: mit.reduce((n, p) => n + (p.vorschau.beispielDokumente?.anzahl ?? 0), 0),
            mb: inMB(mit.reduce((n, p) => n + (p.vorschau.beispielDokumente?.bytes ?? 0), 0)),
          })}
        </p>
      )}
      {z.beispiele && mit.length > 1 && (
        <details className="pa-je-paket">
          <summary className="klein">{t('pakete.ablauf.beispiele.je')}</summary>
          {mit.map((p) => (
            <HakenFeld
              key={p.schluessel}
              className="klein"
              beschriftung={t('pakete.ablauf.beispiele.paket', { name: p.name, anzahl: p.vorschau.beispiele })}>
              <input
                type="checkbox"
                checked={!z.ohneBeispiele.includes(p.id)}
                onChange={(e) =>
                  z.setOhneBeispiele(e.target.checked ? z.ohneBeispiele.filter((x) => x !== p.id) : [...z.ohneBeispiele, p.id])
                }
              />
            </HakenFeld>
          ))}
        </details>
      )}
    </section>
  );
}

/** Mitgelieferte Automatisierungen (#1174): Schalter statt Haken – angelegt werden alle, gewählt wird, welche gleich laufen. */
function Automatisierungen({ z }: { z: Z }) {
  if (!z.mitAutomatisierungen.length) return null;
  return (
    <section className="blatt stapel" aria-label={t('pakete.ablauf.automatisierungen')}>
      <h2 className="h3">{t('pakete.ablauf.automatisierungen')}</h2>
      <AutomatisierungenSchalter
        aus={z.ohneAutomatisierung}
        setAus={z.setOhneAutomatisierung}
        liste={z.mitAutomatisierungen.flatMap((p) =>
          (p.vorschau.automatisierungen ?? [])
            .filter((a) => a.neu)
            .map((a) => ({
              schluessel: `${p.id}|${a.schluessel}`,
              name: a.name,
              hinweis: automatisierungHinweis(a, p.vorschau.mitkommt, [t('pakete.ablauf.automatisierungen.paket', { name: p.name })]),
            })),
        )}
      />
    </section>
  );
}

/** Pflicht-Einstellungen eines Pakets – oder „Später ausfüllen“. */
function PflichtEinstellungen({ z, p, plan }: { z: Z; p: AblaufPaketV; plan: Plan }) {
  const setze = (f: EinstellungFeld, v: unknown) => z.setWerte((w) => ({ ...w, [p.id]: { ...w[p.id], [f.schluessel]: v } }));
  return (
    <fieldset className="pa-einstellungen stapel">
      <legend>
        <strong>{p.name}</strong>
      </legend>
      <HakenFeld beschriftung={t('pakete.ablauf.einstellungen.spaeter')} className="klein">
        <input
          type="checkbox"
          checked={z.spaeter.includes(p.id)}
          onChange={(e) => z.setSpaeter(e.target.checked ? [...z.spaeter, p.id] : z.spaeter.filter((x) => x !== p.id))}
        />
      </HakenFeld>
      {!z.spaeter.includes(p.id) &&
        p.einstellungen.map((f: EinstellungFeld) => (
          <div key={f.schluessel}>
            <Eingabe
              f={f}
              wert={z.werte[p.id]?.[f.schluessel]}
              fehler={z.fehler[`${p.id}.${f.schluessel}`]?.replace(`${p.name}: `, '')}
              auswahl={plan.auswahl}
              id={`pa-${p.id}-${f.schluessel}`}
              setze={(v) => setze(f, v)}
            />
            {f.typ === 'adresse' && f.beispiel && leer(z.werte[p.id]?.[f.schluessel]) && (
              <Knopf groesse="klein" onClick={() => setze(f, f.beispiel)}>
                {t('pakete.ablauf.einstellungen.beispiel', { beispiel: f.beispiel })}
              </Knopf>
            )}
          </div>
        ))}
      {z.spaeter.includes(p.id) && <p className="leise klein">{t('pakete.ablauf.einstellungen.spaeter.text')}</p>}
    </fieldset>
  );
}

function Einstellungen({ z, plan }: { z: Z; plan: Plan }) {
  if (!z.mitEinstellungen.length) return null;
  return (
    <section className="blatt stapel" aria-label={t('pakete.ablauf.einstellungen')}>
      <h2 className="h3">{t('pakete.ablauf.einstellungen')}</h2>
      <p className="leise">{t('pakete.ablauf.einstellungen.text')}</p>
      {z.mitEinstellungen.map((p) => (
        <PflichtEinstellungen key={p.schluessel} z={z} p={p} plan={plan} />
      ))}
      {z.adressen.length > 0 && (
        <div className="hinweis warn">
          <HakenFeld beschriftung={t('pakete.ablauf.adresse.ja', { adressen: z.adressen.map((a) => `${a.paket} → ${a.wert}`).join(', ') })}>
            <input type="checkbox" checked={z.adresseOk} onChange={(e) => z.setAdresseOk(e.target.checked)} />
          </HakenFeld>
        </div>
      )}
    </section>
  );
}

/** Eine Zeile der Zusammenfassung: Zahlen in einem Satz. */
function summe(z: Z) {
  const { pk } = z;
  return [
    t('pakete.ablauf.summe.pakete', { anzahl: pk.length }),
    pk.some((p) => !p.gewaehlt) ? t('pakete.ablauf.summe.abh', { anzahl: pk.filter((p) => !p.gewaehlt).length }) : '',
    z.updates.length ? t('pakete.ablauf.summe.updates', { anzahl: z.updates.length }) : '',
    z.neueTypen ? t('pakete.ablauf.summe.typen', { anzahl: z.neueTypen }) : '',
    z.neueSichten ? t('pakete.ablauf.summe.sichten', { anzahl: z.neueSichten }) : '',
    z.beispielPakete.length ? t('pakete.ablauf.summe.beispiele', { anzahl: z.beispielPakete.length }) : '',
    z.anzahlAn ? t('pakete.ablauf.summe.automatisierungen', { anzahl: z.anzahlAn }) : '',
    z.mitCode.length ? t('pakete.ablauf.summe.code', { anzahl: z.mitCode.length }) : '',
    z.spaeter.length ? t('pakete.ablauf.summe.spaeter', { anzahl: z.spaeter.length }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Ein Paket in der Reihenfolge der Installation: Version, Herausgeber, Update, wofür, ergänzt, was mitkommt, Hinweise. */
function ReihenEintrag({ p, pk }: { p: AblaufPaketV; pk: AblaufPaketV[] }) {
  return (
    <li>
      <strong>{p.name}</strong> {p.version}
      {p.vorschau.paket.herausgeber ? ` · ${p.vorschau.paket.herausgeber}` : ''}
      {p.vorschau.update ? ` (${t('pakete.ablauf.update', { version: p.vorschau.installiert ?? '' })})` : ''}
      {!p.gewaehlt && p.fuer.length > 0 && <span className="leise"> – {fuerText(p, pk)}</span>}
      {p.ergaenzt && (
        <span className="leise">
          {' '}
          – {t('pakete.ablauf.ergaenzt', { name: pk.find((x) => x.id === p.ergaenzt!.paket)?.name ?? p.ergaenzt.paket })}
        </span>
      )}
      {/* Was mitkommt (#1047) je Paket zum Aufklappen. */}
      <MitkommtAufklappen m={p.vorschau.mitkommt} />
      {p.vorschau.hinweise.length > 0 && (
        <ul className="leise">
          {p.vorschau.hinweise.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Zusammenfassung mit Meldung, was noch fehlt, und den Knöpfen. */
function Zusammenfassung({ z, sammeln, los, zurueck }: { z: Z; sammeln: boolean; los(): void; zurueck(): void }) {
  return (
    <section className="blatt stapel" aria-label={t('pakete.ablauf.zusammenfassung')}>
      <h2 className="h3">{t('pakete.ablauf.zusammenfassung')}</h2>
      <p>{summe(z)}</p>
      <ol className="pa-reihe klein">
        {z.pk.map((p) => (
          <ReihenEintrag key={p.schluessel} p={p} pk={z.pk} />
        ))}
      </ol>
      <AblaufMeldung m={z.meldung} />
      {z.nochKonflikt && z.namenskonflikte.length > 0 && <NamenskonfliktHinweis liste={z.namenskonflikte} />}
      {z.fehlt.length > 0 && !z.probleme.length && (
        <ul className="leise klein">
          {z.fehlt.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <div className="knoepfe">
        <Knopf
          art="haupt"
          gesperrt={z.probleme.length > 0 || z.fehlt.length > 0}
          laeuft={z.laeuft}
          laeuftText={t('pakete.ablauf.installiere')}
          onClick={los}>
          {sammeln
            ? t('einrichtung.pakete.uebernehmen', { anzahl: z.pk.length })
            : t('pakete.ablauf.installieren', { anzahl: z.pk.length })}
        </Knopf>
        <Knopf gesperrt={z.laeuft} onClick={zurueck}>
          {t('pakete.ablauf.zurueck')}
        </Knopf>
      </div>
    </section>
  );
}

/** Jede Frage einmal (#405) – mit Ausnahmen je Paket –, Zusammenfassung und ein Knopf. Exportiert für den Test ohne Konto (#881). */
export function Fragen({
  plan,
  eingabe,
  zurueck,
  neuerPlan,
  fertig,
  sammeln,
  vorgabe,
}: {
  plan: Plan;
  eingabe(): AblaufEingabe;
  zurueck(): void;
  neuerPlan(p: Plan): void;
  fertig(e: AblaufErgebnis): void;
  sammeln?(w: PaketWahl): void;
  vorgabe?: PaketVorgabe;
}) {
  const z = useFragen({ plan, vorgabe, eingabe });
  // Im Einrichtungsassistenten (#804): nur merken – installiert wird erst mit „Jetzt einrichten“.
  const los = () => (sammeln ? sammeln(wahlVon(z)) : void installiere(z, { plan, eingabe, neuerPlan, fertig }));
  return (
    <div className="stapel pa-fragen">
      <Probleme z={z} plan={plan} nochmalLos={() => void nochmal(z, eingabe, neuerPlan)} />
      <Herkunft z={z} plan={plan} />
      <Rechte z={z} plan={plan} />
      <Namen z={z} />
      <Beispiele z={z} />
      <Automatisierungen z={z} />
      <Einstellungen z={z} plan={plan} />
      <Zusammenfassung z={z} sammeln={!!sammeln} los={los} zurueck={zurueck} />
    </div>
  );
}
