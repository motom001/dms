/**
 * Übernahmen beim Update (#712, #678, #1001; #1278 Teil von `Automatisierungen`): Fristen, Benachrichtigungen, „Post
 * für dich“, Favoriten-Freigabe, frühere Beispiele; dazu die Warnungen der Übersicht.
 */
import { AutomatisierungPakete } from './pakete';
import {
  bereinigeAutomatisierung,
  REIHENFOLGE,
  type Automatisierung,
  type Angehalten,
  automatisierungsProbleme,
} from '../../../../shared/src/automatisierung';
import { t, log } from './gemeinsam';
import { uuidAus } from './hilfen';
import { UMZUG_VERTRETUNG, UMZUG, BENACHRICHTIGUNGEN_PAKET, istPostFuerDich, postFuerDichDaten } from './umzug';
import { liesFavoritenFreigabe } from '../../../../shared/src/favoritenfreigabe';

/** Übernahmen beim Update und Warnungen. */
export abstract class AutomatisierungUebernehmen extends AutomatisierungPakete {
  /**
   * Erinnerungen am Feld → Automatisierungen (#712). Datumsfelder mit Frist legen keine Aufgaben mehr selbst an; für jede
   * Frist ohne passende Automatisierung („Datum erreicht“ mit demselben Typ und Feld) entsteht genau eine – mit
   * derselben Vorlaufzeit, demselben Empfänger und Text, eingeschaltet, damit sich nichts ändert. Feste Id je Typ und
   * Feld: mehrere Server legen sie nicht doppelt an. Einmal übernommen, entsteht sie nie wieder (auch nicht, wenn der
   * Admin sie löscht). Herkunft: das Paket des Mappentyps, sonst „eigen“. **Einmal** beim ersten Start nach dem Update
   * (Einstellung `fristen_umzug`): Danach legt ein Feld mit „ist eine Frist“ keine Automatisierung mehr an – Erinnerungen
   * bringen die Pakete mit (aus, beim Installieren wählbar) bzw. legt man selbst an. Die Werkbank sagt, was umgezogen ist.
   */
  async fristenUebernehmen(): Promise<number> {
    const einstSp = this.d.dienst.kern.einstellungen;
    if (await einstSp?.lies('fristen_umzug')) return 0;
    const k = await this.kontext();
    const pakete = await this.d.dienst.kern.repo.listePakete();
    const alle = await this.d.repo.liste();
    const einst = this.d.dienst.kern.einstellungen;
    const schon = new Set<string>(((await einst?.lies('fristen_uebernommen')) as string[] | null) ?? []);
    const vorher = schon.size;
    let neu = 0;
    for (const typ of k.typen) {
      for (const feld of typ.felder.filter((f) => f.typ === 'datum' && f.frist)) {
        const schluessel = `${typ.id}|${feld.key}`;
        if (schon.has(schluessel)) continue;
        schon.add(schluessel);
        if (alle.some((a) => a.wenn.art === 'datum' && a.wenn.typ === typ.id && a.wenn.feld === feld.key && a.herkunft !== 'dms')) continue;
        const fr = feld.frist!;
        const paket = pakete.find((p) => Object.values(p.typen).includes(typ.id));
        const text = fr.text.replace(/\{feld\}/g, feld.label);
        const d = bereinigeAutomatisierung({
          name: t('automatisierung.frist.name', { feld: feld.label, typ: typ.name }),
          beschreibung: t('automatisierung.frist.text'),
          wenn: {
            art: 'datum',
            typ: typ.id,
            feld: feld.key,
            vorlauf: fr.vorlauf,
            einheit: fr.einheit,
            uhrzeit: '07:00',
            wiederholung: fr.wiederholung,
          },
          dann: [
            {
              id: 'f1',
              art: 'aufgabe',
              als: 'aufgabe',
              empfaenger: [fr.empfaengerFeld ? { art: 'feld', feld: fr.empfaengerFeld, sonst: 'ersteller' } : { art: 'ersteller' }],
              text,
            },
          ],
        });
        d.reihenfolge = paket ? REIHENFOLGE.paket : REIHENFOLGE.eigen;
        const id = uuidAus(`frist|${typ.id}|${feld.key}`);
        const a: Automatisierung = {
          ...d,
          id,
          aktiv: true,
          angehalten: null,
          herkunft: paket ? 'paket' : 'eigen',
          paketId: paket?.id ?? null,
          version: 1,
          erstellt: this.iso(),
          erstelltVon: null,
          geaendert: this.iso(),
          geaendertVon: null,
        };
        try {
          await this.d.repo.lege(a);
          neu++;
        } catch {
          continue; /* ein anderer Server war schneller */
        }
        log.info('Erinnerung am Feld als Automatisierung übernommen', { typ: typ.name, feld: feld.key, automatisierung: id });
      }
    }
    if (schon.size !== vorher) await einst?.schreibe('fristen_uebernommen', [...schon].sort());
    // Vertretung (#712/#678): Der Kern legt keine Vertretungs-Aufgabe mehr an. In einer bestehenden Ablage (mehr als
    // ein Benutzer) übernimmt eine eingeschaltete Automatisierung das – gleicher Text, erledigt sich wie bisher.
    if (k.benutzer.filter((b) => b.aktiv !== false).length >= 2) {
      const d = bereinigeAutomatisierung({
        name: t('automatisierung.vertretung.name'),
        beschreibung: t('automatisierung.vertretung.beschreibung'),
        wenn: { art: 'benutzer.abwesenheit_gesetzt', typ: null },
        dann: [
          {
            id: 'v1',
            art: 'aufgabe',
            als: 'aufgabe',
            empfaenger: [{ art: 'ereignis', feld: 'vertreter' }],
            text: t('automatisierung.vertretung.text'),
            faellig: null,
          },
        ],
      });
      d.reihenfolge = REIHENFOLGE.eigen;
      const a: Automatisierung = {
        ...d,
        id: UMZUG_VERTRETUNG,
        aktiv: true,
        angehalten: null,
        herkunft: 'eigen',
        paketId: null,
        version: 1,
        erstellt: this.iso(),
        erstelltVon: null,
        geaendert: this.iso(),
        geaendertVon: null,
      };
      try {
        await this.d.repo.lege(a);
        neu++;
        log.info('Vertretungs-Aufgabe als Automatisierung übernommen', { automatisierung: a.id });
      } catch {
        /* ein anderer Server war schneller */
      }
    }
    await einst?.schreibe('fristen_umzug', { am: this.iso(), anzahl: neu, gesehen: neu === 0 });
    return neu;
  }

