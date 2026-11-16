/**
 * Vorschau planen (`plane`): was ein Paket anlegt bzw. ergänzt, mit allen Prüfungen – für Vorschau und Installation.
 */
import { istLeer } from '../../../../shared/src/model';
import {
  DMS_ALIAS,
  veralteteVerweise,
  gleicheRechte,
  rechtePunkte,
  dmsPasst,
  neuestePassende,
  passt,
  vergleicheVersion,
  VERSION,
  type Katalog,
  type KatalogVersion,
} from '../../../../shared/src/pakete';
import { archivAusPaket } from '../../../../shared/src/archiv';
import { hauptpaket, istOffiziellerHerausgeber, typKennung } from '../../../../shared/src/kennungen';
import { einstellungsAenderung } from '../../../../shared/src/paketeinstellungen';
import { t } from '../../sprache';
import { DEUTSCH } from '../../../../shared/src/deutsch';
import { abdeckung } from '../../../../shared/src/sprachpaket';
import { planeUmbau } from '../index';
import { sichtFassung, sichtZustand } from '../index';
import { mitkommtVon } from '../index';
import { abhaengigeTypen, abhaengigkeitsKonflikte, eigeneKonflikte, Namensherkunft } from '../index';
import { paketZeitplaene, paketZeitplan } from './automatisierungen';
import { beispielDokumenteVon, beispielVerweise } from './beispiele';
import {
  BASIS_ABLAGEORT_AB,
  DMS_PRAEFIX,
  DMS_TYPEN,
  DMS_VERWEISE_AB,
  fremderTyp,
  istDmsVerweis,
  type Paket,
  type PaketTyp,
  str,
  typverweise,
} from './format';
import {
  freierName,
  gleicheQuelle,
  installierteErsetzt,
  nachEltern,
  offiziellBelegt,
  paketFelderAus,
  sichtAusPaket,
  uebernahmePlan,
  vertrauen,
} from './hilfen';
import { log } from './optionen';
import { type AbhaengigkeitPlan, type PlanQuelle, type SichtPlan, type TypPlan, type Vorschau } from './plan';
import {
  abschnitteNeu,
  beschriftungenNeu,
  erkennungNeu,
  formatNeu,
  neueFelderAuf,
  typAngabenNeu,
  vorbelegenNeu,
  wiederfindenNeu,
} from './update-neu';
import { PaketVorschauTeile } from './vorschau-teile';

