/**
 * Paket-Einstellungen (#197): lesen, maskieren, speichern, Fassungen (#1006), ausprobieren, Aktionen, Status.
 */
import { randomUUID } from 'node:crypto';
import { type InstalliertesPaket } from '../../../../shared/src/pakete';
import { istKernFeld } from '../../../../shared/src/paketeinstellungen';
import { mitKern } from '../../../../shared/src/paketkern';
import {
  ANZEIGE_SPEICHER,
  anzeigeWert,
  dateiartPasst,
  liesProbeErgebnis,
  VERLAUF_TAGE,
  type ProbeAntwort,
  type Auslastung,
  type AnzeigeWert,
  type PaketAnzeige,
  type VerlaufEintrag,
} from '../../../../shared/src/paketreiter';
import {
  adressfelder,
  EINTRAG_ID,
  fehlendePflicht,
  listen,
  pruefeWerte,
  abschnittsfelder,
  type EinstellungFeld,
  type Einstellungsbeschreibung,
  type GeheimStand,
} from '../../../../shared/src/paketeinstellungen';
import type { Zugriff } from '../../kern/index';
import { Fachfehler } from '../../grundlagen/fehler';
import { t } from '../../sprache/sprache';
import { MB, PROBE_DATEI_MAX } from '../../grundlagen/grenzen';
import { paketEinstellungen, paketSpeicher, setzePaketEinstellungen } from '../index';
import { ohneGeheimnisse } from './hilfen';
import { AKTION_MS, type Handelnder, log } from './optionen';
import { PaketAblauf } from './ablauf';

/** Paket-Einstellungen. */
export abstract class PaketEinstellungen extends PaketAblauf {
  /**
   * Fassungen der Paket-Einstellungen (#1006): die Werte ohne Status; Geheimnisse nur als „gesetzt“ – beim
   * Wiederherstellen bleibt das heutige Geheimnis. Wiederherstellen über das normale Speichern (Prüfung, Dienst-Adresse).
   */
  protected fassungenAnmelden() {
    const beschreibung = async (id: string) => {
      try {
        return (await this.beschreibungVon(id)).b;
      } catch {
        return null;
      }
    };
    this.d.fassungen.registriere({
      art: 'paketeinstellungen',
      stand: async (id) => {
        const e = await paketEinstellungen(this.d.kern, id);
        if (!e) return undefined;
        const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
        return { name: p?.name ?? id, daten: { werte: ohneGeheimnisse(e.werte ?? {}) } };
      },
      alle: async () => {
        const ids: string[] = [];
        for (const p of await this.d.kern.repo.listePakete()) if (await paketEinstellungen(this.d.kern, p.id)) ids.push(p.id);
        return ids;
      },
      stelleHer: async (id, daten, o) => {
        await this.speichereEinstellungen(
          id,
          { werte: (daten as { werte?: unknown }).werte ?? {}, adresseBestaetigt: o.adresseBestaetigt },
          o.von,
        );
      },
      kontext: async (id) => {
        const b = await beschreibung(id);
        const felder = b ? [...abschnittsfelder(b), ...listen(b)] : [];
        return {
          einstellung: (k: string) => {
            const f = felder.find((x) => x.schluessel === k);
            return f ? { name: f.name, geheim: (f as { typ?: string }).typ === 'geheim' } : undefined;
          },
        };
      },
    });
  }

  private async beschreibungVon(id: string) {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    // Mit den Feldarten des Kerns (#996): auch ein Paket ohne Felder im Manifest kann Einstellungen haben.
    const b = mitKern(p.einstellungen, p);
    if (!b) throw new Fachfehler(404, t('meldungen.pakete.hat-keine-einstellungen', { name: p.name }));
    return { p, b };
  }

