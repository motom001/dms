/**
 * Sprache eines Texts erkennen (#395) – offline, ohne fremde Bibliothek und ohne fremden Datensatz.
 *
 * Verfahren: Jede Sprache hat eine kurze, selbst zusammengestellte Liste häufiger Funktionswörter
 * (Artikel, Präpositionen, Bindewörter, Höflichkeitsformen) und einige typische Buchstaben
 * (ä/ß, ñ, ı/ğ/ş, ą/ł …). Gezählt wird, wie viele Wörter des Texts auf den Listen stehen, dazu ein
 * kleiner Zuschlag für die Buchstaben. Nicht-lateinische Schriften (Kyrillisch, Arabisch) erkennt die
 * Funktion vorher am Zeichenbereich. Das reicht für Briefe, Rechnungen und Belege mit ein paar Sätzen
 * und kostet praktisch keine Rechenzeit; für einzelne Wörter oder Zahlenkolonnen gibt es bewusst
 * kein Ergebnis (null).
 *
 * Sprachkennungen sind die von Tesseract (deu, eng, fra …), damit sie direkt als Sprachpaket taugen.
 */

export interface SpracheInfo {
  /** Anzeigename (Deutsch). */
  name: string;
  /** Konfiguration der PostgreSQL-Volltextsuche (Wortstämme); „simple“, wenn es keine gibt. */
  pg: string;
  /** Alpine-Paket mit dem Sprachpaket für Tesseract. */
  paket: string;
}

const info = (name: string, code: string, pg: string): SpracheInfo => ({ name, pg, paket: `tesseract-ocr-data-${code}` });

/** Sprachen, die die Erkennung unterscheidet (Tesseract-Kennung → Angaben). */
export const TEXTSPRACHEN: Record<string, SpracheInfo> = {
  deu: info('Deutsch', 'deu', 'german'),
  eng: info('Englisch', 'eng', 'english'),
  fra: info('Französisch', 'fra', 'french'),
  spa: info('Spanisch', 'spa', 'spanish'),
  ita: info('Italienisch', 'ita', 'italian'),
  nld: info('Niederländisch', 'nld', 'dutch'),
  tur: info('Türkisch', 'tur', 'turkish'),
  pol: info('Polnisch', 'pol', 'simple'),
  por: info('Portugiesisch', 'por', 'portuguese'),
  rus: info('Russisch', 'rus', 'russian'),
  ukr: info('Ukrainisch', 'ukr', 'simple'),
  ara: info('Arabisch', 'ara', 'arabic'),
};

/** Name einer Sprache für die Anzeige („fra“ → „Französisch“, Unbekanntes bleibt die Kennung). */
export const sprachname = (code: string) => TEXTSPRACHEN[code]?.name ?? code;

export type Schrift = 'latein' | 'kyrillisch' | 'arabisch' | 'griechisch' | 'andere';

export interface ErkannteSprache {
  /** Tesseract-Kennung, z. B. „fra“. */
  sprache: string;
  /** 0 bis 1: wie eindeutig das Ergebnis ist. */
  konfidenz: number;
  schrift: Schrift;
}

/* Häufige Funktionswörter je Sprache – bewusst kurz und selbst zusammengestellt. */
const WOERTER: Record<string, string> = {
  deu: 'der die das und ist nicht ein eine einen einem dem den des mit von zu auf für im sie wir ich es bitte ihre ihr sehr sind wird werden auch oder bei nach aus über wie als vom zum zur noch nur haben hat wurde unter diese dieser sich',
  eng: 'the and of to is for on with that this you your are be by from at we our it not have has will please or was were dear any which their there been would should these thank',
  fra: 'le la les et des du un une est pour dans que qui sur pas avec vous nous au aux ce cette sont par ne plus votre vos il elle être merci madame monsieur nos leur été avez sera',
  spa: 'el la los las y de del que en un una es por para con no se su sus al lo como más pero usted muy gracias este esta señor estimado nuestro hemos tiene están',
  ita: 'il lo la gli le e di del della che è per non un una con sono si al alla ma come anche questo questa nel suo sua grazie gentile nostro dei delle alle sul',
  nld: 'de het een en van is dat niet op te met voor zijn er aan ook als bij uw wij u door naar maar dit wordt deze geen onze hebben heeft graag',
  tur: 've bir bu da de ile için çok ne gibi daha olan olarak değil ama sonra kadar her ben biz siz mi mı var yok şu ki veya sayın teşekkür ederiz lütfen',
  pol: 'i w z na nie się jest to że do jak ale co od po za tak dla czy jego jej przez są być już tylko oraz pan pani prosimy dziękujemy który która',
  por: 'o a os as e de do da dos das que em um uma é para com não por no na se mais como ao seu sua ou foi são obrigado você nossa nosso pelo pela',
  rus: 'и в не на я что с он как это по но из у к за то же от так все она бы мы вы для уважаемый спасибо ваш наш',
  ukr: 'і в не на я що з він як це по але із у к за те від так все вона б ми ви для шановний дякуємо ваш наш є',
};
const LISTEN: Record<string, Set<string>> = Object.fromEntries(Object.entries(WOERTER).map(([k, v]) => [k, new Set(v.split(' '))]));

/* Typische Buchstaben (je Vorkommen ein kleiner Zuschlag). */
const ZEICHEN: Record<string, string> = {
  deu: 'äöüß', fra: 'éèêàçœùî', spa: 'ñ¿¡áíóú', ita: 'àèìòù', tur: 'ığşİ', pol: 'ąęłńśźżć', por: 'ãõçâêô', nld: '',
  rus: 'ыэъё', ukr: 'іїєґ',
};

