/**
 * Postfächer (#960: aus routen.ts): Postfächer und ihre Anmeldung per OAuth 2.0.
 */
import { darfBereich } from '../../../shared/src/verwaltungsrecht';
import { RueckrufFehler, VERSAND_OAUTH_ID } from '../postfach-oauth';
import { L, ok, leer, b, ich, leseCookie, POSTFACH_BINDUNG_COOKIE, kurzCookie } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function postfaecherRouten(k: RoutenKontext): Route[] {
  const { x, postfaecher, pfOAuth, pfRueckruf, oauthPostfach } = k;
  return [
    // Postfächer (#196): nur Administratoren; Passwörter verlassen den Server nie.
    { methode: 'GET', pfad: '/api/werkbank/postfaecher', zugang: 'admin', handler: async () => ok(await postfaecher().ansicht()) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher', zugang: 'admin', handler: async (a) => ok(await postfaecher().speichere(a.body, null, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/testen', zugang: 'admin', handler: async (a) => ok(await postfaecher().teste(a.body, typeof (b(a) as { id?: unknown }).id === 'string' ? (b(a) as { id: string }).id : null)) },
    { methode: 'PUT', pfad: '/api/werkbank/postfaecher/:id', zugang: 'admin', handler: async (a) => ok(await postfaecher().speichere(a.body, a.params.id, ich(a).email)) },
    { methode: 'DELETE', pfad: '/api/werkbank/postfaecher/:id', zugang: 'admin', handler: async (a) => { await postfaecher().loesche(a.params.id, ich(a).email); return leer; } },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/abrufen', zugang: 'admin', handler: async (a) => ok({ uebernommen: await postfaecher().abrufen(a.params.id) }) },
    /* ---------- Postfächer: Anmeldung per OAuth 2.0 (#358) ---------- */
    // Gerätecode-Status wird alle paar Sekunden abgefragt: lesend (#373); die erfolgreiche Anmeldung protokolliert postfach-oauth.ts selbst.
    { methode: 'GET', pfad: '/api/werkbank/postfaecher-oauth', zugang: 'admin', handler: async () => ok({ apps: await pfOAuth().appsAnsicht(), rueckruf: pfRueckruf() }) },
    { methode: 'PUT', pfad: '/api/werkbank/postfaecher-oauth/:anbieter', zugang: 'admin', handler: async (a) => ok({
      // Neuer Mandant bzw. Token-Endpunkt: Postfächer dieses Anbieters abmelden (Sicherheits-Review #358).
      // Auch die Anmeldung des E-Mail-Versands (#813), wenn sie diesen Anbieter nutzt.
      apps: await pfOAuth().speichereApp(a.params.anbieter, a.body, ich(a).email, async (an) => [
        ...(x.postfaecher ? (await x.postfaecher.liste()).filter((p) => p.anmeldung === 'oauth' && p.anbieter === an).map((p) => p.id) : []),
        ...(x.betrieb?.ansicht?.().mail.anmeldung === 'oauth' && x.betrieb.ansicht().mail.anbieter === an ? [VERSAND_OAUTH_ID] : []),
      ]),
      rueckruf: pfRueckruf(),
    }) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/start', zugang: 'admin', handler: async (a) => {
      const s = await pfOAuth().start(await oauthPostfach(a.params.id), { id: ich(a).id, email: ich(a).email }, pfRueckruf());
      return { body: { url: s.url }, cookies: [kurzCookie(POSTFACH_BINDUNG_COOKIE, s.bindung, 600, '/api/oauth/postfach')] };
    } },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/geraet', zugang: 'admin', handler: async (a) => ok(await pfOAuth().geraetStart(await oauthPostfach(a.params.id), { id: ich(a).id, email: ich(a).email })) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/geraet/pruefen', zugang: 'admin', lesend: true, handler: async (a) => ok(await pfOAuth().geraetPruefen(a.params.id, { id: ich(a).id })) },
    { methode: 'POST', pfad: '/api/werkbank/postfaecher/:id/oauth/abmelden', zugang: 'admin', handler: async (a) => {
      await postfaecher().hole(a.params.id);
      await pfOAuth().abmelden(a.params.id, ich(a).email);
      return ok(await postfaecher().ansicht());
    } },
    // Rückruf des Anbieters: nur für den Administrator, der die Anmeldung begonnen hat (state, Sitzung, Bindungs-Cookie).
    // Ziel der Rückkehr ist immer ein fester Pfad in der Werkbank – das Postfach stammt aus dem gespeicherten state.
    { methode: 'GET', pfad: '/api/oauth/postfach/rueckruf', zugang: 'offen', handler: async (a) => {
      const raus = [kurzCookie(POSTFACH_BINDUNG_COOKIE, '', 0, '/api/oauth/postfach')];
      // Im Verwaltungsmodus mit Recht auf Postfächer oder – für den Versand (#813) – auf E-Mail und Adresse. Welches der
      // beiden gemeint war, steht erst nach dem Rückruf fest; die Bindung an den Start (Cookie, Person) prüft PostfachOAuth.
      const admin = a.benutzer?.rolle === 'admin' && (darfBereich(a.benutzer, 'postfaecher') || darfBereich(a.benutzer, 'betrieb')) ? { id: a.benutzer.id } : null;
      try {
        const r = await pfOAuth().rueckruf(a.query, admin, leseCookie(a.cookieKopf, POSTFACH_BINDUNG_COOKIE));
        // E-Mail-Versand (#813): zurück zu E-Mail und Adresse.
        if (r.postfachId === VERSAND_OAUTH_ID) return { weiterleiten: '/werkbank/betrieb?oauth=angemeldet', cookies: raus };
        return { weiterleiten: `/werkbank/postfaecher/${encodeURIComponent(r.postfachId)}?oauth=angemeldet`, cookies: raus };
      } catch (e) {
        const text = (e as Error).message;
        L.ablage.warn('Postfach: OAuth-Rückruf abgelehnt', { ip: a.ip, grund: text });
        // Nur ein fester Fehlercode in der Adresse – die Texte stehen in der Oberfläche (kein fremder Text als Meldung).
        const id = e instanceof RueckrufFehler && e.postfachId && admin ? `/${encodeURIComponent(e.postfachId)}` : '';
        const code = e instanceof RueckrufFehler ? e.code : 'unbekannt';
        if (e instanceof RueckrufFehler && e.postfachId === VERSAND_OAUTH_ID && admin) return { weiterleiten: `/werkbank/betrieb?oauthfehler=${code}`, cookies: raus };
        return { weiterleiten: `/werkbank/postfaecher${id}?oauthfehler=${code}`, cookies: raus };
      }
    } },
  ];
}