  /**
   * Benachrichtigungen → Automatisierungen (#678): Tägliche Zusammenfassung, Favoriten benachrichtigen und die Meldungen
   * des Anmeldeschutzes macht der Kern nicht mehr von selbst. **Einmal** beim ersten Start nach dem Update (Einstellung
   * `benachrichtigungen_umzug`) entstehen in einer bestehenden Ablage dafür Automatisierungen mit den heutigen Werten –
   * eingeschaltet, wie die Einstellungen es waren. Das Paket „Benachrichtigungen“ ersetzt sie, solange sie unverändert
   * sind. Eine frische Installation bekommt sie über das Paket (im Einrichtungsassistenten vorausgewählt).
   */
  async benachrichtigungenUebernehmen(): Promise<number> {
    const einst = this.d.dienst.kern.einstellungen;
    if (!einst || (await einst.lies('benachrichtigungen_umzug'))) return 0;
    const k = await this.kontext();
    let neu = 0;
    if (k.benutzer.length) {
      const mail = {
        aktiv: true,
        uhrzeit: '07:00',
        ...(((await einst.lies('aufgaben_mail')) ?? {}) as { aktiv?: boolean; uhrzeit?: string }),
      };
      const sperre = ((await einst.lies('anmeldesperre')) ?? {}) as { mail?: boolean; mailKonto?: boolean; mailGewaehlt?: boolean };
      const liste: Array<{ id: string; aktiv: boolean; name: string; wenn: Record<string, unknown>; dann: Record<string, unknown>[] }> = [
        {
          id: UMZUG.zusammenfassung,
          aktiv: mail.aktiv !== false,
          name: t('automatisierung.umzug.zusammenfassung'),
          wenn: { art: 'zeitplan', uhrzeit: mail.uhrzeit, tage: [1, 2, 3, 4, 5], feiertage: true, jeBenutzer: true, profilzeit: true },
          dann: [{ id: 'z1', art: 'zusammenfassung' }],
        },
        {
          id: UMZUG.favoriten,
          aktiv: true,
          name: t('automatisierung.umzug.favoriten'),
          wenn: { art: 'favorit.geaendert', typ: null },
          dann: [{ id: 'f1', art: 'favoriten' }],
        },
        {
          id: UMZUG.sammel,
          aktiv: sperre.mailGewaehlt === true && sperre.mail === true,
          name: t('automatisierung.umzug.anmeldeschutz'),
          wenn: { art: 'zeitplan', uhrzeit: '00:00', tage: [1, 2, 3, 4, 5, 6, 7], feiertage: false, jeBenutzer: false },
          dann: [{ id: 'a1', art: 'anmeldeschutz', was: 'sammel' }],
        },
        {
          id: UMZUG.konto,
          aktiv: sperre.mailKonto === true,
          name: t('automatisierung.umzug.kontosperre'),
          wenn: { art: 'benutzer.gesperrt', typ: null },
          dann: [{ id: 'k1', art: 'anmeldeschutz', was: 'konto' }],
        },
      ];
      for (const x of liste) {
        const d = bereinigeAutomatisierung({
          name: x.name,
          beschreibung: t('automatisierung.umzug.beschreibung'),
          wenn: x.wenn,
          dann: x.dann,
        });
        d.reihenfolge = REIHENFOLGE.eigen;
        const a: Automatisierung = {
          ...d,
          id: x.id,
          aktiv: x.aktiv,
          angehalten: null,
          herkunft: 'eigen',
          paketId: null,
          version: 1,
          erstellt: this.iso(),
          erstelltVon: null,
          geaendert: this.iso(),
          geaendertVon: null,
        };
        try {
          await this.d.repo.lege(a);
          neu++;
        } catch {
          /* ein anderer Server war schneller */
        }
      }
      log.info('Benachrichtigungen als Automatisierungen übernommen', { anzahl: neu });
    }
    await einst.schreibe('benachrichtigungen_umzug', { am: this.iso(), anzahl: neu });
    return neu;
  }