  /** Alles, was es zur Auswahl gibt: Mappentypen mit Feldern, Benutzer, Rollen, Sichten. */
  private async auswahl(p: InstalliertesPaket) {
    const typen = await this.d.mappentypen.listeTypen();
    const installierte = await this.d.kern.repo.listePakete();
    const dmsTypen = await this.dmsTypen();
    return {
      typen: typen.map((t) => ({
        id: t.id,
        name: t.name,
        felder: t.felder.filter((f) => f.typ !== 'passwort').map((f) => ({ key: f.key, label: f.label })),
      })),
      benutzer: this.o.benutzer ? await this.o.benutzer() : [],
      rollen: (await this.d.postSystemmappen.listeRollen()).map((r) => ({ id: r.id, name: r.name })),
      sichten: (await this.d.sichtenVerwaltung.listeSichten()).map((s) => ({ id: s.id, name: s.name })),
      typVon: (vw: string) => {
        const [paket, s] = vw.includes(':') ? vw.split(':') : [p.id, vw];
        if (paket === 'dms') return dmsTypen.get(s)?.id ?? null;
        return installierte.find((x) => x.id === paket)?.typen[s] ?? null;
      },
    };
  }

  /** Geheimnisse nie ausgeben – nur, ob einer gesetzt ist. */
  private maskiere(b: Einstellungsbeschreibung, werte: Record<string, unknown>): Record<string, unknown> {
    const m = (f: EinstellungFeld, v: unknown): unknown =>
      f.typ === 'geheim' ? ({ gesetzt: typeof v === 'string' && v !== '' } satisfies GeheimStand) : v;
    const erg: Record<string, unknown> = {};
    for (const f of abschnittsfelder(b)) erg[f.schluessel] = m(f, werte[f.schluessel]);
    for (const l of listen(b))
      erg[l.schluessel] = (Array.isArray(werte[l.schluessel]) ? (werte[l.schluessel] as Record<string, unknown>[]) : []).map((e) =>
        Object.fromEntries([[EINTRAG_ID, e[EINTRAG_ID]], ...l.felder.map((f) => [f.schluessel, m(f, e[f.schluessel])])]),
      );
    return erg;
  }

  async einstellungen(id: string) {
    const { p, b } = await this.beschreibungVon(id);
    const gespeichert = (await paketEinstellungen(this.d.kern, id)) ?? { werte: {} };
    const q = await this.auswahl(p);
    return {
      beschreibung: b,
      werte: this.maskiere(b, gespeichert.werte),
      fehlend: fehlendePflicht(b, gespeichert.werte),
      status: gespeichert.status ?? null,
      laeufer: !!this.o.laeufer,
      auswahl: { typen: q.typen, benutzer: q.benutzer, rollen: q.rollen, sichten: q.sichten },
    };
  }

