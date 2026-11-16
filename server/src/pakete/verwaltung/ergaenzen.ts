/**
 * Was beim Anlegen dazukommt: Beschriftungen aus Sprachpaketen (#731), optionale Ziele und Quellen nachtragen (#1122),
 * Typen übernehmen und umziehen (#1084), Verlauf.
 */
import { zieleVon, type Mappentyp } from '../../../../shared/src/model';
import { ergaenzeBeschriftungen } from '../../../../shared/src/beschriftung';
import { type InstalliertesPaket } from '../../../../shared/src/pakete';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { optionaleInTyp, quellenNachtragen, type SollQuelle } from '../index';
import { type Paket, type PaketTyp, str } from './format';
import { meldungen } from './hilfen';
import { log } from './optionen';
import { type LegeAuftrag } from './plan';
import { beschriftungenNeu } from './update-neu';
import { PaketBeispiele } from './beispiel-mappen';

/** Ergänzungen beim Anlegen. */
export abstract class PaketErgaenzen extends PaketBeispiele {
  /**
   * Legt Typen, Sichten und ggf. Beispiele an bzw. ergänzt sie (Update) und speichert den Eintrag.
   * Bei einem Fehler wird alles zurückgenommen.
   */
  /** Verlauf (#1003): installiert bzw. aktualisiert, von wem und welche Version. */
  protected async mitVerlauf(neu: InstalliertesPaket, a: LegeAuftrag): Promise<InstalliertesPaket> {
    await this.d.kern.repo
      .notiereVerlauf([
        {
          paket: neu.id,
          art: a.alt ? 'aktualisiert' : 'installiert',
          was: a.alt ? `${a.alt.version} → ${neu.version}` : neu.version,
          wer: a.von.email,
        },
      ])
      .catch(() => {});
    return neu;
  }

  /**
   * Paket-Id umziehen (#1084): Datenbank (Repo.benennePaketUm) und die Einstellungen, die die Id nennen – Einstellungen
   * und Speicher des Pakets, „Pakete verwehrt“ am Mappentyp und die Erkennung per Paket („Aus Dokument ausfüllen“).
   */
  protected async zieheUm(alt: string, neu: string) {
    await this.d.kern.repo.benennePaketUm(alt, neu);
    const e = this.d.kern.einstellungen;
    if (!e) return;
    for (const vor of ['paket:', 'paketspeicher:']) {
      const w = await e.lies(`${vor}${alt}`);
      if (w === null || w === undefined) continue;
      await e.schreibe(`${vor}${neu}`, w);
      await e.schreibe(`${vor}${alt}`, null);
    }
    const verwehrt = await e.lies('paket_verwehrt');
    if (verwehrt && typeof verwehrt === 'object' && !Array.isArray(verwehrt) && JSON.stringify(verwehrt).includes(JSON.stringify(alt))) {
      await e.schreibe(
        'paket_verwehrt',
        Object.fromEntries(
          Object.entries(verwehrt as Record<string, unknown>).map(([k, l]) => [
            k,
            Array.isArray(l) ? l.map((x) => (x === alt ? neu : x)) : l,
          ]),
        ),
      );
    }
    const erk = await e.lies('erkennung_typen');
    if (erk && typeof erk === 'object' && !Array.isArray(erk) && JSON.stringify(erk).includes(JSON.stringify(alt))) {
      await e.schreibe(
        'erkennung_typen',
        Object.fromEntries(
          Object.entries(erk as Record<string, { ausDokument?: { engine?: string } }>).map(([k, x]) => [
            k,
            x?.ausDokument?.engine === alt ? { ...x, ausDokument: { ...x.ausDokument, engine: neu } } : x,
          ]),
        ),
      );
    }
  }

