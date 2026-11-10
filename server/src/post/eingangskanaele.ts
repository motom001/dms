/**
 * Eingangskanäle (#195, #196, #333, #1077 aus dienst.ts): was Eingangsordner, Postfächer und Fotostapel vom Dienst
 * brauchen – Post-Typ, Historie eines Kanals, gleiche Dateien und ihre Fundstellen, Aufräumen nach Abbruch, Demo-
 * Texterkennung. Schicht 3 – bekommt den Kern, die Rechteprüfung, Historie und Dokumente.
 */
import type { DokumenteDienst } from '../dokumente';
import { Fachfehler } from '../fehler';
import type { Kern, Zugriff } from '../kern';
import type { MappenHistorie } from '../mappen';
import type { Repo } from '../repo';
import { t } from '../sprache';
import type { ZugriffDienst } from '../zugriff';

/** Wo eine gleiche Datei schon liegt (#333) – nur lesbare Mappen. */
export interface Fundstelle { mappeId: string; typId: string; titel: string; typ: string; register: string; name: string; erstellt: string }

/** Die Teile, die die Eingangskanäle rufen: Rechteprüfung, Historie, Dokumente (Texterkennung). */
export interface EingangskanaeleTeile { rechte: ZugriffDienst; historie: MappenHistorie; dokumente: DokumenteDienst }

export class Eingangskanaele {
  constructor(private readonly kern: Kern, private readonly teile: EingangskanaeleTeile) {}

  private get repo(): Repo { return this.kern.repo; }
  private get ocr() { return this.teile.dokumente.ocr; }
  private lesbare(z: Zugriff | undefined, ids: string[]) { return this.teile.rechte.lesbare(z, ids); }
  private notiere(...a: Parameters<MappenHistorie['notiere']>) { return this.teile.historie.notiere(...a); }

  async postTyp() { return (await this.kern.system()).post; }

  /** Historien-Eintrag eines Eingangskanals (#196), z. B. nicht übernommene Anhänge. */
  async notiereSystem(mappeId: string, system: string, text: string) { await this.notiere(mappeId, null, 'uebernommen', { system, text }); }

  async anzahlDokumente(mappeId: string) { return (await this.repo.listeDokumente(mappeId)).length; }

  /** Gibt es die Mappe (z. B. eine Post mit vorgegebener Id) schon? */
  async gibtMappe(id: string) { return !!(await this.repo.holeMappe(id)); }

  /** Mappen, die schon eine Datei mit diesem Inhalt haben („gleicher Inhalt wie …“). */
  async dokumenteMitInhalt(sha256: string) {
    const docs = await this.repo.dokumenteMitSha(sha256);
    const bezuege = await this.repo.bezuege([...new Set(docs.map((d) => d.mappeId))]);
    return docs.slice(0, 5).map((d) => ({ mappeId: d.mappeId, name: d.name, titel: bezuege.get(d.mappeId)?.titel ?? '' }));
  }

  /**
   * Doppelte Dateien (#333): Wo liegt eine Datei mit diesem Prüfwert schon? Nur Mappen, die der Benutzer
   * lesen darf – liegt sie nur in fremden Mappen, gibt es keinen Hinweis (nichts verraten).
   */
  async fundstellen(z: Zugriff | undefined, pruefwerte: unknown, ohneMappe?: string): Promise<Record<string, Fundstelle[]>> {
    const liste = Array.isArray(pruefwerte) ? [...new Set(pruefwerte.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)))] : [];
    if (liste.length > 100) throw new Fachfehler(422, t('meldungen.dienst.hoechstens-100-pruefwerte-auf'));
    const erg: Record<string, Fundstelle[]> = {};
    for (const sha of liste) {
      const docs = (await this.repo.dokumenteMitSha(sha)).filter((d) => d.mappeId !== ohneMappe);
      if (!docs.length) continue;
      const lesbar = await this.lesbare(z, [...new Set(docs.map((d) => d.mappeId))]);
      const sichtbar = docs.filter((d) => lesbar.has(d.mappeId));
      if (!sichtbar.length) continue;
      const bezuege = await this.repo.bezuege(sichtbar.map((d) => d.mappeId));
      const typen = new Map((await this.repo.listeTypen()).map((t) => [t.id, t]));
      erg[sha] = sichtbar.slice(0, 5).map((d) => {
        const b = bezuege.get(d.mappeId);
        const t = b ? typen.get(b.typId) : undefined;
        return { mappeId: d.mappeId, typId: b?.typId ?? '', titel: b?.titel ?? '', typ: t?.name ?? '', register: t?.register.find((r) => r.key === d.registerKey)?.name ?? d.registerKey, name: d.name, erstellt: d.erstellt };
      });
    }
    return erg;
  }

  /** Eine Post, die seit `seit` ein Dokument mit diesem Inhalt bekommen hat (Aufräumen nach Abbruch). */
  async postMitDatei(sha256: string, seit: string): Promise<string | null> {
    const post = await this.postTyp();
    for (const d of await this.repo.dokumenteMitSha(sha256)) {
      if (d.erstellt < seit) continue;
      const m = await this.repo.holeMappe(d.mappeId);
      if (m?.typId === post.id) return m.id;
    }
    return null;
  }

  /** Demo-Dokumente gesammelt in die Warteschlange der Texterkennung. */
  async demoTexterkennung(ids: string[]) {
    if (!ids.length) return;
    await this.repo.ocrEinreihen(ids);
    this.ocr?.anstossen();
  }
}
