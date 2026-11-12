/**
 * Kleine IMAP-Attrappe für die Bildaufnahmen (#999): Ablago holt eine E-Mail wie aus einem echten Postfach ab –
 * ohne Mailserver in der CI. Kann genau das, was Ablago beim Abholen fragt (imapflow): Anmelden, Ordner wählen,
 * Umschläge und Quelle holen, verschieben bzw. als gelesen markieren, abmelden. Alles andere bestätigt sie nur.
 * Nur für 127.0.0.1, ohne Verschlüsselung, mit erfundenen Daten. Keine Abhängigkeiten.
 *
 *   const a = await imapAttrappe([quelle1, quelle2]);   // a.port; a.schliessen()
 */
import { createServer } from 'node:net';

const q = (s) => `"${String(s).replace(/[\\"]/g, (z) => `\\${z}`)}"`;

/** Startet die Attrappe auf einem freien Port; `mails` sind die rohen Quellen (Buffer, RFC 5322). */
export async function imapAttrappe(mails) {
  let liste = mails.map((quelle, i) => ({ uid: i + 1, quelle, id: (/^Message-ID:\s*(<[^>]+>)/im.exec(quelle.toString('latin1')) ?? [])[1] ?? null }));
  const sockets = new Set();
  const server = createServer((s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('error', () => {});
    const schreibe = (t) => s.write(t.endsWith('\r\n') ? t : `${t}\r\n`);
    schreibe('* OK [CAPABILITY IMAP4rev1 MOVE UIDPLUS] Attrappe bereit');
    let rest = Buffer.alloc(0);
    let literal = 0;
    let zeile = '';
    s.on('data', (d) => {
      rest = Buffer.concat([rest, d]);
      for (;;) {
        if (literal > 0) {
          if (rest.length < literal) return;
          zeile += rest.subarray(0, literal).toString('latin1');
          rest = rest.subarray(literal);
          literal = 0;
        }
        const nl = rest.indexOf('\r\n');
        if (nl < 0) return;
        zeile += rest.subarray(0, nl).toString('latin1');
        rest = rest.subarray(nl + 2);
        const lit = /\{(\d+)\+?\}$/.exec(zeile);
        if (lit) { literal = Number(lit[1]); zeile = zeile.slice(0, -lit[0].length); if (!lit[0].includes('+')) schreibe('+ weiter'); continue; }
        const befehl = zeile;
        zeile = '';
        antworte(befehl);
      }
    });
    const antworte = (befehl) => {
      const [tag, ...teile] = befehl.split(' ');
      let cmd = (teile[0] ?? '').toUpperCase();
      let args = teile.slice(1);
      const uid = cmd === 'UID';
      if (uid) { cmd = (args[0] ?? '').toUpperCase(); args = args.slice(1); }
      const ok = (text = 'erledigt') => schreibe(`${tag} OK ${text}`);
      switch (cmd) {
        case 'CAPABILITY': schreibe('* CAPABILITY IMAP4rev1 MOVE UIDPLUS'); return ok();
        case 'LOGIN': return ok('[CAPABILITY IMAP4rev1 MOVE UIDPLUS] angemeldet');
        case 'LOGOUT': schreibe('* BYE bis bald'); ok(); return s.end();
        case 'SELECT': case 'EXAMINE':
          schreibe(`* ${liste.length} EXISTS`); schreibe('* 0 RECENT'); schreibe('* FLAGS (\\Seen \\Deleted)');
          schreibe('* OK [UIDVALIDITY 1] UIDs gültig'); schreibe(`* OK [UIDNEXT ${mails.length + 1}] nächste`);
          return ok(`[${cmd === 'SELECT' ? 'READ-WRITE' : 'READ-ONLY'}] gewählt`);
        case 'LIST': case 'LSUB':
          if (/""\s*$/.test(befehl) && !/"\*"|\*\s*$/.test(befehl)) schreibe(`* ${cmd} (\\Noselect) "/" ""`);
          else for (const n of ['INBOX', 'Ablago']) schreibe(`* ${cmd} () "/" ${n}`);
          return ok();
        case 'FETCH': {
          // „1:*“ oder eine Nummer; mit UID nach UID, sonst nach laufender Nummer.
          const [von, bis] = String(args[0] ?? '1').split(':');
          const ab = Number(von) || 1, ende = bis === '*' ? Infinity : Number(bis ?? von);
          const quelle = /BODY(\.PEEK)?\[\]/i.test(befehl);
          liste.forEach((m, i) => {
            const nr = uid ? m.uid : i + 1;
            if (nr < ab || nr > ende) return;
            if (quelle) { s.write(`* ${i + 1} FETCH (UID ${m.uid} BODY[] {${m.quelle.length}}\r\n`); s.write(m.quelle); schreibe(')'); return; }
            schreibe(`* ${i + 1} FETCH (UID ${m.uid} ENVELOPE (NIL NIL NIL NIL NIL NIL NIL NIL NIL ${m.id ? q(m.id) : 'NIL'}) FLAGS ())`);
          });
          return ok();
        }
        case 'MOVE': {
          const n = Number(args[0]);
          const i = liste.findIndex((m) => m.uid === n);
          if (i >= 0) { liste = liste.filter((_, j) => j !== i); schreibe(`* ${i + 1} EXPUNGE`); }
          return ok();
        }
        default: return ok();
      }
    };
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    schliessen: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}
