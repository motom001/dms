/**
 * Zustand und Handlungen des Mappentyp-Editors (#1279 aus `TypEditor` gezogen): Entwurf, offene Bereiche und Felder,
 * Felder hinzufügen, verschieben, entfernen und ausblenden, Speichern und Löschen. Die Oberfläche steht in
 * Einrichtung.tsx und ihren Teilen.
 */
import { useEffect, useMemo, useState } from 'react';
import { feldVerwendung } from '../../../shared/src/darstellung';
import { istIndexplatzhalter, pruefeTitelFilter, vorlageFelder, type Feld as FeldDef, type Mappentyp } from '../../../shared/src/model';
import { regelProblem } from '../../../shared/src/rechte';
import { ApiFehler } from '../api/anfrage';
import { werkbankApi } from '../api/werkbank';
import { useBereiche, type BereichListe, type Klappe } from '../bausteine';
import { useDaten } from '../daten';
import { geheZu, loeseWache } from '../ort';
import { rueckfrage } from '../rueckfrage';
import { t } from '../sprache';
import { useEntwurf } from '../Speicherleiste';
import { useTypNeben } from '../werkbank/Berechtigungen';
import {
  entwurfAus,
  ERST_BEIM_SPEICHERN,
  kopieVon,
  neuesFeld,
  ohneAnker,
  speicherDaten,
  TYP_BEREICHE,
  type Entwurf,
  type EntwurfFeld,
  type TypBereich,
} from './entwurf';

type Pruefung = { allgemein: string[]; felder: Record<string, string[]> };

/** Zustand des Editors: Entwurf, gespeicherter Stand, Bereiche, Fehler und Meldungen. */
export function useTypZustand(typ?: Mappentyp, vorlage?: Mappentyp) {
  const d = useDaten();
  const neu = !typ;
  const system = typ?.system;
  const [start] = useState(() => (typ ? entwurfAus(typ) : vorlage ? kopieVon(vorlage, d.typen) : entwurfAus()));
  // Eine Kopie gilt von Anfang an als ungespeichert.
  const [basis, setBasis] = useState(() => (vorlage && !typ ? '' : JSON.stringify(start)));
  const [e, setE] = useState<Entwurf>(start);
  const [offen, setOffen] = useState<number | null>(null);
  const [ansage, setAnsage] = useState('');

  // Bereiche (#144, Baustein seit #1000): neu = alle offen, bestehend = zu bzw. wie zuletzt auf diesem Gerät.
  const typBereiche: BereichListe<TypBereich> = useMemo(
    () => (neu ? TYP_BEREICHE.filter(([k]) => k !== 'fassungen') : TYP_BEREICHE),
    [neu],
  );
  const bereiche = useBereiche(typBereiche, 'typ', typ?.id ?? null);
  const [fehlerOrte, setFehlerOrte] = useState<Set<TypBereich>>(new Set());
  // Neue Typen bekommen eine eigene Sicht in der Ablage, außer man wählt das ab (#38).
  const [sichtAnlegen, setSichtAnlegen] = useState(true);
  const [fehler, setFehler] = useState<Pruefung | null>(null);
  const [meldung, setMeldung] = useState<string>();
  const [gruende, setGruende] = useState<string[]>([]);
  const [sendet, setSendet] = useState(false);
  // Dienste im Netz und Pakete am Typ (#1640): Teil des Entwurfs, gespeichert mit „Mappentyp speichern“.
  const neben = useTypNeben(typ?.id, system === 'benutzer');
  // Ein leerer neuer Mappentyp gilt nicht als Änderung – Verlassen ohne Rückfrage.
  const ent = useEntwurf(basis + neben.basisText, JSON.stringify(e) + neben.text, {
    neu,
    liste: '/werkbank/typen',
    aus: neu && e.felder.length === 0 && e.name === '',
    zuruecksetzen: () => {
      setE(JSON.parse(basis));
      neben.zuruecksetzen();
      setFehler(null);
      setMeldung(undefined);
      setOffen(null);
    },
  });

  const gespeichert = d.typ(e.id);
  // Gleichzeitig bearbeiten (#917): der Stand, auf dem diese Bearbeitung beruht – geht beim Speichern mit.
  const [stand, setStand] = useState(typ?.geaendert);
  // Hat inzwischen jemand anderes gespeichert und ist hier nichts geändert, gilt gleich der neue Stand.
  useEffect(() => {
    if (neu || !gespeichert || !stand || gespeichert.geaendert <= stand || ent.geaendert) return;
    const frisch = entwurfAus(gespeichert);
    setE(frisch);
    setBasis(JSON.stringify(frisch));
    setStand(gespeichert.geaendert);
  }, [gespeichert?.geaendert, ent.geaendert]); // eslint-disable-line react-hooks/exhaustive-deps -- nur übernehmen, wenn sich der gespeicherte Stand ändert
  // Der Entwurf als Mappentyp, für Regeln und Prüfungen im Editor.
  const entwurfTyp = {
    id: e.id,
    name: e.name,
    beschreibung: e.beschreibung,
    system: system ?? null,
    felder: e.felder as unknown as FeldDef[],
    register: [],
    erstellt: '',
    geaendert: '',
  } as unknown as Mappentyp;
  // Fehler, die man schon vor dem Speichern sieht.
  const liveFehler: Partial<Record<TypBereich, boolean>> = {
    titel:
      vorlageFelder(e.titelVorlage).some((k) => !istIndexplatzhalter(k) && !e.felder.some((f) => f.key === k)) ||
      pruefeTitelFilter({ felder: e.felder as unknown as FeldDef[], titelVorlage: e.titelVorlage }).length > 0,
    berechtigungen: e.berechtigungen.regeln.some((r) => !!regelProblem(r, entwurfTyp)),
  };
  const hatFehler = (k: TypBereich) => fehlerOrte.has(k) || !!liveFehler[k];
  const klappe = (k: TypBereich): Klappe => bereiche.klappe(k, hatFehler(k));
  return {
    ...{ d, typ, neu, system, e, setE, basis, setBasis, offen, setOffen, ansage, setAnsage, bereiche, setFehlerOrte },
    ...{ sichtAnlegen, setSichtAnlegen, fehler, setFehler, meldung, setMeldung, gruende, setGruende, sendet, setSendet },
    ...{ ent, gespeichert, stand, setStand, entwurfTyp, hatFehler, klappe, neben },
  };
}
export type TypZustand = ReturnType<typeof useTypZustand>;

