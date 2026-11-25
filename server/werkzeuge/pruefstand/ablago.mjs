/**
 * Prüfstand (#1679): Verbindung zu einer laufenden Ablago über die Schnittstelle – Einrichten, Anmelden,
 * Verwaltungsmodus, JSON-Anfragen und Hochladen. Nur `fetch` aus Node, keine weiteren Abhängigkeiten.
 */

/** Ablago hat geantwortet, aber nicht mit 2xx. */
class Antwortfehler extends Error {
  constructor(methode, pfad, status, text) {
    super(`${methode} ${pfad}: ${status} ${text.slice(0, 300)}`);
    this.status = status;
    try {
      this.details = JSON.parse(text)?.details ?? null;
    } catch {
      this.details = null;
    }
  }
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sitzung gegen eine Ablago unter `basis` (z. B. http://localhost:3000). Werkbank-Anfragen senden `x-dms-aktiv`, damit
 * der Verwaltungsmodus über den ganzen Lauf bestehen bleibt; ist er abgelaufen, beginnt die Sitzung ihn neu.
 */
export class Ablago {
  constructor(basis, { zeit = 120_000 } = {}) {
    this.basis = basis.replace(/\/+$/, '');
    this.zeit = zeit;
    this.cookie = null;
  }

  async roh(methode, pfad, { body, koepfe = {}, zeit } = {}) {
    const binaer = Buffer.isBuffer(body);
    return fetch(this.basis + pfad, {
      method: methode,
      headers: {
        'x-dms': '1',
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': binaer ? 'application/octet-stream' : 'application/json' }),
        ...(pfad.startsWith('/api/werkbank/') ? { 'x-dms-aktiv': '1' } : {}),
        ...koepfe,
      },
      body: body === undefined ? undefined : binaer ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(zeit ?? this.zeit),
    });
  }

  async json(methode, pfad, o = {}) {
    try {
      return await this.einmal(methode, pfad, o);
    } catch (e) {
      if (!(e instanceof Antwortfehler) || e.status !== 403 || !e.details?.verwaltungsmodus) throw e;
      await this.verwaltung();
      return this.einmal(methode, pfad, o);
    }
  }

  async einmal(methode, pfad, o) {
    const r = await this.roh(methode, pfad, o);
    const t = await r.text();
    if (!r.ok) throw new Antwortfehler(methode, pfad, r.status, t);
    const c = r.headers.get('set-cookie');
    if (c) this.cookie = c.split(';')[0];
    return t ? JSON.parse(t) : null;
  }

  /** Bis Ablago antwortet (höchstens `sekunden`). */
  async bereit(sekunden = 180) {
    for (let i = 0; i < sekunden; i += 2) {
      try {
        return await this.einmal('GET', '/api/konto/status', {});
      } catch {
        await warte(2000);
      }
    }
    throw new Error(`Ablago unter ${this.basis} antwortet nicht`);
  }

  /** Frische Ablago einrichten (Konto und Mandant) oder, wenn schon eingerichtet, anmelden. */
  async einrichtenOderAnmelden({ email, passwort, mandant = 'Prüfstand', code }) {
    const s = await this.bereit();
    if (s.einrichtungNoetig) {
      if (s.einrichtung?.phase !== 'konto')
        throw new Error(`Ablago ist noch nicht mit einer Datenbank verbunden (Phase ${s.einrichtung?.phase ?? '?'})`);
      await this.json('POST', '/api/konto/einrichten', {
        body: { mandant, name: 'Prüfstand', email, passwort },
        koepfe: code ? { 'x-einrichtungscode': code } : {},
      });
      // Den Assistenten schließen wie der Lasttest: Schlüssel, Notfallblatt, fertig.
      await this.json('POST', '/api/werkbank/tresor/erzeugen').catch(() => {});
      await this.roh('GET', '/api/werkbank/notfallblatt')
        .then((r) => r.arrayBuffer())
        .catch(() => {});
      await this.json('POST', '/api/werkbank/einrichtung/schritt', { body: { schritt: 'fertig' } }).catch(() => {});
    }
    await this.json('POST', '/api/konto/anmelden', { body: { email, passwort } });
    await this.verwaltung();
    return s;
  }

  async verwaltung() {
    await this.json('POST', '/api/konto/verwaltung', { body: {} }).catch(() => undefined);
  }
}

export { warte };
