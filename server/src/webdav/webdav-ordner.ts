/** WebDAV-Laufwerk (#1278, Teil von `Webdav`): schwebende Dateien, Ordnerinhalt, Pfade auflösen, Einträge. */
import { WebdavBasis } from './webdav-basis';
import {
  type Ctx,
  type Schwebend,
  SCHWEBEND,
  SCHWEBEND_MAX,
  SCHWEBEND_MS,
  type Knoten,
  type Kind,
  MAX_EINTRAEGE,
  log,
  ortVon,
  istOrdner,
  etagVon,
} from './webdav-hilfen';
import { t } from '../sprache/sprache';
import { schluessel, NEUE_POST, ABLAGE, eindeutig, kurzId, VERKNUEPFT, istHilfsdatei, type Eintrag } from './webdav-baum';
import { type Sicht, kinderVon } from '../../../shared/src/sichten';
import type { Mappe, Dokument } from '../../../shared/src/model';
import { gruppiere, laufwerkName } from '../../../shared/src/anlagen';
import { kannStempeln } from '../../../shared/src/stempel';
import { pdfName } from '../ausgang/ausgabe';
import { Fachfehler } from '../grundlagen/fehler';

/** Schwebende Dateien, Ordner und Pfade. */
export abstract class WebdavOrdner extends WebdavBasis {
  /** Liegt der Pfad (oder bei neuen Namen sein Ordner) in einer Mappe mit Pflicht-Stempel? */
  protected async inPflichtMappe(teile: string[], ctx: Ctx): Promise<boolean> {
    const { k, eltern } = await this.loese(teile, ctx);
    const ziel = k ?? eltern;
    return !!ziel && this.istPflicht(ziel, ctx);
  }

  /*
   * Schwebende Dateien (leer angelegt, Inhalt folgt mit der nächsten Anfrage) im Kurzzustand (#744): Die nächste Anfrage
   * darf bei einem anderen Prozess landen. Schlüssel „Benutzer|Ort|Name“, gültig SCHWEBEND_MS.
   */
  private async schwebende(ctx: Ctx, ort: string): Promise<Schwebend[]> {
    return (await this.zustand.liste(SCHWEBEND, `${ctx.b.id}|${ort}|`, SCHWEBEND_MAX))
      .map((x) => x.wert as Schwebend)
      .sort((a, b) => a.zeit.localeCompare(b.zeit));
  }
  protected async merkeSchwebend(ctx: Ctx, ort: string, name: string, groesse: number) {
    const t = this.jetzt();
    await this.zustand.setze(
      SCHWEBEND,
      `${ctx.b.id}|${ort}|${schluessel(name)}`,
      { ort, name, groesse, zeit: new Date(t).toISOString() } satisfies Schwebend,
      t + SCHWEBEND_MS,
    );
  }
  protected async vergiss(ctx: Ctx, ort: string, name: string) {
    await this.zustand.loesche(SCHWEBEND, `${ctx.b.id}|${ort}|${schluessel(name)}`);
  }

