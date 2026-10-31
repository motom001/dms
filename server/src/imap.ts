import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { GeleseneMail, ImapSitzung, ImapVerbinder, MailLeser } from './postfach';

/**
 * Anbindung der Postfächer (#196) an imapflow und mailparser (beide MIT). Getrennt von postfach.ts,
 * damit der Ablauf ohne Mailserver testbar bleibt.
 */

export const verbindeImap: ImapVerbinder = async (z, ordner) => {
  const client = new ImapFlow({
    host: z.server, port: z.port,
    secure: z.verschluesselung === 'ssl',
    // STARTTLS: verlangen (kein stilles Zurückfallen auf Klartext); „keine“: ausdrücklich ohne.
    doSTARTTLS: z.verschluesselung === 'starttls' ? true : z.verschluesselung === 'keine' ? false : undefined,
    auth: { user: z.benutzer, pass: z.passwort },
    logger: false,
    connectionTimeout: 20_000,
    socketTimeout: 120_000,
    disableAutoIdle: true,
  });
  await client.connect();
  let lock: { release(): void } | null = null;
  try {
    lock = await client.getMailboxLock(ordner);
  } catch (e) { await client.logout().catch(() => {}); throw e; }
  const box = client.mailbox;
  const sitzung: ImapSitzung = {
    uidValidity: box ? String(box.uidValidity) : '',
    anzahl: box ? box.exists : 0,
    async neue(abUid) {
      const aus: Array<{ uid: number; messageId?: string }> = [];
      if (!client.mailbox || !client.mailbox.exists) return aus;
      for await (const m of client.fetch(`${Math.max(1, abUid)}:*`, { uid: true, envelope: true }, { uid: true })) {
        if (m.uid >= abUid) aus.push({ uid: m.uid, messageId: m.envelope?.messageId });
      }
      return aus.sort((a, b) => a.uid - b.uid);
    },
    async quelle(uid) {
      const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!m || !m.source) throw new Error(`Mail ${uid} nicht mehr vorhanden`);
      return m.source;
    },
    async verschiebe(uid, ziel) {
      const liste = await client.list();
      if (!liste.some((x) => x.path === ziel)) await client.mailboxCreate(ziel).catch(() => {});
      await client.messageMove(String(uid), ziel, { uid: true });
    },
    async gelesen(uid) { await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }); },
    async loesche(uid) { await client.messageDelete(String(uid), { uid: true }); },
    async ordnerListe() { return (await client.list()).map((x) => x.path); },
    async schliessen() { lock?.release(); await client.logout().catch(() => {}); },
  };
  return sitzung;
};

/** Kleine eingebettete Bilder (Logos, Signaturen) überspringen; angehängte Mails bleiben ein Dokument. */
export const liesMail: MailLeser = async (quelle) => {
  const m = await simpleParser(quelle, { skipImageLinks: true });
  const von = m.from?.value?.[0];
  const anhaenge: GeleseneMail['anhaenge'] = m.attachments.map((a, i) => {
    const bild = a.contentType.startsWith('image/');
    const eingebettet = bild && (a.related === true || (a.contentDisposition === 'inline' && a.size < 100 * 1024));
    const endung = a.contentType === 'message/rfc822' ? '.eml' : '';
    const name = (a.filename || `Anhang ${i + 1}${endung}`).replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim();
    return { name: endung && !name.toLowerCase().endsWith('.eml') ? `${name}${endung}` : name, mime: a.contentType, inhalt: a.content, eingebettet };
  });
  // Nur Text: HTML wandelt mailparser in Text um; externe Inhalte werden nie geladen.
  const text = (m.text ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    messageId: m.messageId, betreff: (m.subject ?? '').trim(), datum: m.date ?? null,
    absenderName: von?.name ?? '', absenderAdresse: (von?.address ?? '').toLowerCase(), text, anhaenge,
  };
};
