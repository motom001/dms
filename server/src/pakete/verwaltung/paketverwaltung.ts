/**
 * Paketverwaltung, Stufe 1 (#188): Konfigurationspakete aus dem offiziellen Katalog ansehen,
 * installieren, aktualisieren und entfernen. Paketformat: motom001/dms-registry.
 *
 * - Angelegt wird über dieselben Funktionen wie in der Werkbank (mit allen Prüfregeln).
 * - Schlüssel bekommen das Paket-Präfix (<paket>_<schluessel>), Verweise <paket>:<schluessel> werden aufgelöst.
 * - dms:<kennung> verweist auf einen Mappentyp, den das DMS selbst mitbringt (#310), z. B. dms:rolle; dms:ablageort ist
 *   seit #883 ein Alias für basis:ablageort (DMS_ALIAS).
 * - Scheitert etwas, wird zurückgerollt: Es bleibt nichts halb angelegt.
 * - Ein Update ergänzt nur (neue Typen, Felder, Register, Sichten); es löscht und überschreibt nichts – außer Ansichten
 *   des Pakets, die noch so sind, wie das Paket sie geschrieben hat (Prüfwert, #1125, pakete/sichtstand.ts).
 */
import {
  rechteZeilen,
  type InstalliertesPaket,
  type AblaufErgebnis,
  haengenAn,
  type AblaufInstallation,
} from '../../../../shared/src/pakete';
import {
  adressfelder,
  EINTRAG_ID,
  listen,
  pruefeWerte,
  abschnittsfelder,
  type EinstellungFeld,
  type Einstellungsbeschreibung,
} from '../../../../shared/src/paketeinstellungen';
import { Fachfehler } from '../../grundlagen/fehler';
import { type Schluessel } from '../katalogsignatur';
import { t } from '../../sprache/sprache';
import { nachweis } from '../../protokoll/nachweisjournal';
import { paketQuellen, setzePaketQuellen } from '../index';
import { einzuschalten } from './automatisierungen';
import { ersetzenAus, herkunftFehler, installierteErsetzt, meldungen, sammelKennungen } from './hilfen';
import { type Handelnder, log, type Quelle } from './optionen';
import { type InstallierenEingabe, type UmbauEingabe, type Vorschau } from './plan';
import { PaketEntfernen } from './entfernen';

/**
 * Die Paketverwaltung (#1278: aufgeteilt in Teil-Klassen, siehe basis.ts). Hier stehen die Schritte, die eine Bestätigung
 * brauchen: Fingerabdruck einer Quelle, Herausgeber und Rechte beim Installieren, Aktualisieren und im Ablauf.
 */
export class Paketverwaltung extends PaketEntfernen {
  /** Fingerabdruck muss genau der sein, den der Admin gesehen und bestätigt hat (wie beim ersten Kontakt mit SSH). */
  private static fingerabdruckBestaetigt(k: Schluessel, e: { fingerabdruck?: unknown }) {
    if (String(e.fingerabdruck ?? '') === k.fingerabdruck) return;
    throw new Fachfehler(
      409,
      t(e.fingerabdruck ? 'pakete.herkunft.fehler.schluessel.anders' : 'pakete.herkunft.fehler.schluessel.bestaetigen'),
      { schluessel: true, fingerabdruck: k.fingerabdruck },
    );
  }