  protected async kinder(k: Knoten, ctx: Ctx): Promise<Kind[]> {
    switch (k.art) {
      case 'wurzel':
        return [
          { name: NEUE_POST, k: { art: 'post' } },
          { name: ABLAGE, k: { art: 'ablage' } },
        ];
      case 'post':
        return (await this.schwebende(ctx, 'post')).map((s) => ({ name: s.name, k: { art: 'schwebend', s } }));
      case 'ablage': {
        const sichten = await this.d.dienst.sichtenVerwaltung.listeSichten(ctx.z);
        // Reihenfolge wie im Baum der Ablage; alle Ansichten auf einer Ebene.
        const reihe: Sicht[] = [];
        const besuche = (eltern: string | null) => {
          for (const s of kinderVon(sichten, eltern)) {
            if (!reihe.includes(s)) {
              reihe.push(s);
              besuche(s.id);
            }
          }
        };
        besuche(null);
        for (const s of sichten) if (!reihe.includes(s)) reihe.push(s);
        const namen = eindeutig(reihe.map((s) => ({ name: s.name, kurz: kurzId(s.id) })));
        return reihe.map((s, i) => ({ name: namen[i], k: { art: 'sicht', sicht: s } }));
      }
      case 'sicht': {
        const r = await this.d.dienst.sichten.seite(ctx.b, { sicht: k.sicht.id, anzahl: MAX_EINTRAEGE }, ctx.z, MAX_EINTRAEGE);
        const mappen = (r.mappen as Array<Mappe & { verborgen?: boolean }>)
          .filter((m) => !m.verborgen)
          .sort(
            (x, y) =>
              (x.titel ?? '').localeCompare(y.titel ?? '', 'de') || x.erstellt.localeCompare(y.erstellt) || x.id.localeCompare(y.id),
          );
        if (r.gesamt > MAX_EINTRAEGE)
          log.debug('WebDAV: Ansicht gekürzt', { sicht: k.sicht.name, gesamt: r.gesamt, gezeigt: MAX_EINTRAEGE });
        const namen = eindeutig(mappen.map((m) => ({ name: m.titel || t('meldungen.webdav.ohne-titel'), kurz: kurzId(m.id) })));
        return mappen.map((m, i) => ({
          name: namen[i],
          k: { art: 'mappe', id: m.id, tiefe: 0, geaendert: m.geaendert, erstellt: m.erstellt },
        }));
      }
      case 'mappe': {
        const m = await this.mappe(k.id, ctx);
        const register = (m.typ?.register ?? []).filter((r) => r.art === 'dokumente');
        // „Verknüpft“ nur auf der ersten Ebene – so kann kein Programm endlos im Kreis laufen.
        const mitVerknuepft = k.tiefe === 0 && m.verknuepft.length > 0;
        const namen = eindeutig(
          register.map((r) => ({ name: r.name })),
          mitVerknuepft ? [VERKNUEPFT] : [],
        );
        const erg: Kind[] = register.map((r, i) => ({ name: namen[i], k: { art: 'register', mappeId: k.id, register: r } }));
        if (mitVerknuepft) erg.push({ name: VERKNUEPFT, k: { art: 'verknuepft', id: k.id } });
        return erg;
      }
      case 'verknuepft': {
        const m = await this.mappe(k.id, ctx);
        const liste = [...m.verknuepft].sort((x, y) => x.titel.localeCompare(y.titel, 'de') || x.id.localeCompare(y.id));
        const namen = eindeutig(liste.map((v) => ({ name: v.titel || t('meldungen.webdav.ohne-titel'), kurz: kurzId(v.id) })));
        return liste.map((v, i) => ({ name: namen[i], k: { art: 'mappe', id: v.id, tiefe: 1 } }));
      }
      case 'register': {
        const m = await this.mappe(k.mappeId, ctx);
        const sortiert = m.dokumente
          .filter((x) => x.registerKey === k.register.key)
          .sort((x, y) => x.name.localeCompare(y.name, 'de') || x.erstellt.localeCompare(y.erstellt) || x.id.localeCompare(y.id));
        // Anlagen (#998): gleich hinter ihrem Hauptdokument, mit Namenszusatz „– Anlage n“.
        const doks = gruppiere(sortiert).flatMap((g) => [g.haupt, ...g.anlagen]);
        // Pflicht-Stempel (#722): Bilder kommen als PDF heraus und heißen darum auch so.
        const pflicht = doks.some((x) => x.mime !== 'application/pdf' && kannStempeln(x.mime)) && (await this.pflichtMappe(k.mappeId, ctx));
        const anzeige = (x: Dokument) => (pflicht && x.mime !== 'application/pdf' && kannStempeln(x.mime) ? pdfName(x.name) : x.name);
        const haupt = (x: Dokument) => (x.anlageZu ? doks.find((y) => y.id === x.anlageZu) : undefined);
        const namen = eindeutig(
          doks.map((x) => ({ name: haupt(x) ? laufwerkName(anzeige(haupt(x)!), { ...x, name: anzeige(x) }) : anzeige(x), datei: true })),
        );
        const erg: Kind[] = doks.map((x, i) => ({
          name: namen[i],
          k: { art: 'dokument', dok: x, mappeId: k.mappeId, register: k.register },
        }));
        const belegt = new Set(namen.map(schluessel));
        for (const s of await this.schwebende(ctx, ortVon(k)!))
          if (!belegt.has(schluessel(s.name))) erg.push({ name: s.name, k: { art: 'schwebend', s } });
        return erg;
      }
      default:
        return [];
    }
  }

