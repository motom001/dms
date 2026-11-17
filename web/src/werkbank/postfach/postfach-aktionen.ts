import { t } from '../../sprache';
import { eingaengeApi, type PostfachAnsicht, type PostfachEingabe } from '../../api/eingaenge';
import { useDaten } from '../../daten';
import { geheZu, loeseWache } from '../../ort';
import { fehlerBereiche, type BereichListe, type KnopfErgebnis, type useBereiche } from '../../bausteine';
import { alsEingabe, gleicherServer, type Meldung } from './hilfen';
import type { PostfachZustand } from './zustand';
import type { PostfachBereich } from './PostfachEditor';

/** Speichern, „Verbindung testen“, „Jetzt abrufen“ und Löschen eines Postfachs. */
export function postfachAktionen({
  z,
  d,
  vorhanden,
  e,
  setE,
  eingabe,
  liste,
  b,
  setSendet,
  setFehlerOrte,
  setMeldung,
}: {
  z: PostfachZustand;
  d: ReturnType<typeof useDaten>;
  vorhanden: PostfachAnsicht | undefined;
  e: PostfachEingabe;
  setE: (e: PostfachEingabe) => void;
  eingabe: PostfachEingabe & { unverschluesseltBestaetigt: boolean };
  liste: BereichListe<PostfachBereich>;
  b: ReturnType<typeof useBereiche<PostfachBereich>>;
  setSendet: (an: boolean) => void;
  setFehlerOrte: (s: Set<PostfachBereich>) => void;
  setMeldung: (m: Meldung | undefined) => void;
}) {
  async function speichern() {
    setSendet(true);
    setFehlerOrte(new Set());
    try {
      const l = vorhanden ? await eingaengeApi.postfachAendern(vorhanden.id, eingabe) : await eingaengeApi.postfachAnlegen(eingabe);
      z.setListe(l);
      setMeldung({ art: 'gut', text: t('werkbank.postfaecher.gespeichert') });
      const n = vorhanden && l.find((p) => p.id === vorhanden.id);
      setE(n ? alsEingabe(n) : { ...e, passwort: '' });
      if (!vorhanden) {
        b.merke(l[l.length - 1].id);
        loeseWache();
        geheZu(`/werkbank/postfaecher/${l[l.length - 1].id}`, true);
      }
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
      // Fehlermeldungen öffnen den betroffenen Bereich (#1000): der Server nennt ihn, sonst die Verbindung.
      const orte = fehlerBereiche(x, liste, ['verbindung']);
      setFehlerOrte(new Set(orte));
      b.oeffne(orte);
    } finally {
      setSendet(false);
    }
  }
  // „Verbindung testen“ und „Jetzt abrufen“ (#986): Ergebnis und Fehler stehen unter den Knöpfen, nicht oben.
  async function testen(): Promise<KnopfErgebnis> {
    // Gespeichertes Geheimnis nur an den gespeicherten Server (#358) – der Server lehnt es sonst ebenso ab.
    if (vorhanden && !gleicherServer(e, vorhanden) && (e.anmeldung === 'oauth' || !e.passwort)) {
      return {
        art: 'schlecht',
        text:
          e.anmeldung === 'oauth'
            ? t('werkbank.postfaecher.server-port-oder-verschluesselung')
            : t('werkbank.postfaecher.server-port-oder-verschluesselung-2'),
      };
    }
    const r = await eingaengeApi.postfachTesten({ ...eingabe, id: vorhanden?.id });
    return { art: r.ok ? 'gut' : 'schlecht', text: r.text };
  }
  async function abrufen(): Promise<KnopfErgebnis | undefined> {
    if (!vorhanden) return;
    try {
      const r = await eingaengeApi.postfachAbrufen(vorhanden.id);
      await d.neuLaden();
      return {
        art: 'gut',
        text: r.uebernommen
          ? t('werkbank.postfaecher.mails-uebernommen', { anzahl: r.uebernommen })
          : t('werkbank.postfaecher.keine-neuen-mails'),
      };
    } finally {
      await z.laden();
    }
  }
  async function loeschen() {
    if (!vorhanden) return;
    try {
      await eingaengeApi.postfachLoeschen(vorhanden.id);
      await z.laden();
      loeseWache();
      geheZu('/werkbank/postfaecher');
    } catch (x) {
      setMeldung({ art: 'schlecht', text: (x as Error).message });
    }
  }
  return { speichern, testen, abrufen, loeschen };
}