/** Felder hinzufügen, verschieben, entfernen, ändern und ausblenden (#655) – alles nur im Entwurf. */
export function useFeldAktionen(z: TypZustand) {
  const { d, e, setE, setOffen, setFehler, setAnsage, gespeichert } = z;
  const setzeFeld = (i: number, patch: Partial<EntwurfFeld>) =>
    setE((x) => {
      const felder = x.felder.map((f, j) => (j === i ? { ...f, ...patch } : f));
      return { ...x, felder };
    });
  const eindeutigerSchluessel = (basisKey: string, i: number, felder = e.felder) => {
    let k = basisKey;
    let n = 2;
    while (felder.some((g, j) => j !== i && g.key === k)) k = `${basisKey}_${n++}`.slice(0, 40);
    return k;
  };

  function feldHinzufuegen() {
    const i = e.felder.length;
    const f = neuesFeld(eindeutigerSchluessel('neues_feld', i), e.register.find((r) => r.art === 'felder')?.key ?? '');
    setE((x) => ({ ...x, felder: [...x.felder, f] }));
    setOffen(i);
  }
  function verschiebe(i: number, r: number) {
    const j = i + r;
    if (j < 0 || j >= e.felder.length) return;
    setE((x) => {
      const fs = [...x.felder];
      [fs[i], fs[j]] = [fs[j], fs[i]];
      return { ...x, felder: fs };
    });
    setOffen((o) => (o === i ? j : o === j ? i : o));
    setFehler(null);
  }
  async function entferne(i: number) {
    const f = e.felder[i];
    // Ohne Zahlen (#512, kommen noch) lieber nachsehen.
    const n =
      gespeichert && (!d.zahlenDa || d.anzahl(gespeichert.id))
        ? ((await werkbankApi.belegung(gespeichert.id).catch(() => ({}) as Record<string, number>))[f.key] ?? 0)
        : 0;
    const text = n
      ? t('mappentypen.editor.mappen-haben-in-einen', { anzahl: n, label: f.label, ERST_BEIM_SPEICHERN })
      : ERST_BEIM_SPEICHERN.trim();
    if (
      !(await rueckfrage({
        titel: t('mappentypen.editor.feld-entfernen', { label: f.label }),
        text,
        ja: t('mappentypen.editor.entfernen'),
        gefahr: n > 0,
      }))
    )
      return;
    setE((x) => {
      const y = ohneAnker(x, f._uid);
      return {
        ...y,
        titelVorlage: y.titelVorlage.replace(new RegExp(`\\{${f.key}(\\|[^{}]*)?\\}`, 'g'), '').trim(),
        felder: y.felder.filter((g) => g._uid !== f._uid),
      };
    });
    setOffen(null);
    setFehler(null);
  }

  /** Wo das FeldDef noch genutzt wird (#655) – Entwurf mit Spalten als Feldschlüssel. */
  const verwendung = (key: string) =>
    feldVerwendung(
      {
        ...z.entwurfTyp,
        titelVorlage: e.titelVorlage,
        archiv: e.archiv,
        berechtigungen: e.berechtigungen,
        trefferlisten: e.trefferlisten.map((l) => ({
          key: l.key,
          name: l.name,
          beschriftungen: l.beschriftungen,
          spalten: l.spalten.map((k) => (k.startsWith('feld:') ? (e.felder.find((f) => `feld:${f._uid}` === k)?.key ?? k) : k)),
        })),
      },
      key,
      d.sichten,
    );
  /**
   * Felder ausblenden (#655): Wird eines noch genutzt, fragt der Editor vorher; Pflicht hebt er mit Hinweis auf.
   * `uids` sind die betroffenen Felder (ein FeldDef oder alle eines Registers); `dann` setzt das Ausblenden selbst.
   */
  async function ausblendenFragen(uids: string[], titel: string, dann: (x: Entwurf) => Entwurf) {
    const felder = e.felder.filter((f) => uids.includes(f._uid));
    const genutzt = felder.flatMap((f) => verwendung(f.key).map((v) => (felder.length > 1 ? `${f.label || f.key}: ${v}` : v)));
    if (
      genutzt.length &&
      !(await rueckfrage({
        titel,
        text: t('mappentypen.darstellung.noch-genutzt', { liste: genutzt.join(' · ') }),
        ja: t('mappentypen.darstellung.trotzdem-ausblenden'),
      }))
    )
      return;
    setE((x) => {
      const y = dann(x);
      return { ...y, felder: y.felder.map((f) => (uids.includes(f._uid) && f.pflicht ? { ...f, pflicht: false, _pflichtWeg: true } : f)) };
    });
    const weg = felder.filter((f) => f.pflicht).map((f) => f.label || f.key);
    if (weg.length) setAnsage(t('mappentypen.darstellung.pflicht-aufgehoben-ansage', { felder: weg.join(', ') }));
  }
  return { setzeFeld, eindeutigerSchluessel, feldHinzufuegen, verschiebe, entferne, ausblendenFragen };
}
export type FeldAktionen = ReturnType<typeof useFeldAktionen>;

