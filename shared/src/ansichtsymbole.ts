import { t } from './texte';
/**
 * Symbole für Ansichten (#428): eine feste Auswahl aus Lucide (https://lucide.dev, lucide-static 0.460.0, ISC) –
 * derselbe Symbolsatz wie im Katalog und in den Clients. Gespeichert wird nur der Lucide-Name (z. B. `house`).
 * Namen werden nie umbenannt oder entfernt, nur ergänzt; ein unbekannter Name (Paket für eine neuere Version)
 * heißt „ohne Symbol“. Die Formen liegen in web/src/ansichtsymbol-formen.ts.
 */
export interface AnsichtSymbolGruppe { gruppe: string; symbole: Array<{ name: string; titel: string }> }

export const ANSICHT_SYMBOLE: AnsichtSymbolGruppe[] = [
  { gruppe: t('gemeinsam.ansichtsymbole.haus-und-wohnen'), symbole: [
    { name: "house", titel: t('gemeinsam.ansichtsymbole.haus') }, { name: "sofa", titel: t('gemeinsam.ansichtsymbole.wohnen-moebel') }, { name: "key-round", titel: t('gemeinsam.ansichtsymbole.schluessel') }, { name: "lamp", titel: t('gemeinsam.ansichtsymbole.lampe') }, { name: "plug", titel: t('gemeinsam.ansichtsymbole.strom') }, { name: "zap", titel: t('gemeinsam.ansichtsymbole.energie') }, { name: "droplet", titel: t('gemeinsam.ansichtsymbole.wasser') }, { name: "flame", titel: t('gemeinsam.ansichtsymbole.heizung-gas') }, { name: "hammer", titel: t('gemeinsam.ansichtsymbole.handwerk') }, { name: "wrench", titel: t('gemeinsam.ansichtsymbole.wartung-reparatur') }, { name: "trees", titel: t('gemeinsam.ansichtsymbole.garten') },
  ] },
  { gruppe: t('gemeinsam.ansichtsymbole.fahrzeuge-und-reisen'), symbole: [
    { name: "car", titel: t('gemeinsam.ansichtsymbole.auto') }, { name: "bike", titel: t('gemeinsam.ansichtsymbole.fahrrad') }, { name: "bus", titel: t('gemeinsam.ansichtsymbole.bus-bahn') }, { name: "plane", titel: t('gemeinsam.ansichtsymbole.reise-flug') }, { name: "fuel", titel: t('gemeinsam.ansichtsymbole.tanken') }, { name: "map-pin", titel: t('gemeinsam.ansichtsymbole.ort') }, { name: "globe", titel: t('gemeinsam.ansichtsymbole.welt-ausland') }, { name: "umbrella", titel: t('gemeinsam.ansichtsymbole.urlaub') },
  ] },
  { gruppe: t('gemeinsam.ansichtsymbole.geld-und-vertraege'), symbole: [
    { name: "euro", titel: t('gemeinsam.ansichtsymbole.geld') }, { name: "wallet", titel: t('gemeinsam.ansichtsymbole.konto-geldboerse') }, { name: "piggy-bank", titel: t('gemeinsam.ansichtsymbole.sparen') }, { name: "credit-card", titel: t('gemeinsam.ansichtsymbole.karte') }, { name: "receipt", titel: t('gemeinsam.ansichtsymbole.rechnung-beleg') }, { name: "landmark", titel: t('gemeinsam.ansichtsymbole.bank-behoerde') }, { name: "signature", titel: t('gemeinsam.ansichtsymbole.vertrag') }, { name: "file-signature", titel: t('gemeinsam.ansichtsymbole.vertragsdokument') }, { name: "scale", titel: t('gemeinsam.ansichtsymbole.recht') }, { name: "shield-check", titel: t('gemeinsam.ansichtsymbole.versicherung') }, { name: "percent", titel: t('gemeinsam.ansichtsymbole.steuern-zinsen') }, { name: "calculator", titel: t('gemeinsam.ansichtsymbole.rechnen') },
  ] },
  { gruppe: "Gesundheit", symbole: [
    { name: "heart", titel: t('gemeinsam.ansichtsymbole.herz') }, { name: "heart-pulse", titel: t('gemeinsam.ansichtsymbole.gesundheit') }, { name: "pill", titel: t('gemeinsam.ansichtsymbole.medikamente') }, { name: "stethoscope", titel: t('gemeinsam.ansichtsymbole.arzt') }, { name: "hospital", titel: t('gemeinsam.ansichtsymbole.krankenhaus') },
  ] },
  { gruppe: t('gemeinsam.ansichtsymbole.familie-und-freizeit'), symbole: [
    { name: "users", titel: t('gemeinsam.ansichtsymbole.familie-personen') }, { name: "user", titel: t('gemeinsam.ansichtsymbole.person') }, { name: "baby", titel: t('gemeinsam.ansichtsymbole.kind') }, { name: "dog", titel: t('gemeinsam.ansichtsymbole.hund') }, { name: "cat", titel: t('gemeinsam.ansichtsymbole.katze') }, { name: "gift", titel: t('gemeinsam.ansichtsymbole.geschenk') }, { name: "graduation-cap", titel: t('gemeinsam.ansichtsymbole.ausbildung') }, { name: "school", titel: t('gemeinsam.ansichtsymbole.schule') }, { name: "music", titel: t('gemeinsam.ansichtsymbole.musik') }, { name: "book-open", titel: t('gemeinsam.ansichtsymbole.buch') }, { name: "utensils", titel: t('gemeinsam.ansichtsymbole.essen') }, { name: "shopping-cart", titel: t('gemeinsam.ansichtsymbole.einkauf') }, { name: "leaf", titel: t('gemeinsam.ansichtsymbole.natur') }, { name: "sun", titel: t('gemeinsam.ansichtsymbole.sommer') },
  ] },
  { gruppe: "Arbeit", symbole: [
    { name: "briefcase", titel: t('gemeinsam.ansichtsymbole.arbeit') }, { name: "building-2", titel: t('gemeinsam.ansichtsymbole.firma-gebaeude') }, { name: "factory", titel: t('gemeinsam.ansichtsymbole.betrieb') }, { name: "laptop", titel: t('gemeinsam.ansichtsymbole.computer') },
  ] },
  { gruppe: t('gemeinsam.ansichtsymbole.post-und-kommunikation'), symbole: [
    { name: "mail", titel: t('gemeinsam.ansichtsymbole.post-e-mail') }, { name: "inbox", titel: t('gemeinsam.ansichtsymbole.posteingang') }, { name: "send", titel: t('gemeinsam.ansichtsymbole.gesendet') }, { name: "phone", titel: t('gemeinsam.ansichtsymbole.telefon') }, { name: "message-square", titel: t('gemeinsam.ansichtsymbole.nachricht') }, { name: "newspaper", titel: t('gemeinsam.ansichtsymbole.zeitung') },
  ] },
  { gruppe: t('gemeinsam.ansichtsymbole.fristen-und-aufgaben'), symbole: [
    { name: "calendar", titel: t('gemeinsam.ansichtsymbole.kalender') }, { name: "clock", titel: t('gemeinsam.ansichtsymbole.zeit') }, { name: "bell", titel: t('gemeinsam.ansichtsymbole.erinnerung') }, { name: "alarm-clock", titel: t('gemeinsam.ansichtsymbole.wecker') }, { name: "list-checks", titel: t('gemeinsam.ansichtsymbole.aufgaben') }, { name: "timer", titel: t('gemeinsam.ansichtsymbole.frist') },
  ] },
  { gruppe: "Ordnung", symbole: [
    { name: "folder", titel: t('gemeinsam.ansichtsymbole.ordner') }, { name: "archive", titel: t('gemeinsam.ansichtsymbole.archiv') }, { name: "tag", titel: t('gemeinsam.ansichtsymbole.schlagwort') }, { name: "star", titel: t('gemeinsam.ansichtsymbole.favoriten') }, { name: "bookmark", titel: t('gemeinsam.ansichtsymbole.lesezeichen') }, { name: "file-text", titel: t('gemeinsam.ansichtsymbole.dokument') }, { name: "files", titel: t('gemeinsam.ansichtsymbole.dokumente') }, { name: "box", titel: t('gemeinsam.ansichtsymbole.kiste') }, { name: "image", titel: t('gemeinsam.ansichtsymbole.bild') }, { name: "camera", titel: t('gemeinsam.ansichtsymbole.foto') },
  ] },
];

export const ANSICHT_SYMBOL_NAMEN: ReadonlySet<string> = new Set(ANSICHT_SYMBOLE.flatMap((g) => g.symbole.map((s) => s.name)));

/** Gültiger Name oder null (unbekannt, leer, kein Text). */
export const ansichtSymbol = (v: unknown): string | null => (typeof v === 'string' && ANSICHT_SYMBOL_NAMEN.has(v.trim()) ? v.trim() : null);
