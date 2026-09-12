import { pool } from '@precios/db';
import { CooperativaAdapter } from './adapters/cooperativa.js';
import { ensureStore, startRun, finishRun, persistProduct } from './persist.js';

// `npm run scrape -- todo` baja el catalogo entero (~6.100 articulos).
const arg = process.argv[2] ?? '20';
const limit = arg === 'todo' || arg === 'all' ? Number.POSITIVE_INFINITY : Number(arg);
const adapter = new CooperativaAdapter();

console.log(
  `Scrapeando ${adapter.displayName} (limite: ${limit === Infinity ? 'catalogo completo' : limit})\n`,
);

const storeId = await ensureStore(adapter.chain, adapter.displayName);
const runId = await startRun(adapter.chain);

let total = 0;
let creados = 0;

try {
  for await (const sp of adapter.fetchProducts({ limit })) {
    const { created } = await persistProduct(sp, { chain: adapter.chain, storeId, runId });
    total++;
    if (created) creados++;
    const precio = (sp.priceCents / 100).toFixed(2).padStart(10);
    console.log(`${String(total).padStart(3)}. ${created ? '+' : '·'} $${precio}  ${sp.name.slice(0, 52)}`);
  }
  await finishRun(runId, total);
  console.log(`\nListo: ${total} productos (${creados} nuevos, ${total - creados} actualizados).`);
} catch (err) {
  await finishRun(runId, total, String(err));
  console.error('\nFallo el scrapeo:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
