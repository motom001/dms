/**
 * Werkbank (#960: aus routen.ts): Protokoll und Debug-Modus, Designs, Texterkennung; Ansicht, Übersicht und
 * Systemübersicht; Region, Sprachen, Übersetzen, Aufgaben-Mail und Favoriten-Freigabe.
 */
import { istPerson } from '../../../shared/src/model';
import { hatMerkmalBedingung } from '../../../shared/src/anzeige';
import { taugtAlsAufgabenEmpfaenger } from '../dienst';
import { Fachfehler } from '../fehler';
import { umzugHinweis } from '../exportordner';
import { t } from '../sprache';
import { darfBereich, darfVerwalten, hatGesamt } from '../../../shared/src/verwaltungsrecht';
import { uebersicht } from '../system';
import { MODULE, protokoll, STUFEN, type Stufe } from '../protokoll';
import { werkbankZahlen } from '../werkbankzahlen';
import { akzeptanzAufheben, akzeptierteMeldungen, meldungAkzeptieren } from '../meldungen';
import { ueberfluessigeVariablen } from '../../../shared/src/umgebungsvariablen';
import { zeitzone } from '../../../shared/src/region';
import { KOERPER_SPIELRAUM, LOGO_MAX } from '../grenzen';
import { L, ok, leer, b, ich, grenzenUndEngpaesse, ZWEITE_ABGELEHNT, nurEigeneBereiche } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function werkbankRouten(k: RoutenKontext): Route[] {
  const { dienst, x, designs, ocr } = k;
  return [
    /* ---------- Protokoll und Debug-Modus ---------- */
    { methode: 'GET', pfad: '/api/werkbank/protokoll', zugang: 'admin', handler: async (a) => {
      const q = a.query;
      const stufe = (STUFEN as readonly string[]).includes(q.stufe ?? '') ? (q.stufe as Stufe) : undefined;
      const eintraege = protokoll.eintraege({
        seit: Number(q.seit) || undefined, stufe, modul: q.modul || undefined, benutzer: q.benutzer || undefined, anfrage: q.anfrage || undefined,
        suche: q.suche?.slice(0, 200) || undefined, max: Math.min(2000, Number(q.max) || 500),
      });
      return ok({ eintraege, letzte: protokoll.letzteNr, gespeichert: protokoll.anzahl, debug: protokoll.debugStand, module: MODULE, jeModul: protokoll.jeModul() });
    } },
    { methode: 'PUT', pfad: '/api/werkbank/debug', zugang: 'admin', handler: async (a) => {
      const an = !!b(a).an;
      const r = protokoll.setzeDebug(an);
      L.system.warn(an ? `Debug-Modus eingeschaltet bis ${new Date(r.bis!).toLocaleTimeString('de-DE', { timeZone: zeitzone() })}` : 'Debug-Modus ausgeschaltet');
      return ok(r);
    } },

    /* ---------- Designs ---------- */
    // Alle Angemeldeten lesen (zum Anwenden und Auswählen), nur Administratoren ändern.
    { methode: 'GET', pfad: '/api/designs', zugang: 'angemeldet', handler: async () => ok(x.designs ? await x.designs.liste() : { designs: [], standard: null }) },
    { methode: 'POST', pfad: '/api/designs', zugang: 'admin', handler: async (a) => {
      const d = await designs().lege(a.body);
      L.werkbank.info('Design angelegt', { name: d.name });
      return ok(d, 201);
    } },
    { methode: 'PUT', pfad: '/api/designs/:id', zugang: 'admin', handler: async (a) => {
      const d = await designs().aendere(a.params.id, a.body);
      L.werkbank.info('Design geändert', { name: d.name });
      return ok(d);
    } },
    { methode: 'DELETE', pfad: '/api/designs/:id', zugang: 'admin', handler: async (a) => {
      await designs().loesche(a.params.id);
      L.werkbank.info('Design gelöscht', { id: a.params.id });
      return leer;
    } },
    // Logo je Design (#72): hochladen als rohe Bytes, entfernen, ausliefern (ohne Anmeldung nur das des Standard-Designs).
    { methode: 'PUT', pfad: '/api/designs/:id/logo', zugang: 'admin', roh: LOGO_MAX + KOERPER_SPIELRAUM, handler: async (a) => {
      const d = await designs().setzeLogo(a.params.id, a.body);
      L.werkbank.info('Logo eines Designs geändert', { design: d.name, bytes: d.logo?.groesse });
      return ok(d);
    } },
    { methode: 'DELETE', pfad: '/api/designs/:id/logo', zugang: 'admin', handler: async (a) => {
      const d = await designs().entferneLogo(a.params.id);
      L.werkbank.info('Logo eines Designs entfernt', { design: d.name });
      return ok(d);
    } },
    { methode: 'GET', pfad: '/api/designs/:id/logo', zugang: 'offen', handler: async (a) => {
      const { logo, inhalt } = await designs().logo(a.params.id, !!a.benutzer);
      return { datei: { inhalt, name: 'logo', mime: logo.mime, anzeigen: true, groesse: logo.groesse } };
    } },
    { methode: 'PUT', pfad: '/api/designs-standard', zugang: 'admin', handler: async (a) => {
      const r = await designs().setzeStandard(String(b(a).id ?? ''));
      L.werkbank.info('Standard-Design festgelegt', { id: r.standard });
      return ok(r);
    } },

    /* ---------- Technik und Versionen ---------- */
    /* ---------- E-Mail-Versand und Adresse (#37) ---------- */
    /* ---------- Texterkennung und Wartungsoperationen (#45) ---------- */
    // Mit den Dateitypen, die Pakete umwandeln bzw. umwandeln könnten (#577).
    { methode: 'GET', pfad: '/api/werkbank/texterkennung', zugang: 'admin', handler: async (a) => ok({ ...(await ocr().status(a.query.neu !== undefined)), umwandlung: await dienst.umwandlungStand(), archivfassung: await dienst.archivStand() }) },
    // Aufträge der Texterkennung einsehen, neu starten, abbrechen (#61)
    { methode: 'GET', pfad: '/api/werkbank/texterkennung/auftraege', zugang: 'admin', handler: async (a) => ok(await ocr().auftraege(a.query)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/neu', zugang: 'admin', handler: async (a) => ok(await ocr().neuStarten(b(a).ids, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/fehler-neu', zugang: 'admin', handler: async (a) => ok(await ocr().fehlerNeuStarten(ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/texterkennung/auftraege/abbrechen', zugang: 'admin', handler: async (a) => ok(await ocr().abbrechen(b(a).ids, ich(a).email)) },
    { methode: 'PUT', pfad: '/api/werkbank/texterkennung', zugang: 'admin', handler: async (a) => { await ocr().speichere(a.body); return ok({ ...(await ocr().status()), umwandlung: await dienst.umwandlungStand(), archivfassung: await dienst.archivStand() }); } },
  ];
}

export function werkbankUebersichtRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, x, system, pakete, nf } = k;
  return [
    // Ansicht der Werkbank (#281): für alle und je Administrator.
    { methode: 'GET', pfad: '/api/werkbank/ansicht', zugang: 'admin', handler: async (a) => {
      // Was eingerichtet ist, soll nicht unbemerkt aus der Leiste verschwinden.
      const sicher = async (f: () => Promise<boolean> | boolean) => { try { return await f(); } catch { return false; } };
      const benutzt = Object.entries({
        nummernkreise: () => dienst.listeNummernkreise().then((l) => l.length > 0),
        postfaecher: async () => !!x.postfaecher && (await x.postfaecher.liste()).length > 0,
        eingangsordner: () => !!x.eingangsordner?.vorhanden,
        anmeldeschutz: async () => !!x.oidc && !!(await x.oidc.bereit()),
      });
      const liste: string[] = [];
      for (const [pfad, f] of benutzt) if (await sicher(f)) liste.push(pfad);
      return ok({ ...(await dienst.werkbankAnsicht(ich(a))), benutzt: liste });
    } },
    { methode: 'PUT', pfad: '/api/werkbank/ansicht', zugang: 'admin', handler: async (a) => ok(await dienst.setzeWerkbankAnsicht(ich(a), b(a))) },
    // Merkmale der Ablage (#1032): lesen alle, die verwalten; ändern nur „Gesamte Verwaltung“ (verwaltungsbereiche.ts).
    { methode: 'GET', pfad: '/api/werkbank/merkmale', zugang: 'admin', handler: async () => ok(await dienst.merkmale()) },
    { methode: 'PUT', pfad: '/api/werkbank/merkmale', zugang: 'admin', handler: async (a) => {
      const m = await dienst.setzeMerkmale(a.body, ich(a).email);
      // Pflicht hängt an Anzeige-Bedingungen mit Merkmal (#1033): Passung dieser Mappentypen neu prüfen.
      for (const typ of await dienst.listeTypen()) if (hatMerkmalBedingung(typ)) await dienst.pruefePassung(typ.id);
      return ok(m);
    } },
    // Übersicht als Startseite der Werkbank (#68): was zu tun ist, auf einen Blick.
    // Werkbank (#921): wer außer mir gerade im Verwaltungsmodus ist – nur im Modus (zugang „admin“, Bereich für alle,
    // die verwalten), nie mit API-Schlüssel, nicht in /api/v1. Nachgefragt im Takt (`still`: verlängert den Modus nicht).
    { methode: 'GET', pfad: '/api/werkbank/gerade-im-modus', zugang: 'admin', still: true, handler: async (a) => ok(await konten.andereImVerwaltungsmodus(ich(a))) },
    { methode: 'GET', pfad: '/api/werkbank/uebersicht', zugang: 'admin', handler: async (a) => {
      const sicher = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
      const ts = x.tresor ? await sicher(() => x.tresor!.status()) : null;
      const z = await dienst.zaehler(ich(a));
      const aufgaben = await dienst.alleAufgaben(false);
      const korb = await dienst.papierkorb(ich(a), true);
      const sys = await uebersicht(system, x.betrieb?.kurz());
      return ok(nurEigeneBereiche(ich(a), {
        tresor: ts ? { zustand: ts.zustand, eingebunden: ts.eingebunden, betroffen: ts.betroffen.length } : null,
        mail: !!x.betrieb?.mailer(),
        adresse: x.betrieb ? !!x.betrieb.ansicht().adresse : true,
        texterkennung: x.texterkennung ? await sicher(() => x.texterkennung!.zaehler()) : null,
        // #459: Ist ein Paket für die Texterkennung installiert? Sonst Hinweis „Texterkennung ist jetzt ein Paket“.
        texterkennungPaket: !!(await sicher(() => dienst.texterkennungPaket())),
        aufgaben: { offen: aufgaben.length, ohneEmpfaenger: aufgaben.filter((y) => !y.empfaengerId).length },
        // #798: Aufgaben bei Personen ohne Leserecht (offene Fälle, abgeglichen alle fünf Minuten und beim Öffnen).
        ohneLeserecht: (await sicher(async () => (await dienst.offeneFaelle()).length)) ?? 0,
        // Eingangsordner (#915): Warnungen (zu alt, zu groß, fehler/, zu viele), Ordner ohne Person, nicht umbenannte Ordner.
        eingangsordner: x.eingangsordner?.vorhanden ? await sicher(() => x.eingangsordner!.meldungen()) : null,
        // #877: Dokumentdateien, die beim Lesen fehlten (und noch fehlen) – Volume vergessen, Datei gelöscht, Platte defekt.
        dateienFehlen: (await sicher(() => dienst.fehlendeDateien())) ?? 0,
        // #719: Wer im Alltag die Aufgaben ohne Empfänger bekommt; `moeglich` = aktive Benutzer ohne Admin-Rechte.
        aufgabenEmpfaenger: await sicher(async () => ({ benutzerId: (await dienst.alltagsEmpfaenger()).wirksam, moeglich: (await konten.listeBenutzer()).filter(taugtAlsAufgabenEmpfaenger).length })),
        unpassend: Object.values(z.typen).reduce((s, t) => s + (t.unpassend ?? 0), 0),
        papierkorb: { anzahl: korb.length, aeltester: korb.reduce<string | null>((m, e) => (!m || e.geloescht < m ? e.geloescht : m), null), tage: await dienst.papierkorbTage() },
        version: sys.dms,
        bestand: 'fehler' in sys.datenbank ? null : sys.datenbank,
        fehlermeldungen: x.fehlermeldungen ? await sicher(() => x.fehlermeldungen!.offen()) : null,
        // Notfallzugänge (#108), bis sie umbenannt oder deaktiviert sind.
        notfallzugaenge: x.notfall ? await sicher(() => x.notfall!.offen()) ?? [] : [],
        // Notfallcode benutzt (#815): bis jemand mit „Gesamte Verwaltung“ den Hinweis als gelesen markiert.
        notfallcodeBenutzt: x.notfallcode ? (await sicher(() => x.notfallcode!.offen()))?.map((n) => ({ id: n.id, benutzerId: n.benutzerId, name: n.name, am: n.am })) ?? [] : [],
        // Zweite Person mit Verwaltungsrecht empfehlen (#821, Konzept Punkt 7): nach der Einrichtung, solange nur eine
        // Person verwalten darf und niemand „Nein, danke“ gewählt hat.
        zweitePerson: (await sicher(async () => !(await dienst.kern.einstellungen?.lies(ZWEITE_ABGELEHNT))
          && !(x.einrichtung && (await x.einrichtung.stand()).offen)
          && (await konten.listeBenutzer()).filter((p) => istPerson(p) && p.aktiv && darfVerwalten(p)).length === 1)) ?? false,
        wartung: x.wartung?.oeffentlich() ?? null,
        // Sicherung (#105): fehlgeschlagen, zu alt, Speicherort, Notfallblatt.
        sicherung: x.sicherung ? await sicher(() => x.sicherung!.zustand()) : null,
        // Export-Ordner (#797): liegt im Sicherungsordner; Exporte beim Update aus dem Sicherungsordner verschoben.
        exporte: x.exporte ? { pfad: x.exporte.pfad, imSicherungsordner: x.exporte.imSicherungsordner, umzug: await sicher(() => umzugHinweis(dienst.kern.einstellungen)) ?? null } : null,
        // Speicherplatz (#116) und frühere Variablen, die entfernt werden können (#115).
        speicherplatz: x.speicherplatz ? await sicher(() => x.speicherplatz!.stand()) : null,
        // Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %.
        auslastung: x.systemlast?.warnung() ?? [],
        // Engpässe (#544): Wartezeit, Verbindungen, Arbeiter, Überlast – je mit der Variable.
        engpaesse: grenzenUndEngpaesse(x).engpaesse,
        // Erweiterungen der Suche (#562): fehlend oder in einem Schema, das eine Wiederherstellung löscht.
        erweiterungen: x.erweiterungen ? (await sicher(() => x.erweiterungen!()))?.filter((e) => e.zustand !== 'ok') ?? [] : [],
        // Je Variable mit Grund (#478).
        variablen: ueberfluessigeVariablen({ ordner: x.ordner?.ueberfluessig, datenbank: x.anbindung?.stand().umgebung === 'gleich', haushalt: !!(x.mandantHinweis && process.env.HAUSHALT_ID) }),
        // DATABASE_URL weicht von der Anbindung in /data/geheim ab und wird ignoriert (#119); dms-komplett ohne Volume
        // für /data/postgres (#943): Die Datenbank ginge beim nächsten Update verloren.
        anbindung: x.anbindung ? { umgebung: x.anbindung.stand().umgebung, neustartNoetig: x.anbindung.stand().neustartNoetig, ohneVolume: x.anbindung.stand().ohneVolume } : null,
        // DMS_LASTTEST in einer echten Installation (#612): nicht gestartet, das DMS läuft normal.
        lasttestAbbruch: x.lasttestAbbruch?.() ?? null,
        einrichtung: x.einrichtung ? await sicher(() => x.einrichtung!.stand()) : null,
        // Automatisierungen (#674): fehlgeschlagene Läufe und angehaltene Automatisierungen.
        automatisierungen: x.automatisierungen ? await sicher(() => x.automatisierungen!.warnungen()) : null,
        // Pflicht-Einstellungen eines Pakets fehlen (#405: im Ablauf „später ausfüllen“) – Aufgabe für den Administrator.
        paketeEinstellungen: (await sicher(() => pakete.installierte()))?.filter((p) => p.einstellungenNoetig).map((p) => ({ id: p.id, name: p.name })) ?? [],
        // KI-Dienste (#796): nach dem Update einmal sagen, dass sich Mappentypen jetzt ausschließen lassen (nur mit KI-Paketen).
        kiTypen: (await sicher(async () => { const k = await dienst.kiUebersicht(); return k.hinweis ? { pakete: k.pakete.map((p) => ({ id: p.id, name: p.name })) } : null; })) ?? null,
        // Zahlen für die linke Spalte (#375), bis der Bereich selbst geladen ist.
        zahlen: await werkbankZahlen({
          nummernkreise: () => dienst.listeNummernkreise(),
          pakete: () => pakete.installierte(),
          benutzer: () => konten.listeBenutzer(),
          postfaecher: x.postfaecher ? () => x.postfaecher!.ansicht() : undefined,
          darfWeg: () => dienst.darfWeg(),
        }),
        // Postfächer mit abgelaufener oder fehlender OAuth-Anmeldung (#358).
        postfachAnmeldung: x.postfaecher ? await sicher(() => x.postfaecher!.anmeldungFehlt()) ?? [] : [],
        // Bewusst akzeptierte Meldungen (#816): wer, wann, Begründung; die Übersicht stellt sie unten zusammen.
        akzeptiert: await sicher(() => akzeptierteMeldungen(dienst.kern.einstellungen)) ?? {},
      }));
    } },
    // Im Verwaltungsmodus angesehen (#820): Person, Mappe, Zeit – nur für „Gesamte Verwaltung“ (verwaltungsbereiche.ts).
    { methode: 'GET', pfad: '/api/werkbank/verwaltungsmodus', zugang: 'admin', handler: async () => {
      const liste = await dienst.imVerwaltungsmodus();
      const namen = new Map((await konten.personen()).map((p) => [p.id, p.name] as const));
      return ok(liste.map((e) => ({ ...e, person: e.benutzerId ? namen.get(e.benutzerId) ?? '' : '' })));
    } },
    // „Zur Kenntnis genommen“ (#816): nur gelbe Warnungen und Hinweise, im Protokoll mit Benutzer und Begründung.
    { methode: 'POST', pfad: '/api/werkbank/uebersicht/akzeptieren', zugang: 'admin', handler: async (a) => ok(await meldungAkzeptieren(dienst.kern.einstellungen, b(a), ich(a).name || ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/uebersicht/aufheben', zugang: 'admin', handler: async (a) => ok(await akzeptanzAufheben(dienst.kern.einstellungen, b(a), ich(a).name || ich(a).email)) },
    /*
     * Hinweise, die man einmal abschließt (#821, #815): „Nein, danke“ zur zweiten Person mit Verwaltungsrecht gilt
     * dauerhaft; „Gelesen“ beim benutzten Notfallcode. Beides nur „Gesamte Verwaltung“ (nur sie sieht die Hinweise).
     */
    { methode: 'POST', pfad: '/api/werkbank/uebersicht/erledigt', zugang: 'admin', handler: async (a) => {
      const k = String(b(a).schluessel ?? '');
      // KI-Dienste (#796): „Verstanden“ zum Hinweis nach dem Update – für alle, die Pakete verwalten (sie sehen ihn).
      if (k === 'ki.typen') {
        if (!darfBereich(ich(a), 'pakete')) throw new Fachfehler(403, t('konten.verwaltung.fehler.vergeben'));
        await dienst.kiHinweisGelesen(); L.werkbank.info('Hinweis „Mappentypen von KI-Diensten ausschließen“ gelesen', { von: ich(a).email });
        return leer;
      }
      if (!hatGesamt(ich(a))) throw new Fachfehler(403, t('konten.verwaltung.fehler.vergeben'));
      if (k === 'verwaltung.zweite-person') {
        const e = dienst.kern.einstellungen;
        if (!e) throw new Fachfehler(500, t('werkbank.uebersicht.akzeptiert.ohne-speicher'));
        await e.schreibe(ZWEITE_ABGELEHNT, { von: ich(a).name || ich(a).email, am: new Date().toISOString() });
        L.werkbank.info('Empfehlung „zweite Person mit Verwaltungsrecht“ abgelehnt', { meldung: k, von: ich(a).email });
      } else if (k.startsWith('notfallzugang.benutzt:')) await nf().gelesen(k.slice('notfallzugang.benutzt:'.length), ich(a));
      else throw new Fachfehler(400, t('werkbank.uebersicht.akzeptiert.ungueltig'));
      return leer;
    } },
    { methode: 'GET', pfad: '/api/werkbank/system', zugang: 'admin', handler: async () => {
      const sicher = async <T>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };
      const sp = x.speicherplatz ? await sicher(() => x.speicherplatz!.stand()) : null;
      return ok({ ...await uebersicht(system, x.betrieb?.kurz()), ordner: sp?.ordner ?? null, variablen: x.ordner?.ueberfluessig ?? [] });
    } },
  ];
}

export function werkbankEinstellungenRouten(k: RoutenKontext): Route[] {
  const { dienst, mail, region, sprachen, regionStand } = k;
  return [
    // Region (#726): Land, Bundesland, Zeitzone an einer Stelle; Vorschau der Feiertage des laufenden Jahres.
    { methode: 'GET', pfad: '/api/werkbank/region', zugang: 'admin', handler: async () => ok(await regionStand(await region().lies())) },
    { methode: 'PUT', pfad: '/api/werkbank/region', zugang: 'admin', handler: async (a) => ok(await regionStand(await region().speichere(a.body))) },
    { methode: 'GET', pfad: '/api/region', zugang: 'angemeldet', handler: async () => ok(await region().lies()) },
    // Merkmale der Ablage (#1032) für alle Angemeldeten (Apps mit Formularen, GET /api/v1/merkmale).
    { methode: 'GET', pfad: '/api/merkmale', zugang: 'angemeldet', handler: async () => ok(await dienst.merkmale()) },
    // Sprachen (#729): Werkbank → Sprachen.
    { methode: 'GET', pfad: '/api/werkbank/sprachen', zugang: 'admin', handler: async () => ok(await sprachen().stand()) },
    { methode: 'PUT', pfad: '/api/werkbank/sprachen', zugang: 'admin', handler: async (a) => { await sprachen().speichere(a.body); return ok(await sprachen().stand()); } },
    // Inhalte übersetzen (#732): an/aus für alle, Paket, Bestätigung des Datenabflusses bei Paketen mit Netz.
    { methode: 'GET', pfad: '/api/werkbank/uebersetzen', zugang: 'admin', handler: async () => ok(await dienst.uebersetzung.stand()) },
    { methode: 'PUT', pfad: '/api/werkbank/uebersetzen', zugang: 'admin', handler: async (a) => ok(await dienst.uebersetzung.setze(a.body)) },
    { methode: 'PUT', pfad: '/api/werkbank/aufgaben/mail', zugang: 'admin', handler: async (a) => ok(await mail().speichere(a.body)) },
    { methode: 'POST', pfad: '/api/werkbank/aufgaben/mail/senden', zugang: 'admin', handler: async () => ok({ verschickt: await mail().sende() }) },
    // Favoriten benachrichtigen (#506): für alle, je Rolle oder gar nicht; Vorgabe für neue Benutzer.
    // Aufgaben ohne Empfänger gehen an einen Alltags-Benutzer (#719).
    { methode: 'GET', pfad: '/api/werkbank/aufgaben-empfaenger', zugang: 'admin', handler: async () => ok(await dienst.alltagsEmpfaenger()) },
    { methode: 'PUT', pfad: '/api/werkbank/aufgaben-empfaenger', zugang: 'admin', handler: async (a) => ok(await dienst.setzeAufgabenEmpfaenger(a.body, ich(a).id)) },
    { methode: 'GET', pfad: '/api/werkbank/favoriten-freigabe', zugang: 'admin', handler: async () => ok({ freigabe: await dienst.favoritenFreigabe(), rollen: await dienst.listeRollen() }) },
    { methode: 'PUT', pfad: '/api/werkbank/favoriten-freigabe', zugang: 'admin', handler: async (a) => ok({ freigabe: await dienst.setzeFavoritenFreigabe(a.body, ich(a).email), rollen: await dienst.listeRollen() }) },
    { methode: 'POST', pfad: '/api/werkbank/favoriten-freigabe/anwenden', zugang: 'admin', handler: async (a) => ok({ benutzer: await dienst.favoritenVorgabeAnwenden(ich(a).email) }) },
  ];
}