  /** Speichern: prüfen (Typ, Pflicht, Auswahl, Verweise), Geheimnisse verschlüsseln, Protokoll ohne Werte von Geheimnissen. */
  async speichereEinstellungen(id: string, eingabe: unknown, von: Handelnder) {
    const { p, b } = await this.beschreibungVon(id);
    const alt = (await paketEinstellungen(this.d.kern, id)) ?? { werte: {} };
    const q = await this.auswahl(p);
    const r = pruefeWerte(b, (eingabe as { werte?: unknown } | null)?.werte ?? eingabe, {
      ...q,
      benutzer: q.benutzer.map((x) => x.id),
      rollen: q.rollen.map((x) => x.id),
      sichten: q.sichten.map((x) => x.id),
    });
    // Geheimnisse: neu → verschlüsseln, behalten → alter Wert (bei Listen über die Id des Eintrags), null → weg.
    const geheim = (f: EinstellungFeld, v: unknown, altWert: unknown, pfad: string) => {
      if (f.typ !== 'geheim') return v;
      const w =
        v && typeof v === 'object'
          ? typeof altWert === 'string' && altWert
            ? altWert
            : null
          : typeof v === 'string'
            ? this.d.verschluesselePaketGeheimnis(v)
            : null;
      if (f.pflicht && !w) r.fehler[pfad] = 'Pflichtfeld.';
      return w;
    };
    for (const f of abschnittsfelder(b)) r.werte[f.schluessel] = geheim(f, r.werte[f.schluessel], alt.werte[f.schluessel], f.schluessel);
    for (const l of listen(b)) {
      const alte = Array.isArray(alt.werte[l.schluessel]) ? (alt.werte[l.schluessel] as Record<string, unknown>[]) : [];
      (r.werte[l.schluessel] as Record<string, unknown>[]).forEach((e, i) => {
        const vorher = alte.find((x) => x[EINTRAG_ID] === e[EINTRAG_ID]);
        for (const f of l.felder)
          e[f.schluessel] = geheim(f, e[f.schluessel], vorher?.[f.schluessel], `${l.schluessel}.${i + 1}.${f.schluessel}`);
      });
    }
    if (Object.keys(r.fehler).length)
      throw new Fachfehler(422, t('meldungen.pakete.bitte-die-markierten-einstellungen'), {
        felderFehler: r.fehler,
        gruende: Object.values(r.fehler),
      });
    // Prüffunktion des Pakets (#996): nach den Regeln aus dem Manifest, mit den Werten im Klartext, ohne Schreibrechte.
    if (p.laeufer?.reiter?.einstellungenPruefen && this.o.laeufer?.pruefeEinstellungen) {
      const ff = await this.o.laeufer.pruefeEinstellungen(id, this.klartext(b, structuredClone(r.werte)));
      if (ff && Object.keys(ff).length)
        throw new Fachfehler(422, t('meldungen.pakete.bitte-die-markierten-einstellungen'), {
          felderFehler: ff,
          gruende: Object.values(ff),
        });
    }
    const geaendert = Object.keys(r.werte).filter((k) => JSON.stringify(r.werte[k]) !== JSON.stringify(alt.werte[k]));
    // Dienst-Adresse (#444): Eine neue oder geänderte Adresse gilt erst, wenn der Administrator den Hinweis bestätigt –
    // dorthin schickt das Paket Daten. Gespeichert wird nur eine bestätigte Adresse; nur zu ihr lässt der Läufer Netz zu.
    const adressen = adressfelder(b).filter((f) => geaendert.includes(f.schluessel) && r.werte[f.schluessel]);
    if (adressen.length && (eingabe as { adresseBestaetigt?: unknown } | null)?.adresseBestaetigt !== true) {
      throw new Fachfehler(
        409,
        t('meldungen.pakete.bitte-die-adresse-bestaetigen', {
          name: p.name,
          map: adressen.map((f) => String(r.werte[f.schluessel])).join(', '),
        }),
        { adresse: adressen.map((f) => ({ feld: f.name, wert: r.werte[f.schluessel] })) },
      );
    }
    await setzePaketEinstellungen(this.d.kern, id, { ...alt, werte: r.werte });
    await this.d.kern.fassungen.halte('paketeinstellungen', id);
    if (geaendert.length) {
      log.info(`Einstellungen von Paket ${p.name} geändert (Felder ${geaendert.join(', ')})`, {
        von: von.email,
        paket: id,
        felder: geaendert,
      });
      // Verlauf (#1003): welche Einstellungen, von wem – nie Werte.
      const namen = new Map(abschnittsfelder(b).map((f) => [f.schluessel, f.name] as const));
      await this.d.kern.repo
        .notiereVerlauf([
          {
            paket: id,
            art: 'einstellungen',
            was: geaendert.map((k) => namen.get(k) ?? listen(b).find((l) => l.schluessel === k)?.name ?? k).join(', '),
            wer: von.email,
          },
        ])
        .catch(() => {});
      for (const f of adressfelder(b).filter((x) => geaendert.includes(x.schluessel))) {
        log.info(`Dienst-Adresse von Paket ${p.name} ${r.werte[f.schluessel] ? 'bestätigt' : 'entfernt'}`, {
          von: von.email,
          paket: id,
          feld: f.schluessel,
          adresse: r.werte[f.schluessel] ?? null,
        });
      }
      // Der Läufer bekommt die erlaubten Adressen neu (Netz nur zur bestätigten Adresse).
      if (adressfelder(b).some((x) => geaendert.includes(x.schluessel))) await this.o.laeufer?.codeGeaendert?.();
      try {
        this.o.laeufer?.ereignis?.(id, 'paket.einstellungen_geaendert', geaendert);
      } catch {
        /* das Paket entscheidet selbst */
      }
      // Archivfassung (#660): eine Art nachträglich angekreuzt – die passenden Dokumente werden nachgeholt.
      const auswahl = Object.values(p.laeufer?.archivfassung?.auswahl ?? {});
      if (auswahl.some((k) => geaendert.includes(k) && r.werte[k] === true))
        void this.d.dokumentArchiv.archivPaketDa(p.laeufer!.archivfassung!.typen).catch(() => 0);
    }
    return this.einstellungen(id);
  }

