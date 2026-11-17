import { useContext, useState } from 'react';
import {
  vorausgewaehlt,
  type AblaufEingabe,
  type AblaufErgebnis,
  type AblaufInstallation,
  type AblaufPlan,
} from '../../../../shared/src/pakete';
import { ApiFehler } from '../../api/anfrage';
import { paketeApi, type PaketVorschau } from '../../api/pakete';
import { t } from '../../sprache';
import { PaketApiKontext, type PaketVorgabe, type PaketWahl } from './kontext';

/**
 * Zustand der Fragen im Paket-Ablauf (#405; #1279 aus Fragen gezogen): Namen, Beispiele, Automatisierungen,
 * Bestätigungen, Pflicht-Einstellungen – und daraus, was noch fehlt, die Antworten und das Installieren.
 */

type Plan = AblaufPlan<PaketVorschau>;
export type AblaufPaketV = Plan['pakete'][number];

export const leer = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
export const konfliktTypen = (p: AblaufPaketV) => p.vorschau.typen.filter((x) => !x.vorhanden && !x.geloescht && x.konflikt);
export const konfliktSichten = (p: AblaufPaketV) => p.vorschau.sichten.filter((x) => !x.vorhanden && x.konflikt);
const gleich = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.toLowerCase();

/** Neue Namen bei Konflikten (#1123): je Paket, vorbelegt mit dem Vorschlag des Servers. */
function useNamen(pk: AblaufPaketV[]) {
  const [namen, setNamen] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(pk.map((p) => [p.id, Object.fromEntries(konfliktTypen(p).map((x) => [x.schluessel, x.vorschlag ?? x.name]))])),
  );
  const [sichtNamen, setSichtNamen] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(pk.map((p) => [p.id, Object.fromEntries(konfliktSichten(p).map((x) => [x.schluessel, x.vorschlag ?? x.name]))])),
  );
  const leereNamen = pk.some(
    (p) => Object.values(namen[p.id] ?? {}).some((n) => !n.trim()) || Object.values(sichtNamen[p.id] ?? {}).some((n) => !n.trim()),
  );
  const nochKonflikt = pk.some(
    (p) =>
      konfliktTypen(p).some((x) => gleich(namen[p.id]?.[x.schluessel], x.name)) ||
      konfliktSichten(p).some((x) => gleich(sichtNamen[p.id]?.[x.schluessel], x.name)),
  );
  return { namen, setNamen, sichtNamen, setSichtNamen, leereNamen, nochKonflikt };
}

/** Beispiele (für alle, je Paket abwählbar) und mitgelieferte Automatisierungen (#712, #1082). */
function useBeispieleUndAutomatisierungen(pk: AblaufPaketV[], vorgabe?: PaketVorgabe) {
  const mitBeispielen = pk.filter((p) => p.vorschau.beispiele > 0 && !p.vorschau.update);
  const [beispiele, setBeispiele] = useState(() => !!vorgabe && mitBeispielen.some((p) => vorgabe.beispiele.includes(p.id)));
  const [ohneBeispiele, setOhneBeispiele] = useState<string[]>(() =>
    vorgabe ? mitBeispielen.filter((p) => !vorgabe.beispiele.includes(p.id)).map((p) => p.id) : [],
  );
  // Mitgelieferte Automatisierungen (#712): abgewählte bleiben aus („paket|schlüssel“). Vorausgewählt (#1082): die mit
  // eingeschaltet: true – nennt ein Paket das nirgends, wie bisher alle.
  const mitAutomatisierungen = pk.filter((p) => (p.vorschau.automatisierungen ?? []).some((a) => a.neu));
  const [ohneAutomatisierung, setOhneAutomatisierung] = useState<string[]>(() => [
    ...new Set([
      ...(vorgabe?.automatisierungenAus ?? []),
      ...mitAutomatisierungen.flatMap((p) => {
        const an = vorausgewaehlt(p.vorschau.automatisierungen ?? []);
        return (p.vorschau.automatisierungen ?? [])
          .filter((a) => a.neu && !an.includes(a.schluessel))
          .map((a) => `${p.id}|${a.schluessel}`)
          .filter((k) => !vorgabe?.automatisierungenAn?.includes(k) && !vorgabe?.automatisierungenAus.includes(k));
      }),
    ]),
  ]);
  const angehakt = Object.fromEntries(
    mitAutomatisierungen.map((p) => [
      p.id,
      (p.vorschau.automatisierungen ?? [])
        .filter((a) => a.neu && !ohneAutomatisierung.includes(`${p.id}|${a.schluessel}`))
        .map((a) => a.schluessel),
    ]),
  );
  const anzahlAn = Object.values(angehakt).reduce((n, l) => n + l.length, 0);
  const beispielPakete = beispiele ? mitBeispielen.filter((p) => !ohneBeispiele.includes(p.id)) : [];
  return {
    mitBeispielen,
    beispiele,
    setBeispiele,
    ohneBeispiele,
    setOhneBeispiele,
    mitAutomatisierungen,
    ohneAutomatisierung,
    setOhneAutomatisierung,
    angehakt,
    anzahlAn,
    beispielPakete,
  };
}

