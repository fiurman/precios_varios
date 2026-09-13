import { pool } from '@precios/db';
import type { ChainAdapter } from './adapters/types.js';
import { CooperativaAdapter } from './adapters/cooperativa.js';
import { DiscoAdapter } from './adapters/disco.js';
import { CarrefourAdapter } from './adapters/carrefour.js';
import { CoopeHogarAdapter } from './adapters/coopehogar.js';
import { ensureStore, startRun, finishRun, persistProduct } from './persist.js';

// npm run scrape -- [cadena] [limite] [raices]
//   npm run scrape -- 20                        los primeros 20 de La Coope
//   npm run scrape -- disco todo                el catalogo entero de Disco
//   npm run scrape -- carrefour todo 161,222    solo esas dos raices
const ADAPTERS: Record<string, (raices?: number[]) => ChainAdapter> = {
  coope: () => new CooperativaAdapter(),
  disco: () => new DiscoAdapter(),
  carrefour: (raices) => new CarrefourAdapter(raices),
  hogar: () => new CoopeHogarAdapter(),
};

const args = process.argv.slice(2);
const clave = args[0] !== undefined && args[0] in ADAPTERS ? args.shift()! : 'coope';
const pedido = args[0] ?? '20';
const limit =
  pedido === 'todo' || pedido === 'all' ? Number.POSITIVE_INFINITY : Number(pedido);

// Lista de ids separada por comas: parte el catalogo en corridas mas cortas.
const raices = args[1]
  ? args[1].split(',').map((n) => Number(n.trim())).filter(Number.isFinite)
  : undefined;

const adapter = ADAPTERS[clave]!(raices);

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
    const ean = sp.ean13 ? ` [${sp.ean13}]` : '';
    console.log(`${String(total).padStart(4)}. ${created ? '+' : '·'} $${precio}${ean}  ${sp.name.slice(0, 46)}`);
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