  /** Einstellungen im Klartext – nur für das eigene Paket über den Paket-Läufer, nie über die API. */
  async einstellungenFuerPaket(id: string): Promise<Record<string, unknown>> {
    const { b } = await this.beschreibungVon(id);
    return this.klartext(b, structuredClone((await paketEinstellungen(this.d.kern, id))?.werte ?? {}));
  }

  /** Geheimnisse der Werte entschlüsseln (für das Paket selbst). */
  private klartext(b: Einstellungsbeschreibung, w: Record<string, unknown>): Record<string, unknown> {
    const klar = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' && typeof v === 'string' ? this.d.entschluessele(v) : v);
    for (const f of abschnittsfelder(b)) if (!istKernFeld(f)) w[f.schluessel] = klar(f, w[f.schluessel]);
    for (const l of listen(b))
      for (const e of Array.isArray(w[l.schluessel]) ? (w[l.schluessel] as Record<string, unknown>[]) : [])
        for (const f of l.felder) e[f.schluessel] = klar(f, e[f.schluessel]);
    return w;
  }

  /**
   * Verlauf des Pakets (#1003), neueste zuerst: Mappen nur mit Titel, wenn die Person sie lesen darf – sonst ohne Bezug.
   * Je Seite 50 Einträge; `mehr`: es gibt ältere.
   */
  async verlauf(
    id: string,
    f: { vor?: unknown; nurFehler?: unknown; suche?: unknown },
    z: Zugriff,
  ): Promise<{ eintraege: VerlaufEintrag[]; mehr: boolean }> {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    const anzahl = 50;
    const l = await this.d.kern.repo.paketVerlauf(id, {
      vor: Number(f.vor) || null,
      anzahl: anzahl + 1,
      nurFehler: f.nurFehler === true || f.nurFehler === '1',
      suche: typeof f.suche === 'string' ? f.suche.slice(0, 200) : '',
    });
    const ids = [...new Set(l.flatMap((e) => (e.bezug ? [e.bezug.mappe] : [])))];
    const lesbar = ids.length ? await this.d.kern.repo.lesbare(ids, z.lesen) : new Set<string>();
    const titel = lesbar.size ? await this.d.kern.repo.titelVon([...lesbar]) : new Map<string, string>();
    const eintraege = l.slice(0, anzahl).map((e) => ({
      ...e,
      bezug: e.bezug && lesbar.has(e.bezug.mappe) ? { mappe: e.bezug.mappe, titel: titel.get(e.bezug.mappe) ?? '' } : null,
    }));
    return { eintraege, mehr: l.length > anzahl };
  }