  async quelleHinzufuegen(e: { url?: unknown; fingerabdruck?: unknown }, von: Handelnder): Promise<Quelle[]> {
    let u: URL;
    try {
      u = new URL(String(e.url ?? '').trim());
    } catch {
      throw new Fachfehler(422, 'Bitte eine vollständige Adresse eingeben, z. B. https://example.org/katalog.json.');
    }
    if (u.protocol !== 'https:') throw new Fachfehler(422, t('meldungen.pakete.kataloge-gehen-nur-ueber'));
    const url = u.toString();
    const liste = await paketQuellen(this.d.kern);
    if (url === this.katalogUrl || liste.some((q) => q.url === url))
      throw new Fachfehler(409, t('meldungen.pakete.diese-adresse-ist-schon'));
    if (liste.length >= 20) throw new Fachfehler(422, t('meldungen.pakete.hoechstens-20-weitere-kataloge'));
    // Eigener Schlüssel (#594): nur nach Bestätigung des Fingerabdrucks, nie stillschweigend.
    const k = await this.schluesselVon(url);
    if (k) Paketverwaltung.fingerabdruckBestaetigt(k.s, e);
    const am = new Date().toISOString();
    await setzePaketQuellen(this.d.kern, [
      ...liste,
      {
        url,
        aktiv: true,
        von: von.email,
        am,
        ...(k ? { schluessel: { pem: k.s.pem, fingerabdruck: k.s.fingerabdruck, von: von.email, am } } : {}),
      },
    ]);
    log.warn('Paketquelle hinzugefügt', { von: von.email, url, schluessel: k ? k.s.fingerabdruck : 'ohne Schlüssel' });
    return this.quellen();
  }

  /**
   * Schlüssel eines eigenen Katalogs bestätigen (#594): nach einer Sperre (Schlüssel geändert) oder wenn der
   * Anbieter erst später einen Schlüssel veröffentlicht. Ohne passenden Fingerabdruck: 409 mit dem Fingerabdruck.
   */
  async quelleSchluessel(e: { url?: unknown; fingerabdruck?: unknown }, von: Handelnder): Promise<Quelle[]> {
    const url = String(e.url ?? '');
    const q = (await paketQuellen(this.d.kern)).find((x) => x.url === url);
    if (!q) throw new Fachfehler(404, t('meldungen.pakete.diese-quelle-gibt-es'));
    const k = await this.schluesselVon(url);
    if (!k) throw new Fachfehler(404, t('pakete.herkunft.fehler.keinschluessel', { url }));
    Paketverwaltung.fingerabdruckBestaetigt(k.s, e);
    await this.aendereQuelle(url, {
      schluessel: { pem: k.s.pem, fingerabdruck: k.s.fingerabdruck, von: von.email, am: new Date().toISOString() },
      gesperrt: null,
    });
    this.kataloge.delete(url);
    log.warn('Katalogschlüssel bestätigt', {
      von: von.email,
      url,
      schluessel: k.s.fingerabdruck,
      vorher: q.schluessel?.fingerabdruck ?? 'ohne Schlüssel',
    });
    return this.quellen();
  }

  /** Erstmals ein Herausgeber (#1084, Sicherheit C): ohne ausdrückliche Bestätigung kein Update. */
  private static herausgeberBestaetigen(plan: Vorschau, e: { herausgeberBestaetigt?: boolean }) {
    if (plan.herausgeberBestaetigen && e.herausgeberBestaetigt !== true) {
      throw new Fachfehler(409, t('meldungen.pakete.herausgeber-erstmals', { herausgeber: plan.herausgeberBestaetigen }), {
        herausgeber: plan.herausgeberBestaetigen,
      });
    }
  }

  /** Rechte eines Pakets mit Code verlangen eine ausdrückliche Bestätigung (#338). */
  private static rechteBestaetigen(plan: Vorschau, e: { rechteBestaetigt?: boolean }) {
    if (plan.laeufer?.bestaetigen && e.rechteBestaetigt !== true) {
      throw new Fachfehler(409, t('meldungen.pakete.enthaelt-code-der-in', { name: plan.paket.name }), {
        rechte: rechteZeilen(plan.laeufer.rechte),
      });
    }
  }

