import { createHash, randomUUID } from 'node:crypto';
import type { Dateispeicher } from './dateispeicher';
import type postgres from 'postgres';
import { Fachfehler } from './fehler';

/**
 * Designs der Weboberfläche (#21). Ein Design besteht aus einer Grundlage
 * (hell, dunkel, kontrast oder automatisch nach dem Gerät), einer Primär- und
 * einer Sekundärfarbe – daraus leitet die Oberfläche Abstufungen ab – und
 * eigenem CSS. Ein Design ist Standard: für neue Benutzer und als Rückfall.
 */
export const GRUNDLAGEN = ['automatisch', 'hell', 'dunkel', 'kontrast'] as const;
export type Grundlage = (typeof GRUNDLAGEN)[number];
/** Logo eines Designs (#72): Datei im eigenen Ordner, angezeigt nur als Bild. */
export interface DesignLogo { sha256: string; mime: string; groesse: number }
export interface Design {
  id: string; name: string; grundlage: Grundlage; primaer: string; sekundaer: string; css: string;
  /** Text neben dem Logo (#72): null = „DMS“, leer = nur das Logo. */
  schriftzug?: string | null;
  logo?: DesignLogo | null;
}
export type DesignDaten = Omit<Design, 'id' | 'logo'>;
export const SCHRIFTZUG_MAX = 30;
export const LOGO_MAX = 1024 * 1024;

export interface DesignRepo {
  liste(): Promise<Design[]>;
  speichere(d: Design, neu: boolean): Promise<Design>;
  loesche(id: string): Promise<void>;
  standard(): Promise<string | null>;
  setzeStandard(id: string): Promise<void>;
}

const FARBE = /^#[0-9a-f]{6}$/i;
const MAX_CSS = 50_000;

function bereinige(e: unknown): DesignDaten {
  const x = (e ?? {}) as Record<string, unknown>;
  const name = String(x.name ?? '').trim().slice(0, 60);
  const grundlage = String(x.grundlage ?? '') as Grundlage;
  const primaer = String(x.primaer ?? '').trim();
  const sekundaer = String(x.sekundaer ?? '').trim();
  const css = String(x.css ?? '');
  const schriftzug = x.schriftzug === null || x.schriftzug === undefined ? null : String(x.schriftzug).replace(/\s+/g, ' ').trim();
  const fehler: string[] = [];
  if (schriftzug !== null && schriftzug.length > SCHRIFTZUG_MAX) fehler.push(`Der Schriftzug darf höchstens ${SCHRIFTZUG_MAX} Zeichen haben.`);
  if (!name) fehler.push('Bitte einen Namen angeben.');
  if (!GRUNDLAGEN.includes(grundlage)) fehler.push('Grundlage: automatisch, hell, dunkel oder kontrast.');
  if (!FARBE.test(primaer)) fehler.push('Primärfarbe als #RRGGBB angeben.');
  if (!FARBE.test(sekundaer)) fehler.push('Sekundärfarbe als #RRGGBB angeben.');
  if (css.length > MAX_CSS) fehler.push('Das eigene CSS ist zu lang (höchstens 50.000 Zeichen).');
  // Kein „<“ (#250): Damit kann eigenes CSS den Style-Block nicht verlassen. In CSS-Texten geht „\3C “.
  if (css.includes('<')) fehler.push('Das CSS darf kein „<“ enthalten (in Texten stattdessen \\3C schreiben).');
  if (fehler.length) throw new Fachfehler(422, fehler.join(' '));
  return { name, grundlage, primaer: primaer.toUpperCase(), sekundaer: sekundaer.toUpperCase(), css, schriftzug };
}

/**
 * Beginnt der Text mit einem SVG-Element – nach optionaler XML-Deklaration und Kommentaren?
 * Bewusst ohne verschachtelten regulären Ausdruck (#250): der ließ sich mit vielen
 * Kommentaren sehr langsam machen (ReDoS).
 */
export function istSvg(text: string): boolean {
  let t = text.trimStart();
  if (t.slice(0, 5).toLowerCase() === '<?xml') {
    const ende = t.indexOf('?>');
    if (ende < 0) return false;
    t = t.slice(ende + 2).trimStart();
  }
  while (t.startsWith('<!--')) {
    const ende = t.indexOf('-->', 4);
    if (ende < 0) return false;
    t = t.slice(ende + 3).trimStart();
  }
  return /^<svg[\s>]/i.test(t);
}

