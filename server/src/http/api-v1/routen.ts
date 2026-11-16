/** Routen /api/v1/… aus der Tabelle, Übergang der Post-Namen und Protokoll-Name (#1278, vorher in `http/api-v1.ts`). */
import { postWerteMitAlten } from '../../../../shared/src/postfelder';
import type { Werte, Benutzer } from '../../../../shared/src/model';
import type { Route, Anfrage } from '../routen-typen';
import { V1_TABELLE } from './tabelle';

/** Routen /api/v1/… aus der Tabelle; Handler und Zugang kommen von den internen Routen. */
/**
 * Post (#1042, Übergang bis 1.0.0): In jeder Antwort der Schnittstelle v1 bekommen Mappen vom Typ Post (typId) zu von
 * und an zusätzlich die alten Namen absender und fuer mit demselben Wert. Sucht höchstens wenige Ebenen tief; Dateien
 * und Ströme bleiben, wie sie sind.
 */
export function mitAltenPostNamen(body: unknown, postId: string, tiefe = 0): unknown {
  if (tiefe > 6 || !body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map((x) => mitAltenPostNamen(x, postId, tiefe + 1));
  const o = body as Record<string, unknown>;
  const aus: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) aus[k] = mitAltenPostNamen(v, postId, tiefe + 1);
  if (o.typId === postId && o.werte && typeof o.werte === 'object' && !Array.isArray(o.werte))
    aus.werte = postWerteMitAlten(o.werte as Werte);
  return aus;
}

/** Was die Schnittstelle v1 für Übergänge braucht (#1042): die Id des Typs Post. */
export interface V1Uebergang {
  postTypId(): Promise<string | null>;
}

export function v1Routen(intern: Route[], uebergang?: V1Uebergang): Route[] {
  const finde = (m: Route['methode'], p: string) => {
    const r = intern.find((x) => x.methode === m && x.pfad === p);
    if (!r) throw new Error(`Interne Route fehlt: ${m} ${p}`);
    return r;
  };
  // Post (#1042): alte Namen in Antworten mitliefern – nur, wenn die Antwort überhaupt Werte trägt.
  const mitAlten = (h: Route['handler']): Route['handler'] =>
    uebergang
      ? async (a) => {
          const antwort = await h(a);
          if (!antwort?.body || antwort.datei || antwort.strom || typeof antwort.body !== 'object') return antwort;
          const postId = await uebergang.postTypId().catch(() => null);
          return postId ? { ...antwort, body: mitAltenPostNamen(antwort.body, postId) } : antwort;
        }
      : h;
  return V1_TABELLE.map((e) => {
    const basis = e.intern ? finde(e.intern.methode, e.intern.pfad) : undefined;
    const handler: Route['handler'] = e.handler ? (a: Anfrage) => e.handler!(a, finde) : basis!.handler;
    return {
      methode: e.methode,
      pfad: `/api/v1${e.pfad.replace(/\{(\w+)\}/g, ':$1')}`,
      zugang: basis?.zugang ?? 'angemeldet',
      // Werkbank (#818): derselbe Bereich wie die interne Route.
      ...(basis?.zugang === 'admin' ? { bereichVon: { methode: basis.methode, pfad: basis.pfad } } : {}),
      roh: basis?.roh,
      strom: basis?.strom,
      api: true,
      handler: mitAlten(handler),
    } satisfies Route;
  });
}

/** Für Protokoll und Anzeige: wer über welchen Schlüssel fragt. */
export const wer = (b: Benutzer | undefined, schluessel?: { name: string }) =>
  b ? (schluessel ? `${b.email} (API: ${schluessel.name})` : b.email) : undefined;
