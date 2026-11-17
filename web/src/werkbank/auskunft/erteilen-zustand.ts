import { useEffect, useMemo, useState } from 'react';
import type { AuskunftAuswahl, AuskunftVorschau, Datenschutz } from '../../../../shared/src/auskunft';
import type { BaumRichtung } from '../../../../shared/src/baum';
import type { Auftrag } from '../../../../shared/src/auftrag';
import { betriebApi } from '../../api/betrieb';
import { datenschutzApi } from '../../api/datenschutz';
import { mappenApi } from '../../api/mappen';
import { t } from '../../sprache';
import { rueckfrage } from '../../rueckfrage';
import { heute } from './hilfen';
import { LEER, vorgabe, type Wahl } from './wahl';

/** Zustand des Assistenten „Auskunft erteilen“: Person, Sammeln, Auswahl, Angaben und der Auftrag. */
export function useAuskunftErteilen(einstellung: Datenschutz, nachher: () => Promise<void>) {
  const [betroffen, setBetroffen] = useState<{ id: string; typId: string; titel: string } | null>(null);
  const [tiefe, setTiefe] = useState(2);
  const [richtungen, setRichtungen] = useState<BaumRichtung[]>(['verwiesenVon', 'verweistAuf']);
  const [vorschau, setVorschau] = useState<AuskunftVorschau | null>(null);
  const [wahl, setWahl] = useState<Wahl>(LEER);
  const [eingang, setEingang] = useState(heute());
  const [empfaenger, setEmpfaenger] = useState(einstellung.empfaenger);
  const [anmerkung, setAnmerkung] = useState('');
  const [passwort, setPasswort] = useState('');
  const [geprueft, setGeprueft] = useState(false);
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'schlecht' | 'info'; text: string }>();

  // Aus der Mappe („Aktionen → Auskunft erstellen …“) oder einer Anfrage: /werkbank/auskuenfte/neu?mappe=<id>
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('mappe');
    if (!id) return;
    mappenApi.mappe(id).then(
      (x) => setBetroffen({ id: x.mappe.id, typId: x.mappe.typId, titel: x.mappe.titel ?? '' }),
      () => {},
    );
  }, []);
  useEffect(() => {
    if (auftrag?.status !== 'laeuft') return;
    const timer = setInterval(
      () =>
        void betriebApi.auftrag().then((a) => {
          setAuftrag(a);
          if (a?.status !== 'laeuft') void nachher();
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [auftrag?.status, nachher]);
  const inhalte = useMemo(() => vorschau?.mappen ?? {}, [vorschau]);
  return {
    betroffen,
    setBetroffen,
    tiefe,
    setTiefe,
    richtungen,
    setRichtungen,
    vorschau,
    setVorschau,
    wahl,
    setWahl,
    eingang,
    setEingang,
    empfaenger,
    setEmpfaenger,
    anmerkung,
    setAnmerkung,
    passwort,
    setPasswort,
    geprueft,
    setGeprueft,
    auftrag,
    setAuftrag,
    laeuft,
    setLaeuft,
    meldung,
    setMeldung,
    inhalte,
  };
}
export type ErteilenZustand = ReturnType<typeof useAuskunftErteilen>;
export type WahlArt = 'mappen' | 'dokumente' | 'notizen' | 'historie' | 'erwaehnungen';

/** Sammeln, Frist anlegen, Häkchen setzen und Erzeugen. */
export function erteilenAktionen(x: ErteilenZustand, auswahl: AuskunftAuswahl) {
  const { betroffen, tiefe, richtungen, vorschau, eingang, empfaenger, anmerkung, passwort, geprueft, inhalte } = x;
  const { setLaeuft, setMeldung, setVorschau, setGeprueft, setAuftrag, setWahl } = x;
  async function sammeln() {
    if (!betroffen) return;
    setLaeuft(true);
    setMeldung(undefined);
    setVorschau(null);
    setGeprueft(false);
    setAuftrag(null);
    try {
      const v = await datenschutzApi.auskunftVorschau({ mappeId: betroffen.id, tiefe, richtungen });
      setVorschau(v);
      // Zugehörige Mappen ganz; Bezug-Mappen (#472) nur als Erwähnung – ganz aufnehmen nur bewusst.
      setWahl({
        ...vorgabe(
          v.mappen,
          v.baum.knoten.filter((k) => !k.nurBezug).map((k) => k.id),
        ),
        erwaehnungen: new Set(v.baum.knoten.filter((k) => k.nurBezug).map((k) => k.id)),
      });
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  }
  async function frist() {
    if (!betroffen) return;
    try {
      const a = await datenschutzApi.auskunftFrist({ mappeId: betroffen.id, eingang });
      setMeldung({ art: 'gut', text: t('werkbank.datenschutz.aufgabe-angelegt', { text: a.text }) });
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    }
  }
  const schalte = (art: WahlArt, id: string, an: boolean) =>
    setWahl((w) => {
      const n = new Set(w[art]);
      if (an) n.add(id);
      else n.delete(id);
      setGeprueft(false);
      return { ...w, [art]: n };
    });
  /** Bezug-Mappe (#472) bewusst ganz aufnehmen – mit Dokumenten, Notizen und allen Angaben. */
  const ganz = (id: string, an: boolean) => {
    setWahl((w) => (an ? vorgabe(inhalte, [id], w) : { ...w, mappen: new Set([...w.mappen].filter((x) => x !== id)) }));
    setGeprueft(false);
  };
  async function erzeugen() {
    if (!betroffen || !vorschau) return;
    if (
      !passwort &&
      !(await rueckfrage({
        titel: t('werkbank.datenschutz.ohne-passwort-erzeugen'),
        text: t('werkbank.datenschutz.die-zip-datei-ist'),
        ja: t('werkbank.datenschutz.ohne-passwort-erzeugen-2'),
      }))
    )
      return;
    setMeldung(undefined);
    try {
      setAuftrag(
        await datenschutzApi.auskunftStarten({
          mappeId: betroffen.id,
          tiefe,
          richtungen,
          auswahl,
          geprueft,
          passwort,
          empfaenger,
          anmerkung,
        }),
      );
    } catch (e) {
      setMeldung({ art: 'schlecht', text: (e as Error).message });
    }
  }
  return { sammeln, frist, schalte, ganz, erzeugen };
}
