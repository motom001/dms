import { SAMMELSCHRITTE, type PlanPaket, type Planprobleme } from '../../../shared/src/einrichtungsplan';
import { einrichtungApi } from '../api/einrichtung';
import { t } from '../sprache';
import type { PaketWahl } from '../werkbank/PaketAblauf';
import { geheim, holeStand, planAus, sammlungAus, setzeSammlung, setzeStand, type Ansicht } from './stand';

/**
 * Konfigurationsdatei (#806) und Prüfen vor „Jetzt einrichten“ (#804): Laden füllt alle Schritte vor und springt zur
 * Zusammenfassung – oder zum ersten Schritt, der nicht passt, mit dem Grund. Passwörter stehen nie in der Datei; der
 * Assistent fragt sie ab.
 */

export const ersterProblemschritt = (p: Planprobleme): Ansicht | undefined => SAMMELSCHRITTE.find((s) => p[s]?.length);

/** Pakete aus der Datei ohne Rückfrage übernehmen – nur, wenn nichts zu bestätigen ist; sonst der Grund. */
async function paketeAusVorgabe(vorgabe: PlanPaket[]): Promise<string | null> {
  try {
    const k = (await einrichtungApi.einrichtungPaketKatalog()).kataloge.find((x) => x.offiziell);
    if (!k?.katalog) return t('einrichtung.pakete.katalog', { fehler: k?.fehler ?? '' });
    const fehlen = vorgabe.filter((v) => !k.katalog!.pakete.some((p) => p.id === v.id)).map((v) => v.id);
    if (fehlen.length) return t('einrichtung.pakete.unbekannt', { namen: fehlen.join(', ') });
    const plan = await einrichtungApi.einrichtungPaketPlan({ pakete: vorgabe.map((v) => v.id) });
    // Rechte, Herkunft, Namen und Pflicht-Einstellungen bestätigt immer ein Mensch – auch mit Datei.
    const fragen = plan.probleme.length > 0 || plan.herkunftBestaetigen || plan.rechte.bestaetigen || !!plan.ausgelassen?.length
      || plan.pakete.some((p) => p.einstellungen.length > 0 || p.vorschau.probleme.length > 0
        || p.vorschau.typen.some((x) => !x.vorhanden && !x.geloescht && x.konflikt) || p.vorschau.sichten.some((x) => !x.vorhanden && x.konflikt));
    if (fragen) return t('einrichtung.pakete.bestaetigen');
    const je = (id: string) => vorgabe.find((v) => v.id === id);
    const auto = (p: (typeof plan.pakete)[number]) => Object.fromEntries((p.vorschau.automatisierungen ?? []).filter((a) => a.neu).map((a) => [a.schluessel, je(p.id)?.automatisierungen[a.schluessel] !== false]));
    const beispiele = plan.pakete.filter((p) => je(p.id)?.beispiele && p.vorschau.beispiele > 0 && !p.vorschau.update).map((p) => p.id);
    const wahl: PaketWahl = {
      eingabe: {
        pakete: vorgabe.map((v) => v.id), namen: {}, sichtNamen: {}, beispiele, spaeter: [], einstellungen: {},
        automatisierungen: Object.fromEntries(plan.pakete.map((p) => [p.id, Object.entries(auto(p)).filter(([, an]) => an).map(([s]) => s)])),
      },
      pakete: plan.pakete.map((p) => ({ id: p.id, name: p.name, version: p.version, gewaehlt: p.gewaehlt, beispiele: beispiele.includes(p.id), automatisierungen: auto(p) })),
      neueTypen: plan.pakete.reduce((n, p) => n + p.vorschau.typen.filter((x) => !x.vorhanden && !x.geloescht).length, 0),
      mitEinstellungen: false,
    };
    setzeSammlung((s) => ({ ...s, pakete: wahl, paketeVorgabe: null }));
    return null;
  } catch (e) { return (e as Error).message; }
}

/** Alles prüfen, ohne etwas anzulegen; die Gründe stehen danach je Schritt in der Sammlung. */
export async function pruefeAlles(): Promise<Planprobleme> {
  const s = holeStand().sammlung;
  const { probleme } = await einrichtungApi.einrichtungPruefen(planAus(s), geheim.konto || undefined);
  const p: Planprobleme = { ...probleme };
  const dazu = (k: keyof Planprobleme, m: string | null) => { if (m) p[k] = [...(p[k] ?? []), m]; };
  if (s.paketeVorgabe?.length && !s.pakete) dazu('pakete', await paketeAusVorgabe(s.paketeVorgabe));
  const jetzt = holeStand().sammlung;
  if (jetzt.optional.beispiele && (jetzt.pakete?.neueTypen ?? 0) > 0) dazu('optional', t('einrichtung.optional.beispiele.pakete'));
  if (jetzt.optional.mail?.mitPasswort && !geheim.mail) dazu('optional', t('einrichtung.plan.mail.passwort'));
  setzeSammlung((x) => ({ ...x, probleme: p }));
  return p;
}

/** Nach dem Laden (bzw. nach der Datenbank): prüfen und zum ersten Schritt springen, der nicht passt. */
export async function nachDemLaden() {
  setzeSammlung((s) => ({ ...s, pruefungOffen: false }));
  const p = await pruefeAlles();
  // Zuerst, was nicht passt; dann, was die Datei offen lässt (z. B. ohne Paketliste); sonst die Zusammenfassung.
  setzeSammlung((s) => ({ ...s, ansicht: ersterProblemschritt(p) ?? SAMMELSCHRITTE.find((x) => !s.besucht.includes(x)) ?? 'zusammenfassung', zurZusammenfassung: true }));
}

/** Datei lesen; Fehler mit Zeile und Feld stehen danach oben im Schritt. */
export async function ladeDatei(text: string, imEinrichtungsmodus: boolean) {
  const r = await einrichtungApi.einrichtungDateiLesen(text);
  if (!r.plan || r.fehler.length) { setzeStand((x) => ({ ...x, dateiFehler: r.fehler })); return; }
  geheim.konto = ''; geheim.mail = ''; geheim.paketEinstellungen = undefined;
  setzeStand((x) => ({ ...x, neu: true, lauf: null, aendern: null, dateiFehler: [], sammlung: { ...sammlungAus(r.plan!, r.hinweise), pruefungOffen: true } }));
  if (!imEinrichtungsmodus) await nachDemLaden();
}

/** „Als Datei speichern“ in der Zusammenfassung: ohne Passwörter und ohne Schlüssel. */
export async function speichereDatei() {
  const r = await einrichtungApi.einrichtungDateiSchreiben(planAus(holeStand().sammlung));
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([r.text], { type: 'application/yaml' })), download: r.name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

/** Auf dem Schritt „Einrichtungscode“ gewählt: erst nach dem Code prüfen. */
let wartend: string | null = null;
export const merkeDatei = (text: string) => { wartend = text; };
export const nimmDatei = () => { const x = wartend; wartend = null; return x; };