/** Bereiche mit Fehler markieren und aufklappen (#144). */
function fehlerZeigen(z: TypZustand, f: ApiFehler) {
  const { setFehler, setOffen, setFehlerOrte, setMeldung, bereiche } = z;
  const orte = new Set<TypBereich>();
  if (f.pruefung) {
    setFehler(f.pruefung);
    const erstes = Object.keys(f.pruefung.felder)[0];
    if (erstes !== undefined) {
      setOffen(Number(erstes));
      orte.add('felder');
    }
    for (const o of f.pruefung.orte ?? []) if (TYP_BEREICHE.some(([k]) => k === o)) orte.add(o as TypBereich);
    if (f.pruefung.allgemein.length > (f.pruefung.orte?.length ?? 0)) orte.add('grunddaten');
  }
  if ((f.details as { berechtigungen?: boolean } | undefined)?.berechtigungen) orte.add('berechtigungen');
  setFehlerOrte(orte);
  if (orte.size) bereiche.oeffne(TYP_BEREICHE.map(([k]) => k).filter((k) => orte.has(k)));
  setMeldung(f.message);
}

/** Speichern und Löschen (#917 Konflikt, #142 niemand darf lesen, #1050 doppelte Kombination, #144 Fehlerorte). */
export function useTypSpeichern(z: TypZustand) {
  const { d, neu, e, setE, setBasis, setOffen, setFehler, setMeldung, setFehlerOrte, bereiche } = z;

  /** Antwort des Servers nach einem erfolgreichen Speichern übernehmen. */
  async function gespeichertAls(mappentyp: Mappentyp) {
    const sauber = entwurfAus(mappentyp);
    setE(sauber);
    setBasis(JSON.stringify(sauber));
    z.setStand(mappentyp.geaendert);
    setFehler(null);
    setOffen(null);
    setFehlerOrte(new Set());
    // Ein neuer Typ bleibt nach dem Anlegen aufgeklappt wie gerade.
    if (neu) bereiche.merke(mappentyp.id);
    loeseWache();
    await d.neuLaden();
    if (neu) geheZu(`/werkbank/typen/${mappentyp.id}`);
    else setMeldung(t('mappentypen.editor.mappentyp-gespeichert'));
  }

  /** 409 mit Rückfrage: true, wenn erledigt (nochmals gespeichert oder Meldung gesetzt). */
  async function konflikt(f: ApiFehler, bestaetigt: boolean, doppelteBestaetigt: boolean): Promise<boolean> {
    const details = f.details as { konflikt?: boolean; niemand?: number; zusammengesetzt?: unknown[] } | undefined;
    if (f.status !== 409) return false;
    // Inzwischen von jemand anderem gespeichert (#917): nichts überschrieben; den neuen Stand holen –
    // „Verwerfen“ zeigt ihn dann, die eigenen Änderungen bleiben bis dahin stehen.
    if (details?.konflikt) {
      setMeldung(f.message);
      await d.neuLaden();
      return true;
    }
    // Berechtigungen (#142): Danach könnte niemand mehr Mappen dieses Typs lesen – nachfragen.
    if (
      details?.niemand &&
      !bestaetigt &&
      (await rueckfrage({
        titel: t('mappentypen.editor.trotzdem-speichern'),
        text: f.message,
        ja: t('mappentypen.editor.trotzdem-speichern-2'),
        gefahr: true,
      }))
    ) {
      z.setSendet(false);
      await speichern(true, doppelteBestaetigt);
      return true;
    }
    // Zusammengesetzt (#1050): Danach hätten mehrere Mappen dieselbe Kombination – mit Anzahl nachfragen, nie still speichern.
    if (!details?.zusammengesetzt?.length) return false;
    if (
      !doppelteBestaetigt &&
      (await rueckfrage({
        titel: t('mappentypen.zusammengesetzt.doppelte-titel'),
        text: f.message,
        ja: t('mappentypen.editor.trotzdem-speichern-2'),
      }))
    ) {
      z.setSendet(false);
      await speichern(bestaetigt, true);
      return true;
    }
    setMeldung(t('mappentypen.zusammengesetzt.nicht-gespeichert'));
    return true;
  }

  async function speichern(bestaetigt = false, doppelteBestaetigt = false) {
    z.setSendet(true);
    setMeldung(undefined);
    z.setGruende([]);
    const daten = speicherDaten(e);
    try {
      const mappentyp = neu
        ? await werkbankApi.typAnlegen({ ...daten, sichtAnlegen: z.sichtAnlegen })
        : await werkbankApi.typAendern(e.id, {
            ...daten,
            bestaetigt,
            stand: z.stand,
            ...(doppelteBestaetigt ? { doppelteBestaetigt } : {}),
          });
      // #1640: Dienste im Netz und Pakete am Typ nach dem Mappentyp – mit der Id auch eines neuen.
      const nebenFehler = await z.neben.speichern(mappentyp.id).then(
        () => '',
        (x: Error) => x.message,
      );
      await gespeichertAls(mappentyp);
      if (nebenFehler) setMeldung(nebenFehler);
    } catch (err) {
      const f = err as ApiFehler;
      if (!(await konflikt(f, bestaetigt, doppelteBestaetigt))) fehlerZeigen(z, f);
    } finally {
      z.setSendet(false);
    }
  }

  async function loeschen() {
    if (neu) {
      loeseWache();
      geheZu('/werkbank/typen');
      return;
    }
    try {
      await werkbankApi.typLoeschen(e.id);
      loeseWache();
      await d.neuLaden();
      geheZu('/werkbank/typen');
    } catch (err) {
      setMeldung((err as Error).message);
      z.setGruende((err as ApiFehler).gruende ?? []);
    }
  }
  return { speichern, loeschen };
}
