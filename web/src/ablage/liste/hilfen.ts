/** Hilfen der Ablage-Listen (#1279): Zahlen, Nebenzeile und kompakter Eintrag, Zuordnen aus der Adresse, Exportrecht. */
import { typName } from '../../../../shared/src/beschriftung';
import {
  auswahlText,
  formatiere,
  POST_RICHTUNG,
  vorlageFelder,
  wirksameVorlage,
  type Mappe,
  type Mappentyp,
  type Wert,
} from '../../../../shared/src/model';
import { ausgeblendeteFelder } from '../../../../shared/src/darstellung';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { Bezuege } from '../../api/mappen';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';
import { zelle, type Namen } from '../spalten';

export const zahl = (n: number) => n.toLocaleString(gebietsschema());

/** Zuordnen über eine neue Mappe (#192): ?zuordnen=<Post>&register=…&dokumente=a,b&kopieren=1&vorschlag={…} */
export function zuordnenAus(q: URLSearchParams) {
  const post = q.get('zuordnen');
  if (!post) return undefined;
  let vorschlag: Record<string, Wert> = {};
  try {
    const v = JSON.parse(q.get('vorschlag') ?? '{}');
    if (v && typeof v === 'object') vorschlag = v;
  } catch {
    /* ohne Vorschlag */
  }
  return {
    post,
    register: q.get('register') ?? undefined,
    dokumente: (q.get('dokumente') ?? '').split(',').filter(Boolean),
    kopieren: q.get('kopieren') === '1',
    vorschlag,
  };
}

/** Nebenzeile eines Listeneintrags: zwei Felder, die nicht schon im Titel stehen. */
function unterzeile(typ: Mappentyp, m: Mappe, bezuege: Bezuege) {
  const imTitel = new Set(vorlageFelder(wirksameVorlage(typ)));
  const aus = ausgeblendeteFelder(typ);
  const neben = typ.felder
    .filter((f) => !imTitel.has(f.key) && !aus.has(f.key) && f.typ !== 'langtext' && f.typ !== 'formatiert' && f.typ !== 'passwort')
    .slice(0, 2);
  return neben
    .map((f) => formatiere(f, m.werte[f.key], (id) => titelOder(bezuege[id]?.titel), { felder: typ.felder, werte: m.werte }))
    .filter(Boolean)
    .join(' · ');
}

/** Exportieren ohne Sicht (#294, Regel A): nur wer in mindestens einer Sicht das Recht E hat (Admins immer). */
export const exportOhneSicht = (admin: boolean, sichten: Array<{ rechte?: { R?: boolean; E?: boolean } }>) =>
  admin || sichten.some((s) => s.rechte?.R !== false && s.rechte?.E !== false);

/** Eingehende Post ohne „von“ (#494; bis #1042 „Absender“). */
export const absenderFehlt = (typ: Mappentyp | undefined, m: Mappe) =>
  typ?.system === 'post' && !m.werte.von && auswahlText(m.werte.richtung) === POST_RICHTUNG.eingehend;

/** Kompakter Eintrag: mit Trefferliste Spalte 1 fett, 2 und 3 darunter; sonst Titel und zwei Nebenfelder (bzw. der Typ). */
export function kompakt(
  m: Mappe,
  { liste, einTyp, typ, bezuege, namen }: { liste: string[]; einTyp: boolean; typ: Mappentyp | undefined; bezuege: Bezuege; namen: Namen },
) {
  if (liste.length) {
    const [a, ...rest] = liste.slice(0, 3).map((k) => zelle(k, m, typ, bezuege, namen));
    // Post ohne „von“ (#494): Hinweis zum Ergänzen beim Zuordnen, auch wenn die Spalte nicht unter den ersten drei ist.
    if (absenderFehlt(typ, m) && liste.includes('von')) rest.push(t('ablage.ablage.absender-fehlt'));
    return { titel: a || titelOder(m.titel), unter: rest.filter(Boolean).join(' · ') };
  }
  return { titel: titelOder(m.titel), unter: einTyp ? (typ ? unterzeile(typ, m, bezuege) : '') : typ ? typName(typ) : '' };
}