  /**
   * „Post für dich“ → Automatisierung (#1001): Der Kern legt die Aufgabe nicht mehr selbst an; das macht die mitgelieferte
   * Automatisierung des Pakets „Benachrichtigungen“ (ab 1.3.0). **Einmal** beim ersten Start nach dem Update (Einstellung
   * `post_umzug`): Ist das Paket installiert, entsteht bis zu seinem Update eine eingeschaltete Automatisierung mit
   * denselben Karten (feste Id); das Update des Pakets ersetzt sie, solange sie unverändert ist (an/aus bleibt). Ohne das
   * Paket entsteht keine – so entschieden in #1001; die Werkbank-Übersicht weist darauf hin. Offene Aufgaben „Post für
   * dich“ bleiben und erledigen sich wie bisher (post.dienst.ts).
   */
  async postFuerDichUebernehmen(): Promise<number> {
    const einst = this.d.dienst.kern.einstellungen;
    if (!einst || (await einst.lies('post_umzug'))) return 0;
    const pakete = await this.d.dienst.kern.repo.listePakete();
    const mitPaket = pakete.some((p) => p.id === BENACHRICHTIGUNGEN_PAKET || p.ersetzt?.includes(BENACHRICHTIGUNGEN_PAKET));
    const postTyp = (await this.d.dienst.kern.system()).post.id;
    const alle = await this.d.repo.liste();
    let neu = 0;
    if (mitPaket && !alle.some((a) => istPostFuerDich(a, postTyp))) {
      const d = postFuerDichDaten(postTyp, {
        name: t('automatisierung.post.name'),
        beschreibung: t('automatisierung.post.beschreibung'),
        text: t('automatisierung.post.text'),
      });
      d.reihenfolge = REIHENFOLGE.eigen;
      const a: Automatisierung = {
        ...d,
        id: UMZUG.post,
        aktiv: true,
        angehalten: null,
        herkunft: 'eigen',
        paketId: null,
        version: 1,
        erstellt: this.iso(),
        erstelltVon: null,
        geaendert: this.iso(),
        geaendertVon: null,
      };
      try {
        await this.d.repo.lege(a);
        neu++;
        log.info('„Post für dich“ als Automatisierung übernommen', { automatisierung: a.id });
      } catch {
        /* ein anderer Server war schneller */
      }
    } else if (!mitPaket) log.info('„Post für dich“ entfällt: Paket „Benachrichtigungen“ nicht installiert');
    await einst.schreibe('post_umzug', { am: this.iso(), anzahl: neu, paket: mitPaket });
    return neu;
  }

