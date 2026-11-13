import { useCallback, useEffect, useState } from 'react';
import { api, type Passkey, type PasskeyStand } from '../api';
import { Feld, Knopf, type KnopfErgebnis } from '../bausteine';
import { Hilfe } from '../Hilfe';
import { useKonto } from '../konto-kontext';
import { geraetename, passkeyAnlegen, passkeysImBrowser } from '../passkey';
import { t } from '../sprache';
import { Symbol } from '../Symbol';
import { gebietsschema } from '../../../shared/src/sprache';
import { PASSKEY_NAME_MAX } from '../../../shared/src/passkey';

/**
 * Passkeys (#811) in Mein Konto → Sicherheit: hinzufügen, benennen, entfernen. Mehrere je Person (Handy, Rechner,
 * Sicherheitsschlüssel). Entfernen verlangt eine frische Anmeldung – fehlt sie, fragt der Dialog des Verwaltungsmodus
 * (api.ts) und schickt die Anfrage danach noch einmal.
 */

const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Ohne HTTPS (oder ohne WebAuthn im Browser): statt des Knopfs ein Hinweis mit Weg ins Handbuch. */
export function PasskeyOhneHttps({ ort = 'profil.passkeys' }: { ort?: 'profil.passkeys' | 'werkbank.passkeys' }) {
  return <p className="hinweis info" id="passkey-ohne-https">{t('anmeldung.passkey.fehler.https')} <Hilfe ort={ort} /></p>;
}

/** Neuen Passkey anlegen: Name vorschlagen, Gerät fragen, speichern. Auch im Pflicht-Bildschirm und im Assistenten. */
export function PasskeyHinzufuegen({ fertig, abbrechen, autoFocus = false }: { fertig: (p: Passkey) => void | Promise<void>; abbrechen?: () => void; autoFocus?: boolean }) {
  const [name, setName] = useState(() => geraetename());
  const anlegen = async (): Promise<KnopfErgebnis | void> => {
    const optionen = await api.passkeyBeginnen();
    const antwort = await passkeyAnlegen(optionen);
    await fertig(await api.passkeyHinzufuegen(antwort, name));
  };
  return (
    <div className="stapel" id="passkey-hinzufuegen">
      <Feld beschriftung={t('profil.passkeys.name')} hinweis={t('profil.passkeys.name.hinweis')}>
        <input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={PASSKEY_NAME_MAX} autoComplete="off" autoFocus={autoFocus} />
      </Feld>
      <p className="leise klein">{t('profil.passkeys.ablauf')}</p>
      <div className="knoepfe">
        {abbrechen && <Knopf art="link" onClick={abbrechen}>{t('profil.passkeys.abbrechen')}</Knopf>}
        <Knopf art="haupt" onClick={anlegen} laeuftText={t('profil.passkeys.warte')}>{t('profil.passkeys.weiter')}</Knopf>
      </div>
    </div>
  );
}