  /** Pfad zum Knoten auflösen; null = gibt es nicht (oder darf man nicht sehen). */
  protected async finde(teile: string[], ctx: Ctx): Promise<Knoten | null> {
    return (await this.loese(teile, ctx)).k;
  }
  protected async loese(teile: string[], ctx: Ctx): Promise<{ k: Knoten | null; eltern: Knoten | null }> {
    let k: Knoten = { art: 'wurzel' };
    let eltern: Knoten | null = null;
    for (let i = 0; i < teile.length; i++) {
      const name = teile[i];
      if (!istOrdner(k)) return { k: null, eltern: null };
      if (istHilfsdatei(name)) return { k: i === teile.length - 1 ? { art: 'hilfsdatei' } : null, eltern: k };
      let kids: Kind[];
      try {
        kids = await this.kinder(k, ctx);
      } catch (e) {
        // Nicht (mehr) lesbare Mappe auf dem Weg: wie „gibt es nicht“.
        if (e instanceof Fachfehler && (e.status === 404 || e.status === 403)) return { k: null, eltern: null };
        throw e;
      }
      const s = schluessel(name);
      const t = kids.find((x) => x.name === name) ?? kids.find((x) => schluessel(x.name) === s);
      eltern = k;
      if (!t) return { k: null, eltern: i === teile.length - 1 ? k : null };
      k = t.k;
    }
    return { k, eltern };
  }

  /**
   * Eintrag für PROPFIND. Größe, Art und ETag eines Dokuments beziehen sich auf das, was GET liefert – bei Stempel
   * die gestempelte Fassung (#722). Nur lesbar (kein LOCK angeboten, Windows-Attribut „schreibgeschützt“): alles bei
   * „nur lesend“, Mappen mit Pflicht-Stempel und gestempelt ausgelieferte Dokumente.
   */
  protected async eintrag(teile: string[], name: string, k: Knoten, ctx: Ctx): Promise<Eintrag> {
    const nurLesend = ctx.e.nurLesend || (k.art !== 'schwebend' && (await this.istPflicht(k, ctx)));
    if (k.art === 'dokument') {
      const raus = await this.darfRaus(k.mappeId, ctx);
      const a = raus ? await this.auslieferung(k, ctx) : null;
      return {
        teile,
        ordner: false,
        name,
        groesse: a?.groesse ?? k.dok.groesse,
        mime: a?.gestempelt ? a.mime : k.dok.mime,
        etag: a?.etag ?? etagVon(k.dok),
        geaendert: k.dok.erstellt,
        erstellt: k.dok.erstellt,
        nurLesend: nurLesend || !!a?.gestempelt,
      };
    }
    if (k.art === 'schwebend')
      return { teile, ordner: false, name, groesse: k.s.groesse, geaendert: k.s.zeit, erstellt: k.s.zeit, nurLesend };
    if (k.art === 'mappe') return { teile, ordner: true, name, geaendert: k.geaendert, erstellt: k.erstellt, nurLesend };
    return { teile, ordner: true, name, nurLesend };
  }
}
