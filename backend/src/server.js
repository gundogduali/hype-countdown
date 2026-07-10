import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'hype.db');

const app = createApp({ dbPath: DB_PATH });

app.listen(PORT, () => {
  console.log(`Hype API → http://localhost:${PORT} (db: ${DB_PATH})`);
});