/** Pflicht-Einstellungen (oder bewusst später) und bestätigte Dienst-Adressen (#444). */
function useEinstellungen(pk: AblaufPaketV[]) {
  const [adresseOk, setAdresseOk] = useState(false);
  const mitEinstellungen = pk.filter((p) => p.einstellungen.length > 0);
  const [werte, setWerte] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(mitEinstellungen.map((p) => [p.id, Object.fromEntries(p.einstellungen.map((f) => [f.schluessel, null]))])),
  );
  const [spaeter, setSpaeter] = useState<string[]>([]);
  return { adresseOk, setAdresseOk, mitEinstellungen, werte, setWerte, spaeter, setSpaeter };
}

/** Was noch fehlt, bevor installiert werden kann – je Grund ein Satz. */
function fehltVon(x: {
  plan: Plan;
  herkunftOk: boolean;
  rechteOk: boolean;
  erstmals: number;
  herausgeberOk: boolean;
  namen: boolean;
  offenePflicht: AblaufPaketV[];
  adressen: number;
  adresseOk: boolean;
}) {
  return [
    x.plan.herkunftBestaetigen && !x.herkunftOk ? t('pakete.ablauf.fehlt.herkunft') : '',
    x.plan.rechte.bestaetigen && !x.rechteOk ? t('pakete.ablauf.fehlt.rechte') : '',
    x.erstmals && !x.herausgeberOk ? t('pakete.ablauf.fehlt.herausgeber') : '',
    x.namen ? t('pakete.ablauf.fehlt.namen') : '',
    x.offenePflicht.length ? t('pakete.ablauf.fehlt.einstellungen', { namen: x.offenePflicht.map((p) => p.name).join(', ') }) : '',
    x.adressen && !x.adresseOk ? t('pakete.ablauf.fehlt.adresse') : '',
  ].filter(Boolean);
}

export function useFragen({ plan, vorgabe, eingabe }: { plan: Plan; vorgabe?: PaketVorgabe; eingabe(): AblaufEingabe }) {
  const pk = plan.pakete;
  const pa = useContext(PaketApiKontext);
  const n = useNamen(pk);
  const b = useBeispieleUndAutomatisierungen(pk, vorgabe);
  const [herkunftOk, setHerkunftOk] = useState(false);
  const [rechteOk, setRechteOk] = useState(false);
  // Erstmals gesetzte Herausgeber von Bestandspaketen (#1084): ein eigener Haken.
  const [herausgeberOk, setHerausgeberOk] = useState(false);
  const erstmals = pk.filter((p) => p.vorschau.herausgeberBestaetigen);
  const e = useEinstellungen(pk);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<{ text: string; gruende?: string[] }>();
  const [laeuft, setLaeuft] = useState(false);

  const mitCode = pk.filter((p) => p.vorschau.laeufer);
  const adressen = e.mitEinstellungen
    .filter((p) => !e.spaeter.includes(p.id))
    .flatMap((p) =>
      p.einstellungen
        .filter((f) => f.typ === 'adresse' && !leer(e.werte[p.id]?.[f.schluessel]))
        .map((f) => ({ paket: p.name, wert: String(e.werte[p.id][f.schluessel]) })),
    );
  const offenePflicht = e.mitEinstellungen.filter(
    (p) => !e.spaeter.includes(p.id) && p.einstellungen.some((f) => leer(e.werte[p.id]?.[f.schluessel])),
  );
  const fehlt = fehltVon({
    plan,
    herkunftOk,
    rechteOk,
    erstmals: erstmals.length,
    herausgeberOk,
    namen: n.leereNamen || n.nochKonflikt,
    offenePflicht,
    adressen: adressen.length,
    adresseOk: e.adresseOk,
  });
  // Namenskonflikte (#1123) stehen auch in den Problemen; umbenannt wird oben, dann verhindern sie nichts.
  const probleme = [
    ...plan.probleme,
    ...pk.flatMap((p) => p.vorschau.probleme.filter((x) => !p.vorschau.namenskonflikte?.includes(x)).map((x) => `${p.name}: ${x}`)),
  ];
  const namenskonflikte = pk.flatMap((p) => (p.vorschau.namenskonflikte ?? []).map((x) => `${p.name}: ${x}`));
  const neueTypen = pk.reduce((m, p) => m + p.vorschau.typen.filter((x) => !x.vorhanden && !x.geloescht).length, 0);
  const neueSichten = pk.reduce((m, p) => m + p.vorschau.sichten.filter((x) => !x.vorhanden).length, 0);
  const updates = pk.filter((p) => p.vorschau.update);

  const antworten = (): AblaufInstallation => ({
    ...eingabe(),
    namen: n.namen,
    sichtNamen: n.sichtNamen,
    beispiele: b.beispielPakete.map((p) => p.id),
    automatisierungen: b.angehakt,
    ...(herkunftOk ? { bestaetigt: true } : {}),
    ...(rechteOk ? { rechteStand: plan.rechte.stand } : {}),
    ...(herausgeberOk ? { herausgeberBestaetigt: true } : {}),
    einstellungen: Object.fromEntries(Object.entries(e.werte).filter(([id]) => !e.spaeter.includes(id))),
    spaeter: e.spaeter,
    ...(e.adresseOk ? { adresseBestaetigt: true } : {}),
  });
  return {
    pk,
    pa,
    ...n,
    ...b,
    ...e,
    herkunftOk,
    setHerkunftOk,
    rechteOk,
    setRechteOk,
    herausgeberOk,
    setHerausgeberOk,
    erstmals,
    fehler,
    setFehler,
    meldung,
    setMeldung,
    laeuft,
    setLaeuft,
    mitCode,
    adressen,
    fehlt,
    probleme,
    namenskonflikte,
    neueTypen,
    neueSichten,
    updates,
    antworten,
  };
}
export type FragenZustand = ReturnType<typeof useFragen>;