  /**
   * Optionale Ziele (#1036) nachziehen: An den Feldern der Typen von `paket` die `zielOptional` des Pakets ergänzen
   * (vereinigt, nie gekürzt), dann an allen Verweisfeldern jede optionale Kennung, die es als Typ gibt, in `zielTypen`
   * aufnehmen – und in Anzeige-Bedingungen die Kennung durch die Id ersetzen (#1122). Geänderte Typen landen in
   * `geaendert` (Zurückrollen).
   */
  protected async ergaenzeOptionaleZiele(
    paket: Pick<Paket, 'manifest' | 'typen'> | null,
    typMap: Record<string, string>,
    geaendert: Mappentyp[],
  ) {
    const typen = await this.d.mappentypen.listeTypen();
    const kennung = new Map(typen.filter((x) => x.schluessel).map((x) => [x.schluessel!, x.id] as const));
    for (const typ of typen) {
      const pt = paket?.typen.find((x) => typMap[x.schluessel] === typ.id);
      let anders = false;
      const felder = typ.felder.map((f) => {
        if (f.typ !== 'referenz') return f;
        const neuOpt = (pt?.felder.find((x) => x.key === f.key)?.zielOptional ?? []).map(str);
        const opt = [...new Set([...(f.zielOptional ?? []), ...neuOpt])];
        const dazu = opt.map((k) => kennung.get(k)).filter((id): id is string => !!id && !zieleVon(f).includes(id));
        if (!dazu.length && opt.length === (f.zielOptional ?? []).length) return f;
        anders = true;
        return { ...f, zielTypen: [...zieleVon(f), ...dazu], ...(opt.length ? { zielOptional: opt } : {}) };
      });
      // Anzeige-Bedingungen (#1122): „zeigt auf Mappe vom Typ …“ mit der Kennung eines Typs, den es jetzt gibt → Id.
      const mitAnzeige = optionaleInTyp({ felder, register: typ.register }, kennung);
      if (!anders && !mitAnzeige) continue;
      if (!geaendert.some((x) => x.id === typ.id)) geaendert.push(typ);
      try {
        await this.d.mappentypen.aendereTyp(typ.id, { ...typ, felder, ...mitAnzeige });
      } catch (f) {
        throw new Fachfehler(422, t('meldungen.pakete.mappentyp', { name: typ.name, meldungen: meldungen(f) }));
      }
    }
  }

  /**
   * Quellen von Verknüpfungsregistern (#1122) am Ende: an neuen Typen alle, an vorhandenen die neuer Register. Was erst
   * nach dem Anlegen ging (optionale Ziele, Felder aus dem Update), kommt jetzt dazu; was nicht geht, bricht mit Stelle ab.
   */
  protected async quellenNachtragen(
    paket: Pick<Paket, 'typen'>,
    x: {
      ids: Map<string, string>;
      neu: Set<string>;
      vorher: Map<string, Mappentyp>;
      geaendert: Mappentyp[];
      typId: (vw: string) => string;
    },
  ) {
    const typen = new Map((await this.d.mappentypen.listeTypen()).map((y) => [y.id, y] as const));
    const fehler: string[] = [];
    for (const pt of paket.typen) {
      const typ = typen.get(x.ids.get(pt.schluessel) ?? '');
      const alt = x.vorher.get(typ?.id ?? '');
      if (!typ || (!x.neu.has(pt.schluessel) && !alt)) continue;
      const soll: SollQuelle[] = pt.register
        .filter((r) => x.neu.has(pt.schluessel) || !alt!.register.some((g) => g.key === r.key))
        .flatMap((r) =>
          (r.quellen ?? []).map((q) => ({ register: r.key, typId: x.typId(q.typ), feldKey: q.feld, quelle: `${q.typ}.${q.feld}` })),
        );
      const erg = quellenNachtragen(typ, soll, typen);
      fehler.push(
        ...erg.fehlen.map((q) =>
          t('meldungen.pakete.quelle-fehlt', {
            typ: typ.name,
            register: typ.register.find((r) => r.key === q.register)?.name ?? q.register,
            quelle: q.quelle,
            feld: q.feldKey,
          }),
        ),
      );
      if (!erg.geaendert || erg.fehlen.length) continue;
      if (alt && !x.geaendert.some((y) => y.id === typ.id)) x.geaendert.push(typ);
      try {
        await this.d.mappentypen.aendereTyp(typ.id, { ...typ, register: erg.register });
      } catch (f) {
        throw new Fachfehler(422, t('meldungen.pakete.mappentyp', { name: typ.name, meldungen: meldungen(f) }));
      }
    }
    if (fehler.length) throw new Fachfehler(422, fehler[0], { gruende: fehler });
  }

