import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'hype.db');
// Production only: serve the built frontend from this directory (relative
// paths resolve against the process cwd). Unset → API-only, dev behavior.
const STATIC_DIR = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : undefined;

const app = createApp({ dbPath: DB_PATH, staticDir: STATIC_DIR });

app.listen(PORT, () => {
  console.log(
    `Hype API → http://localhost:${PORT} (db: ${DB_PATH})` +
      (STATIC_DIR ? ` (static: ${STATIC_DIR})` : '')
  );
});
