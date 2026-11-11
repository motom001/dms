import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiFehler, setzeBestaetigung } from './api';
import { t } from './sprache';
import { Knopf } from './bausteine';
import { passkeysImBrowser, passkeyVerwenden } from './passkey';
import { Symbol } from './Symbol';
import type { Verwaltungsstand } from '../../shared/src/verwaltungsrecht';

/**
 * Verwaltungsmodus (#819): erneute Anmeldung für „Ablago verwalten“, für den Wiedereinstieg nach Ablauf und als frische
 * Anmeldung vor heiklen Handlungen. Ein Dialog für alles – eingebunden einmal (`<Verwaltungsanmeldung />`).
 *
 * - Beginnen: ohne Abfrage, wenn die Anmeldung höchstens 10 Minuten zurückliegt; sonst Passwort und Code.
 * - Abgelaufen während der Arbeit: Die Anfrage wartet, der Dialog fragt; danach geht sie noch einmal hinaus (api.ts).
 *   Heute in diesem Browser schon bestätigt: Wiedereinstieg mit einem Klick, aktiv zu wählen.
 * - Heikle Handlung: immer Passwort (und Code), gilt dann 10 Minuten.
 * - Statt Passwort und Code geht überall ein Passkey (#811) – auch für Personen, die sich sonst über einen Anbieter anmelden.
 */
type Art = 'beginnen' | 'modus' | 'frisch';
interface Offen { art: Art; heuteBestaetigt: boolean; fertig(ok: boolean): void }

let zeige: ((o: Offen) => void) | null = null;
const frage = (art: Art, heuteBestaetigt = false) => new Promise<boolean>((fertig) => {
  if (!zeige) { fertig(false); return; }
  zeige({ art, heuteBestaetigt, fertig });
});

/** „Ablago verwalten“: Modus beginnen, wenn nötig mit erneuter Anmeldung. `true` = läuft. */
export async function verwaltungBeginnen(): Promise<boolean> {
  try { await api.verwaltungBeginnen(); return true; } catch (e) {
    const d = e instanceof ApiFehler ? e.details as { bestaetigen?: boolean } | undefined : undefined;
    if (!d?.bestaetigen) throw e;
    return frage('beginnen');
  }
}

/** Vor einem Link zu einer heiklen Datei (Notfallblatt): erst frisch anmelden, wenn nötig. `true` = weiter. */
export async function frischAngemeldet(): Promise<boolean> {
  return frage('frisch');
}

export function Verwaltungsanmeldung({ stand, nachher }: { stand: Verwaltungsstand | null; nachher(): void }) {
  const [offen, setOffen] = useState<Offen | null>(null);
  useEffect(() => {
    zeige = (o) => setOffen(o);
    // Wiedereinstieg mit einem Klick: heute schon bestätigt oder Anmeldung vor höchstens 10 Minuten.
    setzeBestaetigung((art, d) => frage(art, !!d.heuteBestaetigt || (art === 'modus' && !!d.frisch)));
    return () => { zeige = null; setzeBestaetigung(null); };
  }, []);
  if (!offen) return null;
  const schliesse = (ok: boolean) => { setOffen(null); offen.fertig(ok); nachher(); };
  return <Dialog o={offen} stand={stand} schliesse={schliesse} />;
}

/** Überschrift und Text des Dialogs je Anlass. */
function dialogTexte(art: Art, wieder: boolean) {
  if (art === 'frisch') return { titel: t('konten.verwaltung.dialog.frisch.titel'), text: t('konten.verwaltung.dialog.frisch.text') };
  if (wieder) return { titel: t('konten.verwaltung.dialog.wieder.titel'), text: t('konten.verwaltung.dialog.wieder.text') };
  if (art === 'modus') return { titel: t('konten.verwaltung.dialog.abgelaufen.titel'), text: t('konten.verwaltung.dialog.abgelaufen.text') };
  return { titel: t('konten.verwaltung.dialog.titel'), text: t('konten.verwaltung.dialog.text') };
}