/** Wahl für den Einrichtungsassistenten (#804): nur merken – installiert wird erst mit „Jetzt einrichten“. */
export function wahlVon(z: FragenZustand): PaketWahl {
  return {
    eingabe: z.antworten(),
    neueTypen: z.neueTypen,
    mitEinstellungen: z.mitEinstellungen.some((p) => !z.spaeter.includes(p.id)),
    pakete: z.pk.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      gewaehlt: p.gewaehlt,
      beispiele: z.beispielPakete.includes(p),
      automatisierungen: Object.fromEntries(
        (p.vorschau.automatisierungen ?? [])
          .filter((a) => a.neu)
          .map((a) => [a.schluessel, !z.ohneAutomatisierung.includes(`${p.id}|${a.schluessel}`)]),
      ),
    })),
  };
}

/** Installieren mit allen Antworten; bei geänderten Rechten (z. B. neuer Katalog) den Plan neu holen. */
export async function installiere(
  z: FragenZustand,
  x: { plan: Plan; eingabe(): AblaufEingabe; neuerPlan(p: Plan): void; fertig(e: AblaufErgebnis): void },
) {
  z.setLaeuft(true);
  z.setMeldung(undefined);
  z.setFehler({});
  try {
    const e = await paketeApi.paketAblaufInstallieren(z.antworten());
    x.fertig(e);
  } catch (f) {
    const d =
      f instanceof ApiFehler ? (f.details as { rechteStand?: string; felderFehler?: Record<string, string> } | undefined) : undefined;
    z.setMeldung({ text: (f as Error).message, gruende: f instanceof ApiFehler ? f.gruende : [] });
    if (d?.felderFehler) z.setFehler(d.felderFehler);
    // Die Rechte haben sich geändert (z. B. neuer Katalog): neu zeigen, neu bestätigen.
    if (d?.rechteStand && d.rechteStand !== x.plan.rechte.stand) {
      try {
        x.neuerPlan(await z.pa.plan(x.eingabe()));
      } catch {
        /* Meldung steht schon da */
      }
    }
  } finally {
    z.setLaeuft(false);
  }
}

/** Den Plan neu holen (#646), z. B. wenn ein Paket sich beim ersten Mal nicht laden ließ. */
export async function nochmal(z: FragenZustand, eingabe: () => AblaufEingabe, neuerPlan: (p: Plan) => void) {
  z.setLaeuft(true);
  z.setMeldung(undefined);
  try {
    neuerPlan(await z.pa.plan(eingabe()));
  } catch (x) {
    z.setMeldung({ text: (x as Error).message, gruende: x instanceof ApiFehler ? x.gruende : [] });
  } finally {
    z.setLaeuft(false);
  }
}
