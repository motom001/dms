import { randomUUID } from 'node:crypto';
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
export interface Design { id: string; name: string; grundlage: Grundlage; primaer: string; sekundaer: string; css: string }
export type DesignDaten = Omit<Design, 'id'>;

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
  const fehler: string[] = [];
  if (!name) fehler.push('Bitte einen Namen angeben.');
  if (!GRUNDLAGEN.includes(grundlage)) fehler.push('Grundlage: automatisch, hell, dunkel oder kontrast.');
  if (!FARBE.test(primaer)) fehler.push('Primärfarbe als #RRGGBB angeben.');
  if (!FARBE.test(sekundaer)) fehler.push('Sekundärfarbe als #RRGGBB angeben.');
  if (css.length > MAX_CSS) fehler.push('Das eigene CSS ist zu lang (höchstens 50.000 Zeichen).');
  // CSS darf nicht aus dem <style>-Element ausbrechen.
  if (/<\/?\s*style/i.test(css)) fehler.push('Das CSS darf kein <style>-Tag enthalten.');
  if (fehler.length) throw new Fachfehler(422, fehler.join(' '));
  return { name, grundlage, primaer: primaer.toUpperCase(), sekundaer: sekundaer.toUpperCase(), css };
}

export class Designs {
  constructor(private repo: DesignRepo) {}

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
    return this.repo.speichere({ id, ...d }, false);
  }

  /** Benutzer mit diesem Design bekommen danach automatisch das Standard-Design. */
  async loesche(id: string) {
    const { designs, standard } = await this.liste();
    if (!designs.some((d) => d.id === id)) throw new Fachfehler(404, 'Dieses Design gibt es nicht.');
    if (id === standard) throw new Fachfehler(409, 'Das Standard-Design kann nicht gelöscht werden. Lege zuerst ein anderes als Standard fest.');
    await this.repo.loesche(id);
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
  });
  return {
    async liste() {
      return (await sql`SELECT * FROM designs WHERE haushalt_id = ${haushaltId} ORDER BY erstellt, lower(name)`).map(als);
    },
    async speichere(d, neu) {
      const [r] = neu
        ? await sql`INSERT INTO designs (id, haushalt_id, name, grundlage, primaer, sekundaer, css)
            VALUES (${d.id}, ${haushaltId}, ${d.name}, ${d.grundlage}, ${d.primaer}, ${d.sekundaer}, ${d.css}) RETURNING *`
        : await sql`UPDATE designs SET name = ${d.name}, grundlage = ${d.grundlage}, primaer = ${d.primaer}, sekundaer = ${d.sekundaer},
            css = ${d.css}, geaendert = now() WHERE id = ${d.id} AND haushalt_id = ${haushaltId} RETURNING *`;
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