  /**
   * Freigabe „Favoriten benachrichtigen“ → Automatisierung (#1001): Was die Werkbank unter Aufgaben einstellte, steht
   * danach in der Karte „Favoriten-Änderungen melden“ – „für niemanden“ schaltet die Automatisierungen aus, „nur diese
   * Rollen“ wird ihre Rollen-Auswahl, „Vorgabe für neue Benutzer: aus“ ihre Vorgabe. Einmal, solange die Einstellung
   * `favoriten_freigabe` noch da ist (sie fällt danach weg). Geänderte Karten gelten als vom Admin angepasst (ein
   * Paket-Update überschreibt sie nicht).
   */
  async favoritenFreigabeUebernehmen(): Promise<number> {
    const einst = this.d.dienst.kern.einstellungen;
    const roh = await einst?.lies('favoriten_freigabe');
    if (!einst || !roh) return 0;
    const f = liesFavoritenFreigabe(roh);
    const niemand = f.erlaubt === 'aus' || (f.erlaubt === 'rollen' && !f.rollen.length);
    const konto = await this.konto().catch(() => null);
    let n = 0;
    for (const a of (await this.d.repo.liste()).filter((x) => x.dann.some((k) => k.art === 'favoriten'))) {
      const dann = a.dann.map((k) =>
        k.art !== 'favoriten'
          ? k
          : { ...k, ...(f.erlaubt === 'rollen' && f.rollen.length ? { rollen: f.rollen } : {}), ...(f.vorgabe ? {} : { vorgabe: false }) },
      );
      const geaendert = JSON.stringify(dann) !== JSON.stringify(a.dann);
      const aktiv = niemand ? false : a.aktiv;
      if (!geaendert && aktiv === a.aktiv) continue;
      if (geaendert) {
        if (await this.d.repo.speichere(a.id, { ...a, dann, aktiv }, konto?.id ?? null, a.version)) n++;
      } else {
        await this.d.repo.setze(a.id, { aktiv });
        n++;
      }
    }
    await einst.schreibe('favoriten_freigabe', null);
    log.info('Freigabe „Favoriten benachrichtigen“ in Automatisierungen übernommen', {
      erlaubt: f.erlaubt,
      rollen: f.rollen.length,
      vorgabe: f.vorgabe,
      automatisierungen: n,
    });
    return n;
  }

  /** Hinweis „umgezogen“ (#712) gelesen – verschwindet aus der Werkbank. */
  async umzugGesehen(): Promise<void> {
    const einst = this.d.dienst.kern.einstellungen;
    const u = (await einst?.lies('fristen_umzug')) as { am: string; anzahl: number; gesehen: boolean } | null;
    if (u && !u.gesehen) await einst?.schreibe('fristen_umzug', { ...u, gesehen: true });
  }