/** Vorschau planen. */
export abstract class PaketPlanung extends PaketVorschauTeile {
  /**
   * geplant (#405): Namen von Mappentypen und Ansichten (oberste Ebene), die Pakete davor im selben Ablauf anlegen –
   * sie zählen wie vorhandene; die eigenen kommen dazu.
   */
  protected async plane(
    paket: Paket,
    v?: KatalogVersion,
    katalog?: Katalog,
    namen: Record<string, string> = {},
    sichtNamen: Record<string, string> = {},
    mehr: { geplant?: { typen: Set<string>; sichten: Set<string> }; quelle?: PlanQuelle; sammel?: Set<string>; ablauf?: boolean } = {},
  ): Promise<Vorschau> {
    const { geplant, quelle, sammel, ablauf } = mehr;
    const m = paket.manifest;
    const installierte = await this.d.kern.repo.listePakete();
    // Umzug (#1084): Unter der neuen Id noch nicht da, aber unter einer früheren – dann ist es ein Update dieser Installation.
    const ich = installierte.find((p) => p.id === m.id) ?? installierteErsetzt(installierte, m) ?? null;
    const umzug = ich && ich.id !== m.id ? ich.id : null;
    const typen = await this.d.mappentypen.listeTypen();
    const sichten = await this.d.sichtenVerwaltung.listeSichten();
    const probleme: string[] = [];
    const fehlercodes: string[] = [];
    const dmsVersion = this.o.version();
    const dmsOk = dmsPasst(dmsVersion, m.dms);
    if (!dmsOk) probleme.push(t('meldungen.pakete.das-paket-braucht-ablago', { dms: m.dms, dmsVersion }));
    const hinweise: string[] = [];
    // Code läuft erst mit dem Paket-Läufer; Einstellungen lassen sich schon pflegen (#197).
    if (m.code !== undefined && !paket.code) hinweise.push(t('meldungen.pakete.das-paket-enthaelt-code'));
    if (ich && vergleicheVersion(m.version, ich.version) <= 0) {
      probleme.push(t('meldungen.pakete.version-ist-schon-installiert', { version: ich.version }));
      fehlercodes.push('schon-installiert');
    }
    // Herausgeber (#1084): Dieselbe Id von einem anderen Herausgeber ersetzt das installierte Paket nie.
    const herausgeber = m.herausgeber ?? this.standardHerausgeber(quelle?.herkunft, quelle?.pruefung);
    const problem = (code: string, text: string) => {
      probleme.push(text);
      fehlercodes.push(code);
    };
    // app.ablago (auch app.ablago.*) gehört dem Projekt (Sicherheit C): nur aus dem offiziellen Katalog bzw. mit Prüfsumme dort.
    if (istOffiziellerHerausgeber(m.herausgeber) && quelle?.pruefung && !offiziellBelegt(quelle.pruefung))
      problem('herausgeber-nicht-offiziell', t('meldungen.pakete.herausgeber-nicht-offiziell', { herausgeber: m.herausgeber! }));
    const fremd = ich ? this.andererHerausgeber(m, ich, quelle) : null;
    if (fremd) problem('anderer-herausgeber', fremd);
    // Herausgeber eines weiteren signierten Katalogs ist an dessen Schlüssel gebunden (beim ersten Mal gemerkt).
    if (
      ich?.herausgeberSchluessel &&
      quelle?.pruefung.fingerabdruck &&
      quelle.pruefung.fingerabdruck !== ich.herausgeberSchluessel &&
      !quelle.pruefung.wechsel
    ) {
      problem('herausgeber-schluessel', t('meldungen.pakete.herausgeber-schluessel', { herausgeber: herausgeber ?? '–' }));
    }
    // Umzug (#1084, `ersetzt`): nur ausdrücklich, aus derselben Quelle, mindestens so vertrauenswürdig und vom selben,
    // bekannten Herausgeber – sonst könnte ein beliebiges Paket eine fremde Installation samt Zugangsdaten übernehmen.
    if (umzug) {
      const vorher = this.herausgeberVon(ich!);
      if (!quelle || !gleicheQuelle(ich!.herkunft, quelle.herkunft) || vertrauen(quelle.pruefung) < this.vertrauenVon(ich!))
        problem('umzug-quelle', t('meldungen.pakete.umzug-andere-quelle', { alt: umzug, neu: m.id }));
      else if (!vorher || vorher !== herausgeber)
        problem('umzug-herausgeber', t('meldungen.pakete.umzug-herausgeber', { alt: umzug, neu: m.id }));
      else hinweise.push(t('meldungen.pakete.umzug', { alt: umzug, neu: m.id }));
    }
    // Ergänzung mit Punkt (Sicherheit B): derselbe Herausgeber wie das Hauptpaket – installiert oder im Katalog.
    const haupt = hauptpaket(m.id);
    if (haupt) {
      const hi = installierte.find((p) => p.id === haupt);
      const hk = hi ? null : katalog?.pakete.find((p) => p.id === haupt);
      const vonHaupt = hi
        ? this.herausgeberVon(hi)
        : hk
          ? (hk.herausgeber ?? (quelle?.herkunft.art === 'katalog' ? this.standardHerausgeber(quelle.herkunft, quelle.pruefung) : null))
          : null;
      if ((hi || hk) && vonHaupt !== herausgeber)
        problem(
          'ergaenzung-herausgeber',
          t('meldungen.pakete.ergaenzung-herausgeber', {
            id: m.id,
            haupt,
            herausgeber: vonHaupt ?? t('meldungen.pakete.herausgeber-unbekannt'),
          }),
        );
    }
    // Erstmals ein Herausgeber an einem Paket ohne (Bestand, Sicherheit C): ab jetzt gilt er – nur nach ausdrücklicher
    // Bestätigung in der Vorschau (herausgeberBestaetigt), nie still.
    const herausgeberErstmals = ich && !this.herausgeberVon(ich) && herausgeber ? herausgeber : null;
    const geprueft =
      !!herausgeber &&
      (istOffiziellerHerausgeber(herausgeber) ? !!quelle && offiziellBelegt(quelle.pruefung) : quelle?.pruefung.art === 'anbieter');
    // Sprachpaket (#731): je Sprache ein Paket; was zu dieser Version nicht passt, fällt weg (Hinweis).
    const sp = paket.sprache;
    if (sp) {
      const anderes = installierte.find((p) => p.id !== m.id && p.id !== umzug && p.sprache?.kennung === sp.angabe.kennung);
      if (anderes) {
        probleme.push(t('meldungen.sprachpakete.schon-da', { name: anderes.name, kennung: sp.angabe.kennung }));
        fehlercodes.push('sprache-schon-da');
      }
      if (sp.uebergangen.length) hinweise.push(t('meldungen.sprachpakete.uebergangen', { anzahl: sp.uebergangen.length }));
      if (VERSION.test(dmsVersion) && vergleicheVersion(sp.angabe.ablago, dmsVersion) < 0)
        hinweise.push(t('meldungen.sprachpakete.aelter', { ablago: sp.angabe.ablago, version: dmsVersion }));
    }
    // Verweise auf Mappentypen des DMS (#310), z. B. dms:rolle; dms:ablageort ist seit #883 ein Alias für basis:ablageort.
    const dmsTypen = await this.dmsTypen();
    const genutzt = [
      ...new Set(
        typverweise(paket.typen, paket.sichten)
          .filter(istDmsVerweis)
          .map((vw) => vw.slice(DMS_PRAEFIX.length)),
      ),
    ];
    for (const k of genutzt.filter((k) => !dmsTypen.has(k))) {
      probleme.push(
        DMS_ALIAS[k]
          ? t('meldungen.pakete.alias-ohne-ziel', { vw: DMS_PRAEFIX + k, neu: DMS_ALIAS[k], version: BASIS_ABLAGEORT_AB })
          : t('meldungen.pakete.das-paket-verweist-auf', { wert: DMS_TYPEN[k] ?? k, DMS_VERWEISE_AB }),
      );
    }
    const veraltet = veralteteVerweise([
      ...typverweise(paket.typen, paket.sichten),
      ...(paket.code ? [...paket.code.info.rechte.lesen, ...paket.code.info.rechte.schreiben, ...(paket.code.info.mappentypen ?? [])] : []),
      ...paket.automatisierungen.map((a) => str(a.wenn.typ)),
    ]);
    for (const vw of veraltet) hinweise.push(t('meldungen.pakete.alias-veraltet', { vw, neu: DMS_ALIAS[vw.slice(DMS_PRAEFIX.length)] }));
    const da = genutzt.filter((k) => dmsTypen.has(k) && !DMS_ALIAS[k]);
    if (da.length)
      hinweise.push(
        t('meldungen.pakete.nutzt-mappentypen-aus-ablago', {
          map: da.map((k) => t('meldungen.pakete.aus-ablago', { name: dmsTypen.get(k)!.name })).join(', '),
        }),
      );
    // Wortlisten (#356): Gruppen gleichbedeutender Wörter für die Suche.
    if (paket.wortlisten.length) hinweise.push(t('meldungen.pakete.bringt-gruppen-gleichbedeutender', { anzahl: paket.wortlisten.length }));
    // Beispiele, die auf Beispiele einer Abhängigkeit zeigen (#347): ohne diese bleiben die Verweise leer.
    for (const p of new Set(
      paket.beispiele
        .flatMap((b) => beispielVerweise(b.werte))
        .filter((z) => z.includes(':') && !z.startsWith(`${m.id}:`))
        .map((z) => z.split(':')[0]),
    )) {
      const da = installierte.find((x) => x.id === p);
      if (da && !Object.keys(da.beispiele ?? {}).length)
        hinweise.push(t('meldungen.pakete.einige-beispiele-zeigen-auf', { name: da.name }));
    }
    const abhaengigkeiten = Object.entries(m.abhaengigkeiten).map(([id, bereich]): AbhaengigkeitPlan => {
      const da = installierte.find((p) => p.id === id);
      const kp = katalog?.pakete.find((p) => p.id === id);
      return {
        id,
        bereich,
        installiert: da?.version ?? null,
        ok: !!da && passt(da.version, bereich) && this.herausgeberPasst(da, herausgeber),
        verfuegbar: kp ? (neuestePassende(kp, bereich)?.version ?? null) : null,
      };
    });
    // Abhängigkeiten über Id und Herausgeber (Sicherheit C): Ein fremdes „basis“ erfüllt die eines offiziellen Pakets nicht.
    for (const a of abhaengigkeiten) {
      const da = installierte.find((p) => p.id === a.id);
      if (da && !this.herausgeberPasst(da, herausgeber))
        problem(
          'abhaengigkeit-herausgeber',
          t('meldungen.pakete.abhaengigkeit-herausgeber', {
            id: a.id,
            herausgeber: this.herausgeberVon(da) ?? t('meldungen.pakete.herausgeber-unbekannt'),
          }),
        );
    }
    for (const a of abhaengigkeiten) {
      if (a.installiert && !a.ok && passt(a.installiert, a.bereich)) continue;
      if (a.installiert && !a.ok) {
        a.problem = t('meldungen.pakete.ist-in-version-installiert', { id: a.id, installiert: a.installiert, bereich: a.bereich });
        probleme.push(a.problem);
      }
    }
    const belegt = new Set([...typen.map((t) => t.name.trim().toLowerCase()), ...(geplant?.typen ?? [])]);
    // Namenskonflikte (#1123): Typen von Abhängigkeiten, die mitinstalliert würden, zählen wie vorhandene (im Ablauf und
    // in der Sammeldatei sind sie eigene Pakete des Plans).
    const abhaengig = ablauf || sammel ? [] : abhaengigeTypen(m.abhaengigkeiten, katalog, (id) => installierte.some((p) => p.id === id));
    const namensHerkunft = new Namensherkunft({ typen, sichten, installierte, abhaengig });
    for (const k of abhaengigkeitsKonflikte(abhaengig, belegt, namensHerkunft)) problem('namenskonflikt-abhaengigkeit', k);
    // Text → Verweis (#534): Angaben im alten Textfeld, deren Verweis noch leer ist.
    const umwandelbar = async (t: PaketTyp) => {
      const typ = typen.find((x) => x.id === ich?.typen[t.schluessel]);
      const erg: Array<{ feld: string; aus: string; anzahl: number }> = [];
      for (const f of t.felder) {
        const alt = f.ausText ? typ?.felder.find((x) => x.key === f.ausText && (x.typ === 'text' || x.typ === 'langtext')) : undefined;
        if (!typ || !alt) continue;
        const anzahl = (await this.d.mappen.listeMappen(typ.id)).filter(
          (m) => !istLeer(m.werte[alt.key]) && istLeer(m.werte[f.key]),
        ).length;
        erg.push({ feld: typ.felder.find((x) => x.key === f.key)?.label ?? f.label, aus: alt.label, anzahl });
      }
      return erg;
    };
    const ueb = await this.uebernahme(paket, ich);
    if (ueb) hinweise.push(t('meldungen.pakete.ablageort-uebernommen', { name: ueb.name }));
    // Vorgaben (#1038): Zustand je Vorgabe, Ergänzungen an Vorgaben anderer Pakete (die es geben muss).
    const { vorgaben: vorgabenPlan, ergaenzungen: ergaenzungenPlan } = await this.planeVorgaben(paket, ich, {
      installierte,
      typen,
      namen,
      herausgeber,
      hinweise,
    });
    const beruflich = paket.typen.some((x) => x.archiv?.jahreBeruflich) && (await this.d.kern.merkmale()).beruflich;
    // Umbau (#1041): je Schritt die Vorschau; Übernahmen gelten unten wie neue Typen (mit der Id des alten).
    const umbauProbleme: Array<{ code: string; text: string }> = [];
    // Typverweis → Id in dieser Installation (Vorschau: was es noch nicht gibt, ist null).
    const typIdJetzt = (vw: string): string | null => {
      const [p, sl] = vw.includes(':') ? vw.split(':') : [m.id, vw];
      return (
        (p === 'dms'
          ? dmsTypen.get(sl)?.id
          : p === m.id
            ? (ich?.typen[sl] ?? ueb?.typen[sl])
            : installierte.find((x) => x.id === p)?.typen[sl]) ?? null
      );
    };
    const umbau = await planeUmbau(
      this.d,
      {
        paket: { id: m.id, name: m.name, version: m.version, typen: paket.typen, umbau: paket.umbau ?? [] },
        ich,
        installierte,
        typen,
        herausgeber,
        herausgeberVon: (p) => this.herausgeberVon(p),
        paketFelder: (s) =>
          paketFelderAus(
            paket.typen.find((x) => x.schluessel === s),
            m.id,
          ),
        zielTitel: (nach, feld) => this.zielTitel({ paket, nach, feld, typen, installierte, typId: typIdJetzt, vorgaben: vorgabenPlan }),
      },
      umbauProbleme,
    );
    for (const x of umbauProbleme) problem(x.code, x.text);
    // Sicherheit: Jeder Umbau braucht seine eigene Vorschau und Bestätigung – nie „alle auf einmal“ im Ablauf.
    if (ablauf && umbau.schritte.length) problem('umbau-einzeln', t('meldungen.pakete.umbau.einzeln', { name: m.name }));
    const typPlaene = await Promise.all(
      paket.typen.map(async (paketTyp): Promise<TypPlan> => {
        // Kennung im DMS (#1084): Paket und Schlüssel getrennt, nach außen `paket:schluessel` – eindeutig auch bei „_“ in beiden.
        const dmsSchluessel = typKennung(m.id, paketTyp.schluessel);
        const vorhandenId = ich?.typen[paketTyp.schluessel] ?? ueb?.typen[paketTyp.schluessel];
        const vorhanden = vorhandenId ? typen.find((x) => x.id === vorhandenId) : undefined;
        if (vorhanden) {
          return {
            schluessel: paketTyp.schluessel,
            dmsSchluessel,
            name: vorhanden.name,
            felder: paketTyp.felder.length,
            vorhanden: true,
            neueFelder: paketTyp.felder.filter((f) => !vorhanden.felder.some((g) => g.key === f.key)).map((f) => f.label),
            neueRegister: paketTyp.register.filter((r) => !vorhanden.register.some((g) => g.key === r.key)).map((r) => r.name),
            erkennung: erkennungNeu(paketTyp, vorhanden).map((f) => f.label),
            wiederfinden: wiederfindenNeu(paketTyp, vorhanden).map((f) => f.label),
            vorbelegen: vorbelegenNeu(paketTyp, vorhanden).map((f) => f.label),
            typAngaben: Object.keys(typAngabenNeu(paketTyp, vorhanden)).length > 0,
            umwandeln: await umwandelbar(paketTyp),
            formate: formatNeu(paketTyp, vorhanden).map((f) => f.label),
            beschriftungen: beschriftungenNeu(paketTyp, vorhanden).anzahl,
            abschnitte: abschnitteNeu(paketTyp, vorhanden, (r) => [...(r.felder ?? []), ...neueFelderAuf(paketTyp, vorhanden, r)]).map(
              (r) => r.name,
            ),
            konflikt: null,
            vorschlag: null,
          };
        }
        if (vorhandenId)
          return {
            schluessel: paketTyp.schluessel,
            dmsSchluessel,
            name: paketTyp.name,
            felder: paketTyp.felder.length,
            vorhanden: false,
            neueFelder: [],
            neueRegister: [],
            konflikt: null,
            vorschlag: null,
            geloescht: true,
          };
        // Übernahme (#1041): Der alte Typ wird zu diesem – sein eigener Name zählt nicht als belegt.
        const ueberPlan = uebernahmePlan(paketTyp, umbau, { m, namen, typen, geplant, belegt });
        if (ueberPlan) return ueberPlan;
        if (typen.some((x) => x.schluessel === dmsSchluessel))
          probleme.push(t('meldungen.pakete.die-kennung-hat-schon', { dmsSchluessel }));
        const name = (namen[paketTyp.schluessel] ?? paketTyp.name).trim();
        const konflikt = belegt.has(name.toLowerCase()) ? t('meldungen.pakete.einen-mappentyp-gibt-es', { name }) : null;
        const vorschlag = konflikt ? freierName(name, m.name, belegt) : null;
        belegt.add(name.toLowerCase());
        // Archivmodus (#1051): nur für neue Typen; der Administrator ändert ihn danach am Mappentyp.
        const archiv = archivAusPaket(paketTyp.archiv, beruflich);
        return {
          schluessel: paketTyp.schluessel,
          dmsSchluessel,
          name,
          felder: paketTyp.felder.length,
          vorhanden: false,
          neueFelder: [],
          neueRegister: [],
          konflikt,
          vorschlag,
          ...(archiv
            ? {
                archiv: {
                  ...archiv,
                  stichtagName: archiv.stichtag ? (paketTyp.felder.find((f) => f.key === archiv.stichtag)?.label ?? archiv.stichtag) : null,
                },
              }
            : {}),
        };
      }),
    );
    for (const n of belegt) geplant?.typen.add(n);
    // Ansichten mit Mappentypen, die das Paket nicht mitbringt (#656): fehlt einer, kommt die Ansicht ohne ihn; fehlen
    // alle, wird sie (mit ihren Unteransichten) übersprungen – das übrige Paket wird trotzdem installiert.
    const ausgelassen = new Map<string, string>();
    for (const s of nachEltern(paket.sichten)) {
      if (s.eltern && ausgelassen.has(s.eltern)) {
        ausgelassen.set(
          s.schluessel,
          `Ansicht „${s.name}“ wird nicht installiert: Sie steht unter „${paket.sichten.find((x) => x.schluessel === s.eltern)?.name ?? s.eltern}“, die nicht installiert wird.`,
        );
        continue;
      }
      const fremd = s.fremdeTypen ?? [];
      const fehlt = fremd.filter((f) => !fremderTyp(f.kennung, typen, installierte));
      // Sammeldatei (#1084, Sicherheit A): Was sich weder installiert noch in der Datei zuordnen lässt, ist ein Fehler mit
      // Namen – die Installation bricht vorher ab, statt die Ansicht still ohne den Typ anzulegen.
      if (sammel) {
        for (const f of fehlt.filter((x) => !sammel.has(x.kennung))) {
          probleme.push(t('meldungen.pakete.sammel-fremder-typ', { sicht: s.name, typ: f.name, kennung: f.kennung }));
          fehlercodes.push('fremder-typ');
        }
        continue;
      }
      if (fremd.length && fehlt.length === fremd.length && !(s.typen ?? []).length)
        ausgelassen.set(
          s.schluessel,
          `Ansicht „${s.name}“ wird nicht installiert: Den Mappentyp ${fehlt.map((f) => `„${f.name}“`).join(', ')} gibt es in dieser Installation nicht.`,
        );
    }
    for (const g of ausgelassen.values()) hinweise.push(g);
    const sichtPlaene = paket.sichten.map((s): SichtPlan => {
      if (ausgelassen.has(s.schluessel) && !ich?.sichten[s.schluessel])
        return {
          schluessel: s.schluessel,
          name: s.name,
          eltern: s.eltern ?? null,
          vorhanden: false,
          konflikt: null,
          vorschlag: null,
          ausgelassen: ausgelassen.get(s.schluessel)!,
        };
      const ohne = (s.fremdeTypen ?? []).filter((f) => !fremderTyp(f.kennung, typen, installierte)).map((f) => f.name);
      if (ohne.length && !ich?.sichten[s.schluessel])
        hinweise.push(t('meldungen.pakete.ansicht-kommt-ohne-den', { name: s.name, map: ohne.map((n) => `„${n}“`).join(', ') }));
      const vorhandenId = ich?.sichten[s.schluessel] ?? ueb?.sichten[s.schluessel];
      const vorhanden = vorhandenId ? sichten.find((x) => x.id === vorhandenId) : undefined;
      if (vorhanden || vorhandenId) {
        // Prüfwert (#1125): unverändert → neue Fassung; ohne Stand (vor #1125) nur „gleich“, wenn sie der Fassung entspricht.
        const st = ich?.sichtStand?.[s.schluessel];
        const wieImPaket =
          !st && vorhanden
            ? {
                name: vorhanden.name,
                elternId: s.eltern ? (ich?.sichten[s.eltern] ?? null) : null,
                ...sichtAusPaket(s, {
                  typId: typIdJetzt,
                  fremd: (s.fremdeTypen ?? []).map((f) => fremderTyp(f.kennung, typen, installierte)?.id).filter((x): x is string => !!x),
                  zieltypenIn: (b) =>
                    b.art === 'feld' && b.op === 'zeigtAufTyp' && b.wert?.art === 'fest' && Array.isArray(b.wert.wert)
                      ? { ...b, wert: { art: 'fest', wert: b.wert.wert.map((vw) => typIdJetzt(str(vw))).filter((x): x is string => !!x) } }
                      : b,
                }),
              }
            : null;
        const zustand = ich ? sichtZustand({ stand: st, fassung: sichtFassung(s), jetzt: vorhanden, wieImPaket }) : undefined;
        return {
          schluessel: s.schluessel,
          name: vorhanden?.name ?? s.name,
          eltern: s.eltern ?? null,
          vorhanden: true,
          konflikt: null,
          vorschlag: null,
          ...(zustand ? { zustand } : {}),
        };
      }
      const name = (sichtNamen[s.schluessel] ?? s.name).trim();
      // Konflikt nur auf oberster Ebene: Untersichten stehen unter der neuen Elternsicht.
      const geschwister = s.eltern
        ? []
        : [...sichten.filter((x) => !x.elternId).map((x) => x.name.trim().toLowerCase()), ...(geplant?.sichten ?? [])];
      const konflikt = geschwister.includes(name.toLowerCase()) ? t('meldungen.pakete.eine-ansicht-gibt-es', { name }) : null;
      if (!s.eltern) geplant?.sichten.add(name.toLowerCase());
      return {
        schluessel: s.schluessel,
        name,
        eltern: s.eltern ?? null,
        vorhanden: false,
        konflikt,
        vorschlag: konflikt ? freierName(name, m.name, new Set(geschwister)) : null,
        ...(ohne.length ? { ohne } : {}),
      };
    });
    // Namenskonflikte (#1123) vor dem Installieren: je Typ bzw. Ansicht mit Herkunft – in der Vorschau durch Umbenennen lösbar.
    const namenskonflikte = eigeneKonflikte({
      typen: typPlaene,
      sichten: sichtPlaene,
      herkunft: namensHerkunft,
      uebernommen: new Set(umbau.schritte.flatMap((g) => (g.plan.art === 'uebernehmen' && g.alt ? [g.alt.id] : []))),
    });
    for (const k of namenskonflikte) problem('namenskonflikt', k);
    // Aktionen im Menü „Mappe“ (#1039): jede mit ihren Rechten; neu = beim Update dazugekommen oder mit anderen Rechten.
    const aktionen = (paket.mappenaktionen ?? []).map((a) => {
      const alt = ich?.mappenaktionen?.find((x) => x.schluessel === a.schluessel);
      return {
        schluessel: a.schluessel,
        name: a.name,
        rechte: a.rechte,
        typen: a.mappentypen.map((vw) => this.typName(vw, paket, installierte, typen)),
        ...(a.dialog ? { dialog: a.dialog } : {}),
        neu:
          !alt ||
          JSON.stringify([...alt.rechte].sort()) !== JSON.stringify([...a.rechte].sort()) ||
          JSON.stringify(alt.anlegen ?? []) !== JSON.stringify(a.anlegen ?? []),
      };
    });
    // Update (#1174): selbst geänderte mitgelieferte Automatisierungen bleiben – die Vorschau nennt sie mit der neuen Fassung.
    const geaenderteAutos: Record<string, { id: string; aenderungen: string[] }> =
      ich && paket.automatisierungen.length
        ? ((await this.d.paketAutomatisierungenVergleich?.(ich, paket.automatisierungen).catch((e: Error) => {
            log.warn('Vergleich der Automatisierungen fehlgeschlagen', { paket: m.id, fehler: e.message });
            return {};
          })) ?? {})
        : {};
    const vorschau: Vorschau = {
      paket: {
        id: m.id,
        name: m.name,
        version: m.version,
        beschreibung: m.beschreibung,
        lizenz: m.lizenz,
        autor: m.autor,
        dms: m.dms,
        abhaengigkeiten: m.abhaengigkeiten,
        readme: v?.readme ?? null,
        changelog: v?.changelog ?? null,
        quelle: v?.quelle ?? null,
        herausgeber,
        herausgeberGeprueft: geprueft,
      },
      dmsVersion,
      dmsOk,
      installiert: ich?.version ?? null,
      update: !!ich,
      umzug,
      herausgeberBestaetigen: herausgeberErstmals,
      herausgeberSchluessel: quelle?.pruefung.art === 'anbieter' && herausgeber ? (quelle.pruefung.fingerabdruck ?? null) : null,
      herkunft: ich?.herkunft ?? null,
      pruefung: null,
      abhaengigkeiten,
      typen: typPlaene,
      sichten: sichtPlaene,
      beispiele: paket.beispiele.length,
      beispielDokumente: beispielDokumenteVon(paket),
      vorgaben: vorgabenPlan,
      ergaenzungen: ergaenzungenPlan,
      umbau: umbau.schritte.map((g) => g.plan),
      probleme,
      fehlercodes,
      namenskonflikte,
      hinweise,
      ...(paket.ablaufvorlagen?.length ? { ablaufvorlagen: await this.vorlagenPlan(paket, typen) } : {}),
      automatisierungen: paket.automatisierungen.map((a) => ({
        schluessel: a.schluessel,
        name: a.name,
        beschreibung: a.beschreibung,
        neu: !ich?.automatisierungen?.includes(a.schluessel),
        ...(a.eingeschaltet !== undefined ? { eingeschaltet: a.eingeschaltet } : {}),
        ...(paketZeitplan(a) ? { zeitplan: paketZeitplan(a)! } : {}),
        ...(geaenderteAutos[a.schluessel] ? { geaendert: geaenderteAutos[a.schluessel] } : {}),
      })),
      einstellungen:
        paket.einstellungen || ich?.einstellungen ? einstellungsAenderung(ich?.einstellungen ?? null, paket.einstellungen) : null,
      // Berechnete Felder (#1034) stehen in der Rechte-Vorschau: „berechnet Felder …“ und wer die Werte sieht.
      // Mitgelieferte Zeitpläne (#1082): „Läuft nach Zeitplan: Verträge täglich prüfen (täglich um 05:00)“.
      laeufer: paket.code
        ? {
            rechte: rechtePunkte(
              paket.code.info,
              (vw) => this.typName(vw, paket, installierte, typen),
              paket.typen.map((x) => ({ typ: x.name, felder: x.felder.filter((f) => f.berechnet === true).map((f) => f.label) })),
              paketZeitplaene(paket),
            ),
            bestaetigen: !ich || !gleicheRechte(ich.laeufer, paket.code.info) || aktionen.some((a) => a.neu && !a.dialog),
          }
        : null,
      ...(aktionen.length ? { aktionen } : {}),
      sprache: sp
        ? {
            ...sp.angabe,
            abdeckung: abdeckung(DEUTSCH, sp.texte),
            uebergangen: sp.uebergangen.length,
            pakete: Object.keys(sp.beschriftungen),
          }
        : null,
    };
    if (umbau.schritte.length) this.umbauLagen.set(vorschau, umbau);
    vorschau.mitkommt = mitkommtVon(paket, vorschau, this.mitkommtNamen(paket, installierte, typen), !!ich);
    vorschau.kurzanleitung = paket.kurzanleitung ?? null;
    return vorschau;
  }
}