function Zeile({ p, adresse, aendern }: { p: Passkey; adresse: string | null; aendern: (liste: Passkey[]) => void }) {
  const [umbenennen, setUmbenennen] = useState(false);
  const [name, setName] = useState(p.name);
  const speichern = async () => { aendern(await api.passkeyBenennen(p.nr, name)); setUmbenennen(false); };
  const entfernen = async () => { aendern(await api.passkeyEntfernen(p.nr)); };
  return (
    <li className="passkey-zeile">
      {umbenennen ? (
        <div className="stapel">
          <Feld beschriftung={t('profil.passkeys.name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={PASSKEY_NAME_MAX} autoFocus />
          </Feld>
          <div className="knoepfe">
            <Knopf art="link" onClick={() => { setName(p.name); setUmbenennen(false); }}>{t('profil.passkeys.abbrechen')}</Knopf>
            <Knopf art="haupt" groesse="klein" gesperrt={!name.trim()} onClick={speichern}>{t('profil.passkeys.speichern')}</Knopf>
          </div>
        </div>
      ) : <>
        <div>
          <strong><Symbol name="passkey" /> {p.name}</strong>
          <div className="leise klein">
            {t('profil.passkeys.seit', { datum: datum(p.erstellt) })}{' · '}
            {p.zuletzt ? t('profil.passkeys.zuletzt', { datum: datum(p.zuletzt) }) : t('profil.passkeys.nie')}
            {p.mehrgeraete && <>{' · '}{t('profil.passkeys.mehrgeraete')}</>}
          </div>
          {!p.passt && <p className="hinweis warn klein">{adresse ? t('profil.passkeys.passt-nicht', { alt: p.rpId, neu: adresse }) : t('profil.passkeys.passt-nicht.https', { alt: p.rpId })}</p>}
        </div>
        <div className="knoepfe">
          <Knopf groesse="klein" onClick={() => setUmbenennen(true)}>{t('profil.passkeys.umbenennen')}</Knopf>
          <Knopf art="gefahr" groesse="klein" symbol="geloescht" onClick={entfernen}
            rueckfrage={{ titel: t('profil.passkeys.entfernen.frage', { name: p.name }), text: t('profil.passkeys.entfernen.text'), ja: t('profil.passkeys.entfernen') }}>{t('profil.passkeys.entfernen')}</Knopf>
        </div>
      </>}
    </li>
  );
}

/** Mein Konto → Sicherheit. */
export function PasskeyBlatt() {
  const { aktualisieren } = useKonto();
  const [stand, setStand] = useState<PasskeyStand | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [neu, setNeu] = useState(false);
  const [meldung, setMeldung] = useState<string>();
  const laden = useCallback(async () => { try { setStand(await api.passkeys()); } catch (e) { setFehler((e as Error).message); } }, []);
  useEffect(() => { void laden(); }, [laden]);
  const geht = !!stand?.moeglich && passkeysImBrowser();
  const aendern = (liste: Passkey[]) => { setStand((s) => (s ? { ...s, liste } : s)); setMeldung(undefined); void aktualisieren(); };
  return (
    <div className="blatt" id="passkeys">
      <h2 className="h3">{t('profil.passkeys.titel')} <Hilfe ort="profil.passkeys" /></h2>
      <p className="leise">{t('profil.passkeys.text')}</p>
      {!stand ? (fehler ? <p className="fehlertext">{fehler}</p> : <p className="leise">{t('profil.passkeys.lade')}</p>) : <>
        {stand.liste.length > 0 && <ul className="sitzungsliste passkey-liste">{stand.liste.map((p) => <Zeile key={p.nr} p={p} adresse={stand.adresse} aendern={aendern} />)}</ul>}
        {!geht ? <PasskeyOhneHttps /> : neu ? (
          <PasskeyHinzufuegen autoFocus abbrechen={() => setNeu(false)} fertig={async (p) => { setNeu(false); setMeldung(t('profil.passkeys.hinzugefuegt', { name: p.name })); await laden(); void aktualisieren(); }} />
        ) : (
          <div className="knoepfe">
            <Knopf art={stand.liste.length ? 'neben' : 'haupt'} gesperrt={stand.liste.length >= stand.hoechstens ? t('anmeldung.passkey.fehler.zu-viele', { anzahl: stand.hoechstens }) : false}
              onClick={() => { setMeldung(undefined); setNeu(true); }}>{t('profil.passkeys.hinzufuegen')}</Knopf>
          </div>
        )}
        {meldung && <p className="gutertext" role="status">{meldung}</p>}
        {stand.pflicht && <p className="leise klein">{stand.pflicht === 'zweifaktor' ? t('profil.passkeys.pflicht.zweifaktor') : t('profil.passkeys.pflicht')}</p>}
        {stand.liste.length > 0 && <p className="leise klein">{t('profil.passkeys.verloren')}</p>}
      </>}
    </div>
  );
}