  /**
   * Ausprobieren (#1004): Das Paket bekommt die hochgeladene Datei zu dem Ereignis aus `code.ausprobieren` im
   * Probemodus – mit den gerade eingetragenen, noch nicht gespeicherten Einstellungen (geprüft wie beim Speichern;
   * Geheimnisse „behalten“ = der gespeicherte Wert). Es kann nichts schreiben; die Datei bleibt nur im Arbeitsspeicher
   * und wird danach verworfen. Im Verlauf steht „ausprobiert von …“ ohne Inhalt und Dateiname.
   */
  async ausprobieren(id: string, eingabe: unknown, von: Handelnder): Promise<ProbeAntwort> {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    const pr = p.laeufer?.reiter?.ausprobieren;
    if (!pr) throw new Fachfehler(404, t('meldungen.pakete.ausprobieren-nicht', { name: p.name }));
    const e = (eingabe ?? {}) as { name?: unknown; typ?: unknown; daten?: unknown; werte?: unknown };
    const datei = Buffer.from(typeof e.daten === 'string' ? e.daten : '', 'base64');
    const typ = typeof e.typ === 'string' ? e.typ : '';
    if (!datei.length) throw new Fachfehler(422, t('meldungen.pakete.ausprobieren-leer'));
    if (datei.length > PROBE_DATEI_MAX) throw new Fachfehler(413, t('meldungen.pakete.ausprobieren-gross', { mb: PROBE_DATEI_MAX / MB }));
    if (!dateiartPasst(pr.dateiarten, typ))
      throw new Fachfehler(422, t('meldungen.pakete.ausprobieren-art', { arten: pr.dateiarten.join(', ') }));
    const einstellungen = p.einstellungen ? await this.probeWerte(p, p.einstellungen, e.werte) : {};
    if (!this.o.laeufer?.ausprobieren) throw new Fachfehler(409, t('meldungen.pakete.ausprobieren-laeufer'));
    const probe = {
      id: randomUUID(),
      name: (typeof e.name === 'string' ? e.name : 'probe').slice(0, 200),
      typ,
      daten: datei.toString('base64'),
    };
    const r = await this.o.laeufer.ausprobieren(
      id,
      {
        art: pr.ereignis,
        id: probe.id,
        erstellt: new Date().toISOString(),
        versuch: 1,
        probe: true,
        daten: { dokument: probe.id, name: probe.name, mime: typ, groesse: datei.length },
        einstellungen,
      },
      probe,
    );
    await this.d.kern.repo
      .notiereVerlauf([
        { paket: id, art: 'ausprobiert', ergebnis: r.ok ? 'ok' : 'fehler', ms: r.ms, speicherMB: r.speicherMB, wer: von.email },
      ])
      .catch(() => {});
    log.info(`Paket ${p.name} ausprobiert`, { von: von.email, paket: id, ok: r.ok, ms: r.ms });
    return {
      ok: r.ok,
      fehler: r.ok ? null : r.fehler,
      ms: r.ms,
      speicherMB: r.speicherMB,
      ...liesProbeErgebnis(r.ok ? r.text : ''),
      dateien: r.dateien.map((x) => ({ name: x.name, typ: x.typ, daten: x.inhalt.toString('base64') })),
    };
  }

  /** Werte zum Ausprobieren: geprüft wie beim Speichern, Geheimnisse im Klartext (neu eingetragen oder gespeichert). */
  private async probeWerte(p: InstalliertesPaket, b: Einstellungsbeschreibung, eingabe: unknown): Promise<Record<string, unknown>> {
    const q = await this.auswahl(p);
    const r = pruefeWerte(b, eingabe, {
      ...q,
      benutzer: q.benutzer.map((x) => x.id),
      rollen: q.rollen.map((x) => x.id),
      sichten: q.sichten.map((x) => x.id),
    });
    if (Object.keys(r.fehler).length)
      throw new Fachfehler(422, t('meldungen.pakete.bitte-die-markierten-einstellungen'), {
        felderFehler: r.fehler,
        gruende: Object.values(r.fehler),
      });
    const alt = await this.einstellungenFuerPaket(p.id).catch(() => ({}) as Record<string, unknown>);
    const geheim = (f: EinstellungFeld, v: unknown, altWert: unknown) =>
      f.typ !== 'geheim' ? v : v && typeof v === 'object' ? (altWert ?? null) : v;
    for (const f of abschnittsfelder(b)) if (!istKernFeld(f)) r.werte[f.schluessel] = geheim(f, r.werte[f.schluessel], alt[f.schluessel]);
    for (const l of listen(b)) {
      const alte = Array.isArray(alt[l.schluessel]) ? (alt[l.schluessel] as Record<string, unknown>[]) : [];
      for (const e of r.werte[l.schluessel] as Record<string, unknown>[])
        for (const f of l.felder)
          e[f.schluessel] = geheim(f, e[f.schluessel], alte.find((x) => x[EINTRAG_ID] === e[EINTRAG_ID])?.[f.schluessel]);
    }
    return r.werte;
  }