/** Bildtyp am Inhalt erkennen; SVG nur ohne Skripte, Ereignisse und fremde Verweise (#72). */
export function pruefeLogo(b: Buffer): string {
  const kopf = b.subarray(0, 12).toString('latin1');
  if (b[0] === 0x89 && kopf.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (kopf.startsWith('RIFF') && kopf.slice(8, 12) === 'WEBP') return 'image/webp';
  const text = b.toString('utf8');
  if (istSvg(text)) {
    const verboten = [/<script/i, /<foreignObject/i, /\son[a-z]+\s*=/i, /javascript:/i, /<!ENTITY/i, /<!DOCTYPE/i, /<(iframe|embed|object|link|meta|style)\b/i,
      /(xlink:)?href\s*=\s*["']\s*(?!#)/i, /url\(\s*["']?\s*(?!#)/i, /@import/i];
    if (verboten.some((r) => r.test(text))) throw new Fachfehler(422, 'Das SVG enthält Skripte, Ereignisse oder Verweise auf andere Dateien. Bitte ein schlichtes SVG oder PNG verwenden.');
    return 'image/svg+xml';
  }
  throw new Fachfehler(422, 'Das Logo bitte als PNG, JPEG, WebP oder SVG.');
}

export class Designs {
  constructor(private repo: DesignRepo, private dateien?: Dateispeicher) {}

  /** Logo hochladen bzw. entfernen (#72). */
  async setzeLogo(id: string, inhalt: unknown) {
    const d = (await this.repo.liste()).find((x) => x.id === id);
    if (!d) throw new Fachfehler(404, 'Dieses Design gibt es nicht.');
    if (!this.dateien) throw new Fachfehler(404, 'Logos sind nicht eingerichtet.');
    if (!Buffer.isBuffer(inhalt) || !inhalt.length) throw new Fachfehler(422, 'Die Datei ist leer.');
    if (inhalt.length > LOGO_MAX) throw new Fachfehler(413, 'Das Logo darf höchstens 1 MB groß sein.');
    const mime = pruefeLogo(inhalt);
    const sha256 = createHash('sha256').update(inhalt).digest('hex');
    await this.dateien.schreibe(sha256, inhalt);
    const alt = d.logo;
    const neu = await this.repo.speichere({ ...d, logo: { sha256, mime, groesse: inhalt.length } }, false);
    if (alt && alt.sha256 !== sha256) await this.raeumeAuf(alt.sha256);
    return neu;
  }

  /** Schriftzug des Standard-Designs, z. B. der Name des Mandanten aus der Einrichtung (#119). */
  async setzeSchriftzug(text: string) {
    const { designs, standard } = await this.liste();
    const d = designs.find((x) => x.id === standard);
    if (!d) return;
    await this.repo.speichere({ ...d, schriftzug: text.slice(0, SCHRIFTZUG_MAX) || null }, false);
  }

  async entferneLogo(id: string) {
    const d = (await this.repo.liste()).find((x) => x.id === id);
    if (!d) throw new Fachfehler(404, 'Dieses Design gibt es nicht.');
    const neu = await this.repo.speichere({ ...d, logo: null }, false);
    if (d.logo) await this.raeumeAuf(d.logo.sha256);
    return neu;
  }

  async logo(id: string, angemeldet: boolean) {
    const { designs, standard } = await this.liste();
    const d = designs.find((x) => x.id === id);
    // Ohne Anmeldung (Anmeldeseite) nur das Logo des Standard-Designs.
    if (!d?.logo || !this.dateien || (!angemeldet && id !== standard)) throw new Fachfehler(404, 'Dieses Logo gibt es nicht.');
    return { logo: d.logo, inhalt: await this.dateien.lies(d.logo.sha256) };
  }

  /** Logo und Schriftzug des Standard-Designs für die Anmeldeseite. */
  async marke() {
    const { designs, standard } = await this.liste();
    const d = designs.find((x) => x.id === standard);
    return { schriftzug: d?.schriftzug ?? null, logo: d?.logo ? `/api/designs/${d.id}/logo?v=${d.logo.sha256.slice(0, 8)}` : null };
  }

  private async raeumeAuf(sha: string) {
    if (!this.dateien) return;
    if ((await this.repo.liste()).some((x) => x.logo?.sha256 === sha)) return;
    await this.dateien.loesche(sha);
  }

  async liste() {
    const designs = await this.repo.liste();
    const st = await this.repo.standard();
    return { designs, standard: designs.some((d) => d.id === st) ? st : designs[0]?.id ?? null };
  }

  private async pruefeName(name: string, ausser?: string) {
    if ((await this.repo.liste()).some((d) => d.id !== ausser && d.name.toLowerCase() === name.toLowerCase())) {
      throw new Fachfehler(409, `Es gibt bereits ein Design „${name}“.`);
    }
  }

  async lege(e: unknown) {
    const d = bereinige(e);
    await this.pruefeName(d.name);
    return this.repo.speichere({ id: randomUUID(), ...d }, true);
  }

  async aendere(id: string, e: unknown) {
    if (!(await this.repo.liste()).some((x) => x.id === id)) throw new Fachfehler(404, 'Dieses Design gibt es nicht.');
    const d = bereinige(e);
    await this.pruefeName(d.name, id);
    const alt = (await this.repo.liste()).find((x) => x.id === id);
    return this.repo.speichere({ id, ...d, logo: alt?.logo ?? null }, false);
  }

  /** Benutzer mit diesem Design bekommen danach automatisch das Standard-Design. */
  async loesche(id: string) {
    const { designs, standard } = await this.liste();
    if (!designs.some((d) => d.id === id)) throw new Fachfehler(404, 'Dieses Design gibt es nicht.');
    if (id === standard) throw new Fachfehler(409, 'Das Standard-Design kann nicht gelöscht werden. Lege zuerst ein anderes als Standard fest.');
    const logo = designs.find((d) => d.id === id)?.logo;
    await this.repo.loesche(id);
    if (logo) await this.raeumeAuf(logo.sha256);
  }

  async setzeStandard(id: string) {
    if (!(await this.repo.liste()).some((d) => d.id === id)) throw new Fachfehler(404, 'Dieses Design gibt es nicht.');
    await this.repo.setzeStandard(id);
    return this.liste();
  }
}

export function speicherDesignRepo(): DesignRepo {
  const start: Design[] = [
    { id: randomUUID(), name: 'Automatisch', grundlage: 'automatisch', primaer: '#1D5A8A', sekundaer: '#2B7656', css: '' },
    { id: randomUUID(), name: 'Hell', grundlage: 'hell', primaer: '#1D5A8A', sekundaer: '#2B7656', css: '' },
    { id: randomUUID(), name: 'Dunkel', grundlage: 'dunkel', primaer: '#1D5A8A', sekundaer: '#2B7656', css: '' },
    { id: randomUUID(), name: 'Kontrast', grundlage: 'kontrast', primaer: '#0040A0', sekundaer: '#006B3C', css: '' },
  ];
  const liste = new Map(start.map((d) => [d.id, d]));
  let standard: string | null = start[0].id;
  return {
    async liste() { return [...liste.values()].map((d) => ({ ...d })); },
    async speichere(d) { liste.set(d.id, { ...d }); return { ...d }; },
    async loesche(id) { liste.delete(id); },
    async standard() { return standard; },
    async setzeStandard(id) { standard = id; },
  };
}

export function pgDesignRepo(sql: postgres.Sql, haushaltId: string): DesignRepo {
  const als = (r: Record<string, unknown>): Design => ({
    id: r.id as string, name: r.name as string, grundlage: r.grundlage as Grundlage,
    primaer: r.primaer as string, sekundaer: r.sekundaer as string, css: r.css as string,
    schriftzug: (r.schriftzug as string | null) ?? null, logo: (r.logo as DesignLogo | null) ?? null,
  });
  return {
    async liste() {
      return (await sql`SELECT * FROM designs WHERE haushalt_id = ${haushaltId} ORDER BY erstellt, lower(name)`).map(als);
    },
    async speichere(d, neu) {
      const [r] = neu
        ? await sql`INSERT INTO designs (id, haushalt_id, name, grundlage, primaer, sekundaer, css, schriftzug, logo)
            VALUES (${d.id}, ${haushaltId}, ${d.name}, ${d.grundlage}, ${d.primaer}, ${d.sekundaer}, ${d.css}, ${d.schriftzug ?? null}, ${d.logo ? sql.json(d.logo as unknown as postgres.JSONValue) : null}) RETURNING *`
        : await sql`UPDATE designs SET name = ${d.name}, grundlage = ${d.grundlage}, primaer = ${d.primaer}, sekundaer = ${d.sekundaer},
            css = ${d.css}, schriftzug = ${d.schriftzug ?? null}, logo = ${d.logo ? sql.json(d.logo as unknown as postgres.JSONValue) : null}, geaendert = now() WHERE id = ${d.id} AND haushalt_id = ${haushaltId} RETURNING *`;
      return als(r);
    },
    async loesche(id) { await sql`DELETE FROM designs WHERE id = ${id} AND haushalt_id = ${haushaltId}`; },
    async standard() {
      const [r] = await sql`SELECT wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = 'design_standard'`;
      return (r?.wert as string | undefined) ?? null;
    },
    async setzeStandard(id) {
      await sql`
        INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, 'design_standard', ${sql.json(id)})
        ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    },
  };
}
