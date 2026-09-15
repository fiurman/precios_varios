import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QueryResultRow } from 'pg';
import { pool } from '@precios/db';

/** Genera el catalogo que baja el celular, como archivos estaticos.
 *
 *  No hay servidor en produccion: el telefono busca y escanea contra su copia
 *  local, y lo unico que necesita de afuera es ponerse al dia. Eso es un
 *  archivo, no un servicio. Se sube a un bucket o CDN y listo.
 *
 *  Genera dos cosas:
 *    manifiesto.json     que revision hay y que archivos bajar
 *    completo-<rev>.json.gz   el catalogo entero, para instalar de cero
 *
 *  Los incrementales salen del mismo endpoint que ya usa la API: cualquier
 *  cliente que guarde su ultima revision pide solo lo que cambio. */

// Sin argumento, la raiz del repo. Anclado al modulo y no al cwd porque npm
// corre los scripts de workspace parado en apps/scraper, y un 'snapshot'
// relativo terminaria enterrado ahi adentro.
const SALIDA = process.argv[2]
  ? path.resolve(process.argv[2])
  : fileURLToPath(new URL('../../../snapshot/', import.meta.url));

interface Conteos { [tabla: string]: number }

async function filas<T extends QueryResultRow>(sql: string): Promise<T[]> {
  const { rows } = await pool.query<T>(sql);
  return rows;
}

async function escribirGz(destino: string, datos: unknown): Promise<number> {
  await pipeline(
    Readable.from([JSON.stringify(datos)]),
    createGzip({ level: 9 }),
    createWriteStream(destino),
  );
  return (await stat(destino)).size;
}

const kb = (b: number) => `${(b / 1024).toFixed(0)} KB`;

async function main(): Promise<void> {
  await mkdir(SALIDA, { recursive: true });

  const [fila] = await filas<{ rev: string }>(
    'select last_value rev from global_revision_seq',
  );
  const revision = Number(fila!.rev);

  // Solo lo que viaja en modo Light: texto y numeros. Nada de imagenes ni
  // embeddings, que viven en tablas aparte y se bajan aparte.
  const tiendas = await filas(
    `select id, slug, chain cadena, name nombre from stores where is_active`,
  );
  const categorias = await filas(
    `select id, slug, name nombre, parent_id "padreId" from categories`,
  );
  // La URL de la miniatura si viaja, aunque la foto no: son 112 caracteres que
  // comprimen muy bien —comparten todo el prefijo— y sin ellas el celular no
  // puede mostrar ninguna imagen ni teniendo wifi. Lo pesado sigue afuera: los
  // bytes de la foto se bajan solo cuando hay que dibujarla.
  const productos = await filas(
    `select p.id, p.ean13, p.name nombre, p.brand marca, p.category_id "categoriaId",
            p.content_value "contenidoValor", p.content_unit "contenidoUnidad",
            p.is_weighted "porPeso", p.canonical_product_id "canonicoId",
            img.url imagen, p.revision
       from products p
       left join lateral (
         select m.url from product_media m where m.product_id = p.id limit 1
       ) img on true
      where p.deleted_at is null`,
  );
  const precios = await filas(
    `select cp.product_id "productoId", st.chain cadena,
            cp.price_cents "precioCentavos", cp.promo_cents "promoCentavos", cp.revision
       from current_prices cp join stores st on st.id = cp.store_id`,
  );

  const conteos: Conteos = {
    tiendas: tiendas.length,
    categorias: categorias.length,
    productos: productos.length,
    precios: precios.length,
  };

  const archivo = `completo-${revision}.json.gz`;
  const bytes = await escribirGz(path.join(SALIDA, archivo), {
    revision,
    generado: new Date().toISOString(),
    tiendas,
    categorias,
    productos,
    precios,
  });

  // El manifiesto es lo primero que pide el celular: con una descarga de un
  // par de KB ya sabe si esta al dia y, si no, que bajar.
  await writeFile(
    path.join(SALIDA, 'manifiesto.json'),
    JSON.stringify({ revision, generado: new Date().toISOString(), completo: archivo, bytes, conteos }, null, 2),
  );

  console.log(`Revision ${revision}`);
  for (const [k, v] of Object.entries(conteos)) console.log(`  ${k.padEnd(12)} ${v}`);
  console.log(`\n${SALIDA}/${archivo}  ${kb(bytes)}`);
  console.log(`${SALIDA}/manifiesto.json`);
}

try {
  await main();
} finally {
  await pool.end();
}