  /** Auslastung des Pakets (#1003): je Tag der letzten 30 Tage und wann es zuletzt lief. */
  async auslastung(id: string): Promise<Auslastung> {
    if (!(await this.d.kern.repo.listePakete()).some((x) => x.id === id))
      throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    return this.d.kern.repo.paketAuslastung(id, VERLAUF_TAGE);
  }

  /**
   * Anzeigen des Pakets (#996): was es im Manifest beschreibt, mit den Werten aus seinem eigenen Speicher
   * (`anzeige.<schluessel>`). Das Paket liefert nur Werte; Ablago stellt sie dar.
   */
  async anzeigen(id: string): Promise<{
    anzeigen: Array<PaketAnzeige & { wert: AnzeigeWert | null }>;
    status: { letzterLauf: string | null; meldungen: string[] } | null;
  }> {
    const p = (await this.d.kern.repo.listePakete()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    const l = p.laeufer?.reiter?.anzeigen ?? [];
    const sp = l.length ? await paketSpeicher(this.d.kern, id) : {};
    // Statusbereich (#197): schreibt nur das Paket – eine Anzeige, darum in der Übersicht (#996).
    const status = p.einstellungen ? ((await paketEinstellungen(this.d.kern, id))?.status ?? null) : null;
    return { anzeigen: l.map((a) => ({ ...a, wert: anzeigeWert(a.art, sp[`${ANZEIGE_SPEICHER}${a.schluessel}`]) })), status };
  }

  /** Statusbereich: schreibt nur das Paket (über den Läufer); in der Oberfläche schreibgeschützt. */
  async setzeStatus(id: string, status: { letzterLauf: string | null; meldungen: string[] }) {
    const alt = (await paketEinstellungen(this.d.kern, id)) ?? { werte: {} };
    await setzePaketEinstellungen(this.d.kern, id, {
      ...alt,
      status: { letzterLauf: status.letzterLauf, meldungen: status.meldungen.slice(-20).map((m) => String(m).slice(0, 500)) },
    });
  }

  /** Aktion aus dem Manifest ausführen; die Antwort des Pakets als Text, mit Zeitgrenze. */
  async aktion(id: string, schluessel: string, von: Handelnder): Promise<{ ok: boolean; text: string }> {
    const { p, b } = await this.beschreibungVon(id);
    const a = b.aktionen.find((x) => x.schluessel === schluessel);
    if (!a) throw new Fachfehler(404, t('meldungen.pakete.diese-aktion-gibt-es'));
    const fehlend = fehlendePflicht(b, (await paketEinstellungen(this.d.kern, id))?.werte ?? {});
    if (fehlend.length) return { ok: false, text: t('meldungen.pakete.einstellungen-noetig', { fehlend: fehlend.join(', ') }) };
    if (!this.o.laeufer) return { ok: false, text: t('meldungen.pakete.pakete-mit-code-laufen') };
    log.info(`Aktion „${a.name}“ von Paket ${p.name}`, { von: von.email, paket: id, aktion: schluessel });
    let uhr: ReturnType<typeof setTimeout> | undefined;
    try {
      const text = await Promise.race([
        this.o.laeufer.aktion(id, schluessel, await this.einstellungenFuerPaket(id)),
        new Promise<never>((_, nein) => {
          uhr = setTimeout(() => nein(new Error(`Keine Antwort nach ${AKTION_MS / 1000} Sekunden.`)), AKTION_MS);
        }),
      ]);
      return { ok: true, text: String(text).slice(0, 2000) };
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    } finally {
      clearTimeout(uhr);
    }
  }
}
