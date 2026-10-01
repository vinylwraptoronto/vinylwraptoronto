/**
 * One-off helper: start the static dist server on a fixed port and keep it
 * running until killed, so measure-homepage.mjs can be pointed at it.
 * Not wired into npm run check.
 */
import { serveDist } from './lib/static-site.mjs';

const port = Number(process.argv[2] || 8163);
const { origin } = await serveDist(port);
console.log(`SERVING ${origin}`);