function Dialog({ o, stand, schliesse }: { o: Offen; stand: Verwaltungsstand | null; schliesse(ok: boolean): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const feld = useRef<HTMLInputElement>(null);
  const id = useId();
  const [passwort, setPasswort] = useState('');
  const [code, setCode] = useState('');
  const [mitCode, setMitCode] = useState(!!stand?.code);
  const [passkey, setPasskey] = useState(() => !!stand?.passkey && passkeysImBrowser());
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const ohnePasswort = stand?.passwort === false;
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    feld.current?.focus();
  }, []);
  const wieder = o.art === 'modus' && o.heuteBestaetigt;
  async function tu(f: () => Promise<unknown>) {
    setSendet(true); setFehler(undefined);
    try { await f(); schliesse(true); } catch (e) {
      const d = e instanceof ApiFehler ? e.details as { code?: boolean; passkey?: boolean } | undefined : undefined;
      if (d?.code) setMitCode(true);
      if (d?.passkey) setPasskey(passkeysImBrowser());
      setFehler((e as Error).message);
    } finally { setSendet(false); }
  }
  const anmelden = () => tu(() => (o.art === 'frisch'
    ? api.verwaltungBestaetigen({ passwort, ...(mitCode ? { code } : {}) })
    : api.verwaltungBeginnen({ passwort, ...(mitCode ? { code } : {}) })));
  // Nur Anbieter (#241): dort erneut anmelden; danach ist die Anmeldung frisch und es geht ohne Abfrage weiter.
  const beimAnbieter = () => {
    try { sessionStorage.setItem('dms:nach-anmeldung', '/werkbank?verwalten=1'); } catch { /* ohne */ }
    location.href = '/api/konto/anbieter/start';
  };
  const { titel, text } = dialogTexte(o.art, wieder);
  return (
    <dialog ref={ref} className="rueckfrage verwaltungsdialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-x`}
      onCancel={(e) => { e.preventDefault(); schliesse(false); }}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (wieder) void tu(() => api.verwaltungBeginnen()); else if (!ohnePasswort) void anmelden(); }}>
        <h2 id={`${id}-t`}>{titel}</h2>
        <div id={`${id}-x`} className="rueckfrage-text"><p>{text}</p></div>
        {!wieder && passkey && <PasskeyBestaetigen frisch={o.art === 'frisch'} haupt={ohnePasswort} tu={tu} />}
        {!wieder && !ohnePasswort && <>
          <label className="eigenschaft"><span>{t('anmeldung.passwort')}</span>
            <input ref={feld} id="verwaltung-passwort" type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="current-password" required />
          </label>
          {mitCode && <label className="eigenschaft"><span>{t('anmeldung.code.feld')}</span>
            <input id="verwaltung-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
          </label>}
        </>}
        {!wieder && ohnePasswort && <p className="leise klein">{t('konten.verwaltung.fehler.anbieter')}</p>}
        {fehler && <p className="fehlertext" role="alert">{fehler}</p>}
        <div className="rueckfrage-knoepfe">
          <button type="button" className="knopf" onClick={() => schliesse(false)}>{t('konten.verwaltung.dialog.abbrechen')}</button>
          {wieder && <button type="button" className="textknopf" onClick={() => void api.verwaltungBeenden().catch(() => undefined).finally(() => schliesse(false))}>{t('konten.verwaltung.beenden')}</button>}
          {ohnePasswort && !wieder
            ? <button type="button" className="knopf primaer" onClick={beimAnbieter}>{t('konten.verwaltung.dialog.anbieter')}</button>
            : <button type="submit" className="knopf primaer" disabled={sendet}>{wieder ? t('konten.verwaltung.dialog.wieder.knopf') : t('konten.verwaltung.dialog.knopf')}</button>}
        </div>
      </form>
    </dialog>
  );
}

/** Erneute Anmeldung mit Passkey (#811): Optionen nur mit den eigenen Passkeys, dann an dieselbe Stelle wie Passwort und Code. */
function PasskeyBestaetigen({ frisch, haupt, tu }: { frisch: boolean; haupt: boolean; tu: (f: () => Promise<unknown>) => Promise<void> }) {
  const bestaetigen = async () => {
    const p = await api.passkeyBestaetigenOptionen();
    const antwort = await passkeyVerwenden(p.optionen);
    const passkey = { kennung: p.kennung, antwort };
    await tu(() => (frisch ? api.verwaltungBestaetigen({ passkey }) : api.verwaltungBeginnen({ passkey })));
  };
  return (
    <div className="anmelden-passkey">
      <Knopf id="verwaltung-passkey" art={haupt ? 'haupt' : 'neben'} className="breit" laeuftText={t('anmeldung.passkey.warte')} onClick={bestaetigen}>
        <Symbol name="passkey" /> {t('anmeldung.passkey.bestaetigen')}</Knopf>
      {!haupt && <p className="trenner">{t('anmeldung.passkey.oder')}</p>}
    </div>
  );
}

/**
 * Notfallblatt & Co. (#819): Herunterladen eines Schlüssels ist eine heikle Handlung. Liegt die letzte Anmeldung länger
 * als 10 Minuten zurück, fragt Ablago vorher das Passwort ab – erst dann startet der Download (ein Link kann die Antwort
 * des Servers sonst nicht abfangen).
 */
export async function heikelHerunterladen(e: { preventDefault(): void }, url: string, nachher?: () => void) {
  e.preventDefault();
  if (await heikelLaden(url)) nachher?.();
}

/**
 * Wie `heikelHerunterladen`, für einen Knopf (#975: Sicherung herunterladen): Nach der frischen Anmeldung lädt der
 * Browser selbst – als Strom in seine Downloads, mit Fortschritt, Abbrechen und Fortsetzen, ohne die Datei in den
 * Speicher der Seite zu holen. `true` = gestartet, `false` = Anmeldung abgebrochen.
 */
export async function heikelLaden(url: string): Promise<boolean> {
  const st = await api.status().catch(() => null);
  if (!st?.verwaltungsmodus?.frisch && !(await frischAngemeldet())) return false;
  const a = Object.assign(document.createElement('a'), { href: url, download: '' });
  document.body.append(a); a.click(); a.remove();
  return true;
}
