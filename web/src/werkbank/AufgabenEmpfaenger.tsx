import { useCallback, useEffect, useState } from 'react';
import type { Benutzer } from '../../../shared/src/model';
import { Mehrfachauswahl } from '../ablage/Mehrfachauswahl';
import { aufgabenApi, type AufgabenEmpfaenger } from '../api/aufgaben';
import { useDaten } from '../daten';
import { Hilfe } from '../Hilfe';
import { Speicherleiste, useEntwurf } from '../Speicherleiste';
import { t } from '../sprache';

/** Wer im Alltag Aufgaben ohne Empfänger bekommen darf (#719): aktive Menschen ohne Admin-Rechte. */
/** Jede aktive Person – seit #818 auch, wer verwaltet (ein Konto für Alltag und Verwaltung). */
export const taugt = (b: Benutzer) => b.aktiv && !b.art;

/** Einstellung laden (Werkbank → Benutzer). */
export function useAufgabenEmpfaenger(aktiv: boolean) {
  const [stand, setStand] = useState<AufgabenEmpfaenger | null>(null);
  const [fehler, setFehler] = useState<string>();
  const laden = useCallback(async () => {
    try { setStand(await aufgabenApi.aufgabenEmpfaenger()); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { if (aktiv) void laden(); }, [aktiv, laden]);
  return { stand, setStand, fehler, laden };
}
export type AufgabenEmpfaengerZustand = ReturnType<typeof useAufgabenEmpfaenger>;

/**
 * Werkbank → Benutzer und Sicherheit → Benutzer (#719): „Aufgaben ohne Empfänger gehen an …“. Auswahl wie ein
 * Verweisfeld, nur aktive Benutzer. Im Verwaltungsmodus sieht man die Aufgaben weiterhin.
 */
export function AufgabenEmpfaengerBlock({ z, benutzer }: { z: AufgabenEmpfaengerZustand; benutzer: Benutzer[] }) {
  const d = useDaten();
  const gespeichert = z.stand?.benutzerId ?? null;
  const [wahl, setWahl] = useState<string | null>(gespeichert);
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht'; text: string }>();
  useEffect(() => { setWahl(z.stand?.benutzerId ?? null); }, [z.stand]);
  const ent = useEntwurf(gespeichert, wahl, { aus: !z.stand, zuruecksetzen: () => { setWahl(gespeichert); setMeldung(undefined); } });
  const name = (b: Benutzer) => b.name || b.email;
  const passend = benutzer.filter(taugt);
  const such = eingabe.trim().toLocaleLowerCase('de');
  const vorschlaege = passend.filter((b) => b.id !== wahl && (!such || name(b).toLocaleLowerCase('de').includes(such) || b.email.toLocaleLowerCase('de').includes(such)))
    .map((b) => ({ id: b.id, text: <>{name(b)} <span className="leise klein">{b.email}</span></> }));
  const gewaehlt = wahl ? benutzer.find((b) => b.id === wahl) : undefined;
  // Gespeichert, aber inzwischen deaktiviert: Hinweis, bis jemand anderes gewählt ist.
  const ungueltig = z.stand && !z.stand.benutzerId && z.stand.gespeichert ? z.stand.gespeichert : null;

  async function speichern() {
    setSendet(true); setMeldung(undefined);
    try { z.setStand(await aufgabenApi.aufgabenEmpfaengerSpeichern(wahl)); setMeldung({ art: 'gut', text: t('werkbank.aufgabenempfaenger.gespeichert') }); await d.neuLaden(); }
    catch (e) { setMeldung({ art: 'schlecht', text: (e as Error).message }); }
    finally { setSendet(false); }
  }

  return (
    <form className="blatt" id="aufgaben-empfaenger" onSubmit={(e) => { e.preventDefault(); void speichern(); }} onKeyDown={ent.tasten}>
      <h2 className="h3">{t('werkbank.aufgabenempfaenger.titel')} <Hilfe ort="werkbank.aufgabenempfaenger" /></h2>
      <p className="leise klein">{t('werkbank.aufgabenempfaenger.text')}</p>
      {z.fehler && <p className="fehlertext">{z.fehler}</p>}
      {ungueltig && <p className="hinweis warn klein">{z.stand?.wirksam ? t('werkbank.aufgabenempfaenger.vertretung', { name: d.person(ungueltig), vertreter: d.person(z.stand.wirksam) }) : t('werkbank.aufgabenempfaenger.ungueltig', { name: d.person(ungueltig) })}</p>}
      {!ungueltig && z.stand?.wirksam && z.stand.wirksam !== z.stand.benutzerId && <p className="leise klein">{t('werkbank.aufgabenempfaenger.abwesend', { vertreter: d.person(z.stand.wirksam) })}</p>}
      <label className="eigenschaft" htmlFor="aufgaben-empfaenger-wahl"><span>{t('werkbank.aufgabenempfaenger.feld')}</span></label>
      <Mehrfachauswahl id="aufgaben-empfaenger-wahl" name={t('werkbank.aufgabenempfaenger.feld')} platzhalter={t('werkbank.aufgabenempfaenger.platzhalter')}
        eingabe={eingabe} setEingabe={setEingabe} offen={offen} setOffen={setOffen} vorschlaege={vorschlaege} leerText={t('werkbank.aufgabenempfaenger.leer')}
        waehle={(id) => { setWahl(id); setEingabe(''); setOffen(false); }} ohneSuche={!!wahl}
        gewaehlt={gewaehlt ? [{ id: gewaehlt.id, inhalt: <>{name(gewaehlt)} <span className="leise klein">{gewaehlt.email}</span></>, entfernenText: t('werkbank.aufgabenempfaenger.entfernen', { name: name(gewaehlt) }) }] : []}
        entferne={() => setWahl(null)} />
      {!wahl && <p className="leise klein">{t('werkbank.aufgabenempfaenger.keiner')}</p>}
      {meldung && <p className={meldung.art === 'gut' ? 'gutertext' : 'fehlertext'} role="status">{meldung.text}</p>}
      <Speicherleiste ent={ent} gegenstand={t('werkbank.aufgabenempfaenger.gegenstand')} sendet={sendet} />
    </form>
  );
}
