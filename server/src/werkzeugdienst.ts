/**
 * Werkzeugdienst als eigenes Bündel (dist/werkzeugdienst.js, #1354): startet das Start-Skript des Images als Benutzer
 * `ablago-werkzeug`, bevor Ablago startet. Socket aus DMS_WERKZEUG_DIENST; Logik in prozesse/werkzeugdienst.ts.
 */
import { starteWerkzeugdienst } from './prozesse/werkzeugdienst';

const socket = process.env.DMS_WERKZEUG_DIENST;
if (!socket) {
  console.error('[werkzeuge] DMS_WERKZEUG_DIENST fehlt (Pfad des Sockets).');
  process.exit(2);
}
const server = await starteWerkzeugdienst({ socket, env: process.env, heim: process.env.HOME });
const ende = () => server.close(() => process.exit(0));
process.on('SIGTERM', ende);
process.on('SIGINT', ende);