  /**
   * Installieren aus einem Katalog oder hochgeladen; mit `mitAbhaengigkeiten` vorher fehlende Abhängigkeiten.
   * Nicht aus dem offiziellen Katalog nur mit ausdrücklicher Bestätigung (#189).
   */
  async installiere(e: InstallierenEingabe, von: Handelnder): Promise<InstalliertesPaket> {
    const hoch = e.upload ? await this.hochgeladen(e.upload) : null;
    const quelle = hoch ? null : await this.erlaubt(e.quelle ? String(e.quelle) : undefined);
    const geladen = hoch
      ? { paket: hoch.paket, v: undefined, katalog: await this.offiziell(), pruefung: hoch.pruefung }
      : await this.lade(String(e.id ?? ''), e.version ? String(e.version) : undefined, quelle!);
    // Herkunft (#189, #594): bestätigen, wenn keine gültige Signatur sie belegt.
    if (geladen.pruefung.bestaetigen && e.bestaetigt !== true) throw herkunftFehler(geladen.pruefung, quelle === this.katalogUrl);
    const { paket, v } = geladen;
    const id = paket.manifest.id;
    const installiertJetzt = await this.d.kern.repo.listePakete();
    const alt = installiertJetzt.find((p) => p.id === id) ?? installierteErsetzt(installiertJetzt, paket.manifest) ?? null;
    const herkunft: InstalliertesPaket['herkunft'] = hoch
      ? { art: 'hochgeladen', von: hoch.von.email, am: hoch.am }
      : { art: 'katalog', url: quelle! };
    if (alt) {
      // Herausgeber (#1084) zuerst: Dieselbe Id von jemand anderem ist kein Update, gleich aus welcher Quelle.
      const fremd = this.andererHerausgeber(paket.manifest, alt, { herkunft, pruefung: geladen.pruefung });
      if (fremd) throw new Fachfehler(409, fremd, { gruende: [fremd] });
      // Ein hochgeladenes Paket aktualisiert man durch erneutes Hochladen einer höheren Version.
      if (!hoch) throw new Fachfehler(409, t('meldungen.pakete.ist-schon-installiert-aktualisieren', { name: alt.name }));
      if (alt.herkunft.art !== 'hochgeladen') throw new Fachfehler(409, t('meldungen.pakete.stammt-aus-einem-katalog', { name: alt.name }));
    }
    // Ein Paket aus einer Sammeldatei einzeln: fremde_typen zählen nur, wenn sie schon installiert sind (#1084).
    const vorschau = await this.plane(paket, v, geladen.katalog, e.namen ?? {}, e.sichtNamen ?? {}, {
      quelle: { herkunft, pruefung: geladen.pruefung },
      ...(hoch?.sammel ? { sammel: new Set<string>() } : {}),
    });
    const fehlen = vorschau.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length && (!e.mitAbhaengigkeiten || alt)) {
      throw new Fachfehler(
        409,
        t('meldungen.pakete.es-fehlen-pakete-die', {
          name: paket.manifest.name,
          map: fehlen.map((a) => `${a.id} ${a.bereich}`).join(', '),
        }),
        { gruende: fehlen.map((a) => (a.verfuegbar ? `${a.id}: im Katalog gibt es ${a.verfuegbar}` : `${a.id}: nicht im Katalog`)) },
      );
    }
    // Namen zuerst (#1123): Was sich umbenennen lässt, meldet die Installation mit Vorschlag – bevor etwas angelegt wird.
    const konflikte = [...vorschau.typen, ...vorschau.sichten].filter((x) => x.konflikt);
    if (konflikte.length)
      throw new Fachfehler(409, t('meldungen.pakete.einige-namen-gibt-es'), { gruende: vorschau.namenskonflikte, konflikte: true });
    if (vorschau.probleme.length) throw new Fachfehler(409, vorschau.probleme[0], { gruende: vorschau.probleme });
    Paketverwaltung.rechteBestaetigen(vorschau, e);
    Paketverwaltung.herausgeberBestaetigen(vorschau, e);
    this.umbauBestaetigen(vorschau, e);
    this.sichtenErsetzen.set(vorschau, ersetzenAus(e));
    // Abhängigkeiten mit Code installiert das DMS nicht still mit: ihre Rechte bestätigt man an ihnen selbst (#338).
    for (const a of fehlen) {
      if (!a.verfuegbar) continue;
      const dep = await this.lade(a.id, a.verfuegbar, quelle ?? this.katalogUrl);
      if (dep.paket.code)
        throw new Fachfehler(409, t('meldungen.pakete.die-abhaengigkeit-enthaelt-code', { name: dep.paket.manifest.name }), {
          gruende: [`${a.id}: enthält Code`],
        });
    }
    for (const a of fehlen) {
      if (!a.verfuegbar) throw new Fachfehler(409, t('meldungen.pakete.die-abhaengigkeit-gibt-es', { id: a.id, bereich: a.bereich }));
      // Abhängigkeiten aus derselben Quelle; bei hochgeladenen Paketen aus dem offiziellen Katalog.
      // Beispiele der Abhängigkeit mit, wenn welche gewünscht sind – die eigenen Beispiele können auf sie zeigen (#347).
      await this.installiere(
        {
          id: a.id,
          version: a.verfuegbar,
          beispiele: e.beispiele === true,
          mitAbhaengigkeiten: true,
          quelle: quelle ?? this.katalogUrl,
          bestaetigt: e.bestaetigt,
        },
        von,
      );
    }
    const datensatz = await this.lege(
      paket,
      herkunft,
      v,
      vorschau,
      e.beispiele === true && !alt,
      von,
      alt,
      einzuschalten(e.automatisierungen, paket),
    );
    if (hoch) await this.vergissUpload(String(e.upload));
    log.info(alt ? 'Paket aktualisiert (hochgeladen)' : 'Paket installiert', {
      von: von.email,
      paket: id,
      version: paket.manifest.version,
      ...(alt ? { vorher: alt.version } : {}),
      herkunft: hoch ? 'hochgeladen' : quelle,
      pruefung: geladen.pruefung.art + (geladen.pruefung.stand ? ` (Katalog vom ${geladen.pruefung.stand})` : ''),
      typen: Object.keys(datensatz.typen).length,
      sichten: Object.keys(datensatz.sichten).length,
    });
    void nachweis('betrieb.paket', {
      aktion: alt ? 'aktualisiert' : 'installiert',
      paket: id,
      version: paket.manifest.version,
      vorher: alt?.version ?? null,
      von: von.email,
    });
    return datensatz;
  }

  /** Update aus der Quelle des Pakets: ergänzt nur – neue Typen, Felder, Register, Sichten. */
  async aktualisiere(
    id: string,
    e: {
      version?: string;
      bestaetigt?: boolean;
      rechteBestaetigt?: boolean;
      herausgeberBestaetigt?: boolean;
      automatisierungen?: string[];
    } & UmbauEingabe,
    von: Handelnder,
  ): Promise<InstalliertesPaket> {
    const alt = (await this.d.kern.repo.listePakete()).find((p) => p.id === id);
    if (!alt) throw new Fachfehler(404, t('meldungen.pakete.ist-nicht-installiert', { id }));
    if (alt.herkunft.art !== 'katalog') throw new Fachfehler(409, t('meldungen.pakete.ein-hochgeladenes-paket'));
    const quelle = await this.erlaubt(alt.herkunft.url);
    const { paket, v, katalog, pruefung } = await this.lade(id, e.version ? String(e.version) : undefined, quelle, true);
    if (pruefung.bestaetigen && e.bestaetigt !== true) throw herkunftFehler(pruefung, quelle === this.katalogUrl);
    const plan = await this.plane(paket, v, katalog, {}, {}, { quelle: { herkunft: alt.herkunft, pruefung } });
    const fehlen = plan.abhaengigkeiten.filter((a) => !a.installiert);
    if (fehlen.length)
      plan.probleme.push(t('meldungen.pakete.es-fehlen-pakete', { map: fehlen.map((a) => `${a.id} ${a.bereich}`).join(', ') }));
    if (plan.probleme.length) throw new Fachfehler(409, plan.probleme[0], { gruende: plan.probleme });
    Paketverwaltung.rechteBestaetigen(plan, e);
    Paketverwaltung.herausgeberBestaetigen(plan, e);
    this.umbauBestaetigen(plan, e);
    this.sichtenErsetzen.set(plan, ersetzenAus(e));
    const neu = await this.lege(paket, alt.herkunft, v, plan, false, von, alt, einzuschalten(e.automatisierungen, paket));
    log.info('Paket aktualisiert', {
      von: von.email,
      paket: id,
      ...(plan.umzug ? { neueId: neu.id } : {}),
      vorher: alt.version,
      version: neu.version,
      pruefung: pruefung.art,
      neueTypen: plan.typen.filter((t) => !t.vorhanden && !t.geloescht).length,
      neueSichten: plan.sichten.filter((s) => !s.vorhanden).length,
    });
    void nachweis('betrieb.paket', { aktion: 'aktualisiert', paket: neu.id, version: neu.version, vorher: alt.version, von: von.email });
    return neu;
  }

  /**
   * Gespeicherte Werte als Eingabe fürs Speichern: Geheimnisse als „behalten“ (sonst würde der verschlüsselte Wert
   * noch einmal verschlüsselt), alles andere wie gespeichert.
   */
  private static alsEingabe(b: Einstellungsbeschreibung, werte: Record<string, unknown>): Record<string, unknown> {
    const g = (f: EinstellungFeld, v: unknown) => (f.typ === 'geheim' ? (typeof v === 'string' && v ? { behalten: true } : null) : v);
    const erg: Record<string, unknown> = {};
    for (const f of abschnittsfelder(b)) erg[f.schluessel] = g(f, werte[f.schluessel]);
    for (const l of listen(b))
      erg[l.schluessel] = (Array.isArray(werte[l.schluessel]) ? (werte[l.schluessel] as Record<string, unknown>[]) : []).map((x) =>
        Object.fromEntries([[EINTRAG_ID, x[EINTRAG_ID]], ...l.felder.map((f) => [f.schluessel, g(f, x[f.schluessel])])]),
      );
    return erg;
  }

  /**
   * Alles aus einem Ablauf installieren (#405) – erst alles prüfen, dann Paket für Paket (Abhängigkeiten zuerst).
   * Fehlt eine Bestätigung, eine Einstellung oder passt ein Name nicht, wird nichts installiert. Scheitert ein Paket
   * beim Anlegen, ist es vollständig zurückgenommen; die übrigen werden weiter installiert, nur Pakete, die das
   * gescheiterte brauchen, fallen mit Grund weg (#646) – das Ergebnis sagt genau, was installiert ist.
   */
  async ablaufInstallieren(e: AblaufInstallation, von: Handelnder): Promise<AblaufErgebnis> {
    const karte = (x: unknown): Record<string, Record<string, string>> =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(
            Object.entries(x as Record<string, unknown>)
              .filter(([, v]) => v && typeof v === 'object')
              .map(([k, v]) => [k, Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([a, b]) => [a, String(b)]))]),
          )
        : {};
    const namen = karte(e.namen),
      sichtNamen = karte(e.sichtNamen);
    const { plan, teile } = await this.ablaufIntern(e, namen, sichtNamen);
    if (plan.probleme.length) throw new Fachfehler(409, plan.probleme[0], { gruende: plan.probleme });
    // Namen zuerst (#1123), wie beim einzelnen Paket.
    const konflikte = plan.pakete.flatMap((p) => p.vorschau.namenskonflikte.map((x) => `${p.name}: ${x}`));
    if (konflikte.length) throw new Fachfehler(409, t('meldungen.pakete.einige-namen-gibt-es'), { gruende: konflikte, konflikte: true });
    const pp = plan.pakete.flatMap((p) => p.vorschau.probleme.map((x) => `${p.name}: ${x}`));
    if (pp.length) throw new Fachfehler(409, pp[0], { gruende: pp });
    if (plan.herkunftBestaetigen && e.bestaetigt !== true) {
      const offen = teile.find((x) => x.pruefung.bestaetigen);
      throw herkunftFehler(
        plan.herkunft ?? { art: 'unsigniert', offiziell: false, bestaetigen: true },
        offen?.herkunft.art === 'katalog' && offen.herkunft.url === this.katalogUrl,
      );
    }
    // Erstmals ein Herausgeber an einem Bestandspaket (Sicherheit C): ein Haken, sonst nichts.
    const erstmals = plan.pakete.filter((p) => p.vorschau.herausgeberBestaetigen);
    if (erstmals.length && e.herausgeberBestaetigt !== true) {
      throw new Fachfehler(
        409,
        erstmals
          .map((p) => `${p.name}: ${t('meldungen.pakete.herausgeber-erstmals', { herausgeber: p.vorschau.herausgeberBestaetigen! })}`)
          .join(' '),
        { herausgeber: erstmals.map((p) => ({ id: p.id, name: p.name, herausgeber: p.vorschau.herausgeberBestaetigen })) },
      );
    }
    if (plan.rechte.bestaetigen && e.rechteStand !== plan.rechte.stand) {
      const rechte = plan.pakete
        .filter((p) => p.vorschau.laeufer?.bestaetigen)
        .flatMap((p) => rechteZeilen(p.vorschau.laeufer!.rechte).map((z) => `${p.name}: ${z}`));
      throw new Fachfehler(409, t(e.rechteStand ? 'pakete.ablauf.fehler.rechteneu' : 'pakete.ablauf.fehler.rechte'), {
        rechte,
        rechteStand: plan.rechte.stand,
      });
    }
    // Pflicht-Einstellungen: ausgefüllt und gültig – oder bewusst später.
    const spaeter = new Set(Array.isArray(e.spaeter) ? e.spaeter.map(String) : []);
    const eingaben =
      e.einstellungen && typeof e.einstellungen === 'object' ? (e.einstellungen as Record<string, Record<string, unknown>>) : {};
    const zuSpeichern = new Map<string, Record<string, unknown>>();
    const felderFehler: Record<string, string> = {};
    const adressen: Array<{ paket: string; feld: string; wert: string }> = [];
    for (const [i, p] of plan.pakete.entries()) {
      const b = teile[i].paket.einstellungen;
      if (!b || !p.einstellungen.length || spaeter.has(p.id)) continue;
      const eingabe = eingaben[p.id] && typeof eingaben[p.id] === 'object' ? eingaben[p.id] : {};
      const werte = Paketverwaltung.alsEingabe(b, await this.startwerte(teile[i].paket));
      for (const f of p.einstellungen) werte[f.schluessel] = eingabe[f.schluessel] ?? null;
      const r = pruefeWerte(b, werte, await this.verweisquelle(p.id));
      for (const [k, v] of Object.entries(r.fehler)) felderFehler[`${p.id}.${k}`] = `${p.name}: ${v}`;
      for (const f of p.einstellungen)
        if (f.typ === 'geheim' && !(typeof werte[f.schluessel] === 'string' && werte[f.schluessel]))
          felderFehler[`${p.id}.${f.schluessel}`] = `${p.name}: Pflichtfeld.`;
      for (const f of adressfelder(b))
        if (typeof r.werte[f.schluessel] === 'string' && r.werte[f.schluessel])
          adressen.push({ paket: p.name, feld: f.name, wert: String(r.werte[f.schluessel]) });
      zuSpeichern.set(p.id, werte);
    }
    if (Object.keys(felderFehler).length)
      throw new Fachfehler(422, t('pakete.ablauf.fehler.einstellungen'), { felderFehler, gruende: Object.values(felderFehler) });
    if (adressen.length && e.adresseBestaetigt !== true) {
      throw new Fachfehler(409, t('pakete.ablauf.fehler.adresse', { adressen: adressen.map((a) => `${a.paket} → ${a.wert}`).join(', ') }), {
        adresse: adressen.map((a) => ({ feld: `${a.paket}: ${a.feld}`, wert: a.wert })),
      });
    }
    const beispiele = new Set(Array.isArray(e.beispiele) ? e.beispiele.map(String) : []);
    const ein =
      e.automatisierungen && typeof e.automatisierungen === 'object' && !Array.isArray(e.automatisierungen)
        ? (e.automatisierungen as Record<string, unknown>)
        : {};
    const erg: AblaufErgebnis = { installiert: [], fehlgeschlagen: [], fehler: null, nichtInstalliert: [...(plan.ausgelassen ?? [])] };
    const abh = plan.pakete.map((p, i) => ({ id: p.id, abhaengigkeiten: teile[i].paket.manifest.abhaengigkeiten }));
    for (const [i, p] of plan.pakete.entries()) {
      // Ein gescheitertes Paket hält nur auf, was es braucht (#646); die übrigen werden weiter installiert.
      const an = haengenAn(
        abh,
        erg.fehlgeschlagen.map((x) => x.id),
      ).get(p.id);
      if (an) {
        erg.nichtInstalliert.push({
          id: p.id,
          name: p.name,
          version: p.version,
          grund: t('pakete.ablauf.braucht.gescheitert', { name: plan.pakete.find((y) => y.id === an)?.name ?? an }),
        });
        continue;
      }
      const x = teile[i];
      try {
        const jetzt = await this.d.kern.repo.listePakete();
        const alt = jetzt.find((y) => y.id === p.id) ?? installierteErsetzt(jetzt, x.paket.manifest) ?? null;
        // Frisch planen: Die Pakete davor sind jetzt installiert (Verweise, Namen).
        const vorschau = await this.plane(x.paket, x.v, x.katalog ?? (await this.offiziell()), namen[p.id] ?? {}, sichtNamen[p.id] ?? {}, {
          quelle: { herkunft: x.herkunft, pruefung: x.pruefung },
          ablauf: true,
          ...(x.upload ? { sammel: sammelKennungen(teile.map((y) => y.paket)) } : {}),
        });
        if (vorschau.namenskonflikte.length)
          throw new Fachfehler(409, t('meldungen.pakete.einige-namen-gibt-es'), { gruende: vorschau.namenskonflikte, konflikte: true });
        if (vorschau.probleme.length) throw new Fachfehler(409, vorschau.probleme[0], { gruende: vorschau.probleme });
        const ds = await this.lege(
          x.paket,
          x.herkunft,
          x.v,
          vorschau,
          beispiele.has(p.id) && !alt,
          von,
          alt,
          einzuschalten(ein[p.id], x.paket),
        );
        if (x.upload) await this.vergissUpload(x.upload);
        log.info(alt ? 'Paket aktualisiert (Ablauf)' : 'Paket installiert (Ablauf)', {
          von: von.email,
          paket: p.id,
          version: ds.version,
          ...(alt ? { vorher: alt.version } : {}),
          herkunft: x.herkunft.art === 'katalog' ? x.herkunft.url : 'hochgeladen',
          pruefung: x.pruefung.art,
          gebrauchtVon: p.fuer.join(', ') || '–',
        });
        void nachweis('betrieb.paket', {
          aktion: alt ? 'aktualisiert' : 'installiert',
          paket: p.id,
          version: ds.version,
          vorher: alt?.version ?? null,
          von: von.email,
        });
        let einst: AblaufErgebnis['installiert'][number]['einstellungen'] = p.einstellungen.length
          ? spaeter.has(p.id)
            ? 'spaeter'
            : 'fertig'
          : 'keine';
        const w = zuSpeichern.get(p.id);
        if (w) {
          try {
            await this.speichereEinstellungen(p.id, { werte: w, adresseBestaetigt: true }, von);
          } catch (f) {
            einst = 'fehler';
            log.warn('Einstellungen aus dem Ablauf nicht gespeichert', { paket: p.id, fehler: meldungen(f) });
          }
        }
        erg.installiert.push({ id: p.id, name: ds.name, version: ds.version, einstellungen: einst });
      } catch (f) {
        erg.fehlgeschlagen.push({
          id: p.id,
          name: p.name,
          meldung: (f as Error).message,
          gruende: ((f as Fachfehler).details as { gruende?: string[] } | undefined)?.gruende ?? [],
        });
        erg.fehler ??= erg.fehlgeschlagen[0];
        log.warn('Ablauf: Paket nicht installiert', { paket: p.id, fehler: meldungen(f) });
      }
    }
    log.info('Pakete in einem Ablauf', {
      von: von.email,
      installiert: erg.installiert.map((y) => `${y.id}@${y.version}`).join(', ') || '–',
      fehler: erg.fehlgeschlagen.map((y) => y.id).join(', ') || '–',
      ausgelassen: erg.nichtInstalliert.map((y) => y.id).join(', ') || '–',
      spaeter: [...spaeter].join(', ') || '–',
    });
    return erg;
  }
}