  /**
   * Übernahme beim Umbau (#1041): Der vorhandene Typ bekommt die Kennung und die Definition des Pakets – Id, Mappen,
   * Rechte, Archivmodus und KI-Zulassung bleiben. Zurückrollen ohne Transaktion wie ein geänderter Typ.
   */
  protected async uebernimmTyp(
    id: string,
    kennung: string,
    daten: Record<string, unknown>,
    paketId: string,
    r: { vorher: Map<string, Mappentyp>; geaendert: Mappentyp[]; kennungZurueck: Map<string, string> },
  ) {
    const v = r.vorher.get(id);
    if (v) r.geaendert.push(v);
    if (v?.schluessel && v.schluessel !== kennung) {
      await this.d.kern.repo.setzeTypKennung(id, kennung);
      r.kennungZurueck.set(id, v.schluessel);
    }
    await this.d.mappentypen.aendereTyp(id, daten, paketId);
  }

  /**
   * Beschriftungen aus Sprachpaketen (#731) an die Mappentypen und Ansichten installierter Pakete: je Sprache, Teil und
   * Option nur, was noch fehlt – was der Administrator oder das Paket selbst beschriftet hat, bleibt. `nur`: nur diese
   * Pakete (z. B. das gerade installierte); ohne: alle. Liefert die Zahl ergänzter Texte.
   */
  async sprachBeschriftungen(nur?: string[]): Promise<number> {
    const sprachen = (await this.d.kern.repo.sprachpakete()).filter((s) => Object.keys(s.beschriftungen).length);
    if (!sprachen.length) return 0;
    const pakete = (await this.d.kern.repo.listePakete()).filter((p) => !nur || nur.includes(p.id));
    let anzahl = 0;
    for (const s of sprachen) {
      for (const p of pakete) {
        const b = s.beschriftungen[p.id];
        if (!b) continue;
        const typen = await this.d.mappentypen.listeTypen();
        for (const [schluessel, x] of Object.entries(b.mappentypen ?? {})) {
          const typ = typen.find((y) => y.id === p.typen[schluessel]);
          if (!typ) continue;
          // Als Paket-Typ in dieser einen Sprache – dieselbe Regel wie beim Update eines Pakets (#728).
          const pt: PaketTyp = {
            schluessel,
            name: typ.name,
            beschreibung: '',
            felder: Object.entries(x.felder ?? {}).map(([key, f]) => ({ key, label: '', typ: 'text', beschriftungen: { [s.kennung]: f } })),
            register: Object.entries(x.register ?? {}).map(([key, r]) => ({
              key,
              name: '',
              art: 'felder',
              beschriftungen: { [s.kennung]: r },
            })),
            beschriftungen: {
              [s.kennung]: { ...(x.name ? { name: x.name } : {}), ...(x.beschreibung ? { beschreibung: x.beschreibung } : {}) },
            },
          };
          const neu = beschriftungenNeu(pt, typ);
          if (!neu.anzahl) continue;
          await this.d.mappentypen.aendereTyp(typ.id, {
            ...typ,
            felder: neu.typ.felder,
            register: neu.typ.register,
            beschriftungen: neu.typ.beschriftungen ?? null,
          });
          anzahl += neu.anzahl;
        }
        const sichten = await this.d.sichtenVerwaltung.listeSichten();
        for (const [schluessel, x] of Object.entries(b.sichten ?? {})) {
          const sicht = sichten.find((y) => y.id === p.sichten[schluessel]);
          if (!sicht) continue;
          const vorher = JSON.stringify(sicht.beschriftungen ?? {});
          const erg = ergaenzeBeschriftungen(sicht.beschriftungen ?? undefined, { [s.kennung]: x });
          if (JSON.stringify(erg ?? {}) === vorher) continue;
          await this.d.sichtenVerwaltung.aendereSicht(sicht.id, { ...sicht, beschriftungen: erg });
          anzahl++;
        }
      }
    }
    if (anzahl) log.info('Beschriftungen aus Sprachpaketen übernommen', { anzahl, pakete: nur?.join(', ') ?? 'alle' });
    return anzahl;
  }
}