const LATEIN = /[a-zà-ɏ]/;
const KYRILLISCH = /[Ѐ-ӿ]/;
const ARABISCH = /[؀-ۿ]/;
const GRIECHISCH = /[Ͱ-Ͽ]/;

/** Überwiegende Schrift eines Texts (null bei zu wenig Buchstaben). */
export function schriftVon(text: string): Schrift | null {
  const z = { latein: 0, kyrillisch: 0, arabisch: 0, griechisch: 0, andere: 0 };
  for (const c of text.toLowerCase()) {
    if (LATEIN.test(c)) z.latein++;
    else if (KYRILLISCH.test(c)) z.kyrillisch++;
    else if (ARABISCH.test(c)) z.arabisch++;
    else if (GRIECHISCH.test(c)) z.griechisch++;
    else if (/\p{L}/u.test(c)) z.andere++;
  }
  const [beste, n] = (Object.entries(z) as [Schrift, number][]).sort((a, b) => b[1] - a[1])[0];
  return n >= 20 ? beste : null;
}

/** Wörter in Kleinbuchstaben (nur Buchstaben; Zahlen und Zeichen fallen weg). */
const woerter = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/**
 * Sprache eines Texts. null, wenn der Text zu kurz oder zu uneindeutig ist
 * (z. B. nur Zahlen, Namen oder einzelne Wörter).
 */
export function erkenneSprache(text: string): ErkannteSprache | null {
  // Lange Texte reichen in Auszügen: Anfang und Mitte, zusammen höchstens ~20 000 Zeichen.
  const probe = text.length > 20_000 ? text.slice(0, 12_000) + ' ' + text.slice(Math.floor(text.length / 2), Math.floor(text.length / 2) + 8_000) : text;
  const schrift = schriftVon(probe);
  if (!schrift) return null;
  if (schrift === 'arabisch') return { sprache: 'ara', konfidenz: 0.6, schrift };
  if (schrift === 'griechisch' || schrift === 'andere') return null;
  const kandidaten = schrift === 'kyrillisch' ? ['rus', 'ukr'] : ['deu', 'eng', 'fra', 'spa', 'ita', 'nld', 'tur', 'pol', 'por'];
  const liste = woerter(probe).filter((w) => schrift !== 'kyrillisch' || KYRILLISCH.test(w));
  if (liste.length < 8) return null;
  const klein = probe.toLowerCase();
  const punkte = kandidaten.map((s) => {
    let p = 0;
    for (const w of liste) if (LISTEN[s].has(w)) p++;
    let z = 0;
    for (const c of ZEICHEN[s] ?? '') z += klein.split(c.toLowerCase()).length - 1;
    // Buchstaben zählen halb und höchstens so viel wie die Wörter – sie entscheiden nur knappe Fälle.
    return { s, p: p + Math.min(z * 0.5, Math.max(p, 2)), woerter: p };
  }).sort((a, b) => b.p - a.p);
  const [erste, zweite] = punkte;
  if (erste.woerter < 3) return null;
  // Eindeutigkeit: Abstand zur zweitbesten Sprache, gewichtet mit dem Anteil erkannter Funktionswörter
  // (bei Briefen etwa 30–50 %, bei Rechnungen weniger; ab 15 % gilt das als voll).
  const abstand = (erste.p - (zweite?.p ?? 0)) / erste.p;
  const anteil = Math.min(1, erste.woerter / liste.length / 0.15);
  const konfidenz = Math.round(Math.min(1, abstand * 0.7 + anteil * 0.3) * 100) / 100;
  return { sprache: erste.s, konfidenz, schrift };
}

/* ---------- Am Dokument: Kennzeichnung im Hinweis der Texterkennung ---------- */

/**
 * Die erkannte Sprache steht am Ende des Hinweises der Texterkennung (ocr_info), z. B.
 * „Texterkennung (fra+deu) · Sprache: fra (92 %)“. So braucht sie keine eigene Spalte; eine spätere
 * Migration kann sie von dort übernehmen.
 */
export const SPRACHE_MARKE = ' · Sprache: ';
export const spracheZuInfo = (s: { sprache: string; konfidenz: number }) => `${SPRACHE_MARKE}${s.sprache} (${Math.round(s.konfidenz * 100)} %)`;
const MUSTER = /· Sprache: ([a-z_]{3,10})(?: \((\d{1,3}) %\))?/;
/** Erkannte Sprache aus dem Hinweis der Texterkennung lesen (oder null). */
export function spracheAusInfo(info: string | null | undefined): { sprache: string; konfidenz: number | null } | null {
  const m = info ? MUSTER.exec(info) : null;
  return m ? { sprache: m[1], konfidenz: m[2] ? Number(m[2]) / 100 : null } : null;
}
/** Muster für SQL (substring … from …), passend zu spracheZuInfo. */
export const SPRACHE_SQL_MUSTER = '· Sprache: ([a-z_]{3,10})';

/**
 * Vorschläge für die Werkbank (#395): erkannte Sprachen, deren Sprachpaket fehlt – häufigste zuerst.
 * Die Erkennung arbeitet auf dem Text, also auch dann, wenn das Sprachpaket (noch) fehlt.
 */
export function sprachvorschlaege(erkannt: Record<string, number>, installiert: string[]): Array<{ sprache: string; anzahl: number; paket: string }> {
  return Object.entries(erkannt)
    .filter(([s, n]) => n > 0 && TEXTSPRACHEN[s] && !installiert.includes(s))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sprache, anzahl]) => ({ sprache, anzahl, paket: TEXTSPRACHEN[sprache].paket }));
}