  /** Was beim Update aus Erinnerungen am Feld wurde (#712); null, wenn nichts oder schon gesehen. */
  async umzug(): Promise<{ am: string; anzahl: number } | null> {
    const u = (await this.d.dienst.kern.einstellungen?.lies('fristen_umzug')) as { am: string; anzahl: number; gesehen: boolean } | null;
    return u && !u.gesehen && u.anzahl > 0 ? { am: u.am, anzahl: u.anzahl } : null;
  }

  /**
   * Frühere Beispiele des Kerns (#675) entfallen (#883): Fachliche Automatisierungen kommen aus Paketen. Ein
   * unverändertes, nie eingeschaltetes Beispiel (Herkunft „von Ablago“) wird still entfernt; ein eingeschaltetes oder
   * geändertes bleibt und wird eine normale eigene Automatisierung (löschbar). Das Protokoll nennt beides.
   */
  async raeumeBeispieleAuf(): Promise<{ entfernt: string[]; uebernommen: string[] }> {
    const entfernt: string[] = [];
    const uebernommen: string[] = [];
    for (const a of (await this.d.repo.liste()).filter((x) => x.herkunft === 'dms')) {
      const nieEin =
        !a.aktiv &&
        a.geaendertVon === null &&
        !(await this.d.dienst.kern.repo.fassungen('automatisierung', a.id)).some((f) => (f.daten as { aktiv?: unknown }).aktiv === true);
      if (nieEin) {
        await this.d.repo.loesche(a.id);
        entfernt.push(a.name);
      } else {
        await this.d.repo.setze(a.id, { herkunft: 'eigen' });
        uebernommen.push(a.name);
      }
    }
    if (entfernt.length || uebernommen.length) {
      log.info('Beispiel-Automatisierungen aus dem Kern aufgeräumt', {
        entfernt: entfernt.join(', ') || '–',
        alsEigeneUebernommen: uebernommen.join(', ') || '–',
      });
    }
    return { entfernt, uebernommen };
  }

  /** Für die Werkbank-Übersicht: fehlgeschlagene Läufe und angehaltene Automatisierungen. */
  async warnungen(): Promise<{
    fehlgeschlagen: number;
    angehalten: Array<{ id: string; name: string; grund: Angehalten['grund'] }>;
    umgezogen: { am: string; anzahl: number } | null;
    ohneBenachrichtigungen: boolean;
    ohnePostFuerDich: boolean;
    /** Adressen, die gerade Aufrufe von außen annehmen (#679) – mit „Abschalten“ in der Übersicht. */
    aufrufe: Array<{ id: string; name: string; adresse: string }>;
  }> {
    const [fehl, liste] = await Promise.all([this.d.repo.fehlgeschlagene(), this.d.repo.liste()]);
    const aktiv = liste.filter((a) => a.aktiv);
    // Was nicht mehr passt (Feld oder Ansicht gelöscht), zählt sofort – nicht erst beim nächsten Lauf.
    const k = aktiv.some((a) => !a.angehalten) ? await this.kontext() : null;
    const angehalten = aktiv.flatMap((a) =>
      a.angehalten
        ? [{ id: a.id, name: a.name, grund: a.angehalten.grund }]
        : k && automatisierungsProbleme(a, k).length
          ? [{ id: a.id, name: a.name, grund: 'fehlerhaft' as const }]
          : [],
    );
    // Ohne Paket „Benachrichtigungen“ (#678): Keine Automatisierung schickt die Tägliche Zusammenfassung.
    const ohneBenachrichtigungen = !liste.some((a) => a.dann.some((d) => d.art === 'zusammenfassung'));
    // #1001: Keine Automatisierung legt „Post für dich“ an (Paket „Benachrichtigungen“ fehlt oder ist älter als 1.3.0).
    const postTyp = (await this.d.dienst.kern.system()).post.id;
    const ohnePostFuerDich = !liste.some((a) => a.aktiv && istPostFuerDich(a, postTyp));
    return {
      fehlgeschlagen: new Set(fehl.map((l) => l.automatisierungId)).size,
      angehalten,
      umgezogen: await this.umzug(),
      ohneBenachrichtigungen,
      ohnePostFuerDich,
      aufrufe: await this.aufrufListe(),
    };
  }
}
