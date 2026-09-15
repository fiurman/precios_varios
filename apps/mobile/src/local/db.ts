import * as SQLite from 'expo-sqlite';
import type { Grupo, Oferta } from '../api';

/** Copia local del catalogo.
 *
 *  La app busca y escanea contra esto, no contra la red: adentro de un
 *  hipermercado la señal se cae y una app de precios que necesita internet
 *  justo ahi no sirve para nada. La API queda solo para ponerse al dia. */

const BASE = 'precios.db';

let abierta: SQLite.SQLiteDatabase | null = null;

export async function db(): Promise<SQLite.SQLiteDatabase> {
  if (abierta) return abierta;
  const d = await SQLite.openDatabaseAsync(BASE);
  await d.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS meta (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS productos (
      id TEXT PRIMARY KEY,
      ean13 TEXT,
      nombre TEXT NOT NULL,
      -- Nombre sin tildes y en minusculas: es contra esto que se busca.
      buscable TEXT NOT NULL,
      marca TEXT,
      categoria_id TEXT,
      contenido_valor REAL,
      contenido_unidad TEXT,
      por_peso INTEGER NOT NULL DEFAULT 0,
      canonico_id TEXT,
      imagen TEXT,
      revision INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_prod_buscable ON productos(buscable);
    CREATE INDEX IF NOT EXISTS ix_prod_ean ON productos(ean13);
    CREATE INDEX IF NOT EXISTS ix_prod_canonico ON productos(canonico_id);

    CREATE TABLE IF NOT EXISTS precios (
      producto_id TEXT NOT NULL,
      cadena TEXT NOT NULL,
      precio_centavos INTEGER NOT NULL,
      promo_centavos INTEGER,
      revision INTEGER NOT NULL,
      PRIMARY KEY (producto_id, cadena)
    );

    CREATE TABLE IF NOT EXISTS tiendas (
      cadena TEXT PRIMARY KEY,
      nombre TEXT NOT NULL
    );
  `);
  // Migracion para telefonos que ya bajaron el catalogo antes de que la
  // columna existiera: sin esto el CREATE TABLE IF NOT EXISTS no hace nada y
  // los INSERT fallarian por columna desconocida.
  const columnas = await d.getAllAsync<{ name: string }>('PRAGMA table_info(productos)');
  if (!columnas.some((c) => c.name === 'imagen')) {
    await d.execAsync('ALTER TABLE productos ADD COLUMN imagen TEXT');
  }

  abierta = d;
  return d;
}

export async function revisionLocal(): Promise<number> {
  const d = await db();
  const fila = await d.getFirstAsync<{ valor: string }>(
    'SELECT valor FROM meta WHERE clave = ?', 'revision',
  );
  return fila ? Number(fila.valor) : 0;
}

/** Cuando se bajo el catalogo por ultima vez. */
export async function ultimaSincronizacion(): Promise<Date | null> {
  const d = await db();
  const fila = await d.getFirstAsync<{ valor: string }>(
    'SELECT valor FROM meta WHERE clave = ?', 'sincronizado',
  );
  return fila ? new Date(fila.valor) : null;
}

export async function hayCatalogo(): Promise<boolean> {
  const d = await db();
  const fila = await d.getFirstAsync<{ n: number }>('SELECT count(*) n FROM productos');
  return (fila?.n ?? 0) > 0;
}

export const sinTildes = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

interface FilaGrupo {
  canon: string;
  id: string;
  nombre: string;
  marca: string | null;
  ean13: string | null;
  contenido_valor: number | null;
  contenido_unidad: string | null;
  por_peso: number;
  imagen: string | null;
  cadena: string;
  tienda: string;
  precio_centavos: number;
  promo_centavos: number | null;
}

const aPagar = (f: FilaGrupo) => f.promo_centavos ?? f.precio_centavos;

/** Arma los grupos con la misma forma que devuelve la API, para que las
 *  pantallas no sepan de donde salieron los datos. */
function agrupar(filas: FilaGrupo[]): Grupo[] {
  const porCanon = new Map<string, FilaGrupo[]>();
  for (const f of filas) {
    const g = porCanon.get(f.canon);
    if (g) g.push(f);
    else porCanon.set(f.canon, [f]);
  }

  const grupos: Grupo[] = [];
  for (const delGrupo of porCanon.values()) {
    const ofertas: Oferta[] = delGrupo
      .map((f) => ({
        productId: f.id,
        cadena: f.cadena,
        tienda: f.tienda,
        nombre: f.nombre,
        ean13: f.ean13,
        precioCentavos: f.precio_centavos,
        promoCentavos: f.promo_centavos,
        url: null,
      }))
      .sort((a, b) => (a.promoCentavos ?? a.precioCentavos) - (b.promoCentavos ?? b.precioCentavos));

    const ref = delGrupo.find((f) => f.ean13) ?? delGrupo[0]!;
    const precios = delGrupo.map(aPagar);

    grupos.push({
      id: ref.canon,
      nombre: ref.nombre,
      marca: ref.marca,
      contenido: ref.contenido_valor && ref.contenido_unidad
        ? { valor: ref.contenido_valor, unidad: ref.contenido_unidad }
        : null,
      ean13: ref.ean13,
      // La URL viaja en el catalogo; la foto se baja al dibujarla.
      imagen: delGrupo.find((f) => f.imagen)?.imagen ?? null,
      porPeso: delGrupo.some((f) => f.por_peso === 1),
      ofertas,
      masBarato: ofertas[0]!,
      ahorroCentavos: Math.max(...precios) - Math.min(...precios),
    });
  }

  return grupos.sort((a, b) => b.ofertas.length - a.ofertas.length);
}

const SQL_GRUPOS = `
  SELECT coalesce(p.canonico_id, p.id) canon, p.id, p.nombre, p.marca, p.ean13,
         p.contenido_valor, p.contenido_unidad, p.por_peso, p.imagen,
         pr.cadena, coalesce(t.nombre, pr.cadena) tienda,
         pr.precio_centavos, pr.promo_centavos
    FROM productos p
    JOIN precios pr ON pr.producto_id = p.id
    LEFT JOIN tiendas t ON t.cadena = pr.cadena
   WHERE coalesce(p.canonico_id, p.id) IN (SELECT canon FROM elegidos)
`;

/** Reparte los resultados entre cadenas para que ninguna acapare la cabeza.
 *
 *  Es el mismo criterio que aplica la API: sin esto, los productos que estan en
 *  dos o tres cadenas —los unicos que sirven para comparar— llenan las primeras
 *  posiciones, o al reves quedan sepultados. Agrupamos por combinacion de
 *  cadenas y tomamos uno de cada grupo por vuelta. */
function intercalar(grupos: Grupo[], limite: number): Grupo[] {
  const cohortes = new Map<string, Grupo[]>();
  for (const g of grupos) {
    const clave = [...new Set(g.ofertas.map((o) => o.cadena))].sort().join('+');
    const cohorte = cohortes.get(clave);
    if (cohorte) cohorte.push(g);
    else cohortes.set(clave, [g]);
  }

  const listas = [...cohortes.values()];
  const salida: Grupo[] = [];
  for (let vuelta = 0; salida.length < limite; vuelta++) {
    let hubo = false;
    for (const lista of listas) {
      const g = lista[vuelta];
      if (!g) continue;
      hubo = true;
      salida.push(g);
      if (salida.length === limite) break;
    }
    if (!hubo) break;
  }
  return salida;
}

export async function buscarLocal(
  termino: string,
  opts: { cadena?: string; limite: number },
): Promise<Grupo[]> {
  const palabras = sinTildes(termino).split(/\s+/).filter((w) => w.length >= 2);
  if (palabras.length === 0) return [];

  const d = await db();
  // Todas las palabras, en cualquier orden: "yerba playadito" no aparece
  // literal en "yerba mate playadito 1kg" pero las dos palabras si estan.
  const condiciones = palabras.map(() => 'p.buscable LIKE ?').join(' AND ');
  const parametros = palabras.map((w) => `%${w}%`);

  // El orden importa tanto como el filtro: con un LIMIT sin criterio salian
  // veinte productos cualesquiera, y los que estan en varias cadenas —los
  // unicos que sirven para comparar— podian no aparecer nunca.
  //
  // SQLite no tiene trigramas, asi que la relevancia se aproxima con dos
  // señales: que lo buscado aparezca temprano en el nombre, y que el nombre
  // sea corto (los descriptivos largos suelen ser variantes).
  const filas = await d.getAllAsync<FilaGrupo>(
    `WITH elegidos AS (
       SELECT coalesce(p.canonico_id, p.id) canon,
              count(DISTINCT pr.cadena) cadenas,
              min(instr(p.buscable, ?)) posicion,
              min(length(p.nombre)) largo
         FROM productos p
         JOIN precios pr ON pr.producto_id = p.id
        WHERE ${condiciones}
        GROUP BY canon
        ORDER BY posicion ASC, cadenas DESC, largo ASC
        LIMIT ?
     )
     ${SQL_GRUPOS} ${opts.cadena ? 'AND pr.cadena = ?' : ''}`,
    palabras[0]!,
    ...parametros,
    // De mas, para poder intercalar despues sin quedarnos cortos.
    opts.limite * 4,
    ...(opts.cadena ? [opts.cadena] : []),
  );
  return intercalar(agrupar(filas), opts.limite);
}

/** Busca por el id del grupo canonico. Lo usa repetir una compra vieja: los
 *  items guardados tienen su id, pero los precios de entonces ya no sirven. */
export async function porIdLocal(id: string): Promise<Grupo | null> {
  const d = await db();
  const filas = await d.getAllAsync<FilaGrupo>(
    `WITH elegidos AS (
       SELECT coalesce(p.canonico_id, p.id) canon FROM productos p WHERE p.id = ? LIMIT 1
     )
     ${SQL_GRUPOS}`,
    id,
  );
  return agrupar(filas)[0] ?? null;
}

export async function porEanLocal(ean13: string): Promise<Grupo | null> {
  const d = await db();
  const filas = await d.getAllAsync<FilaGrupo>(
    `WITH elegidos AS (
       SELECT coalesce(p.canonico_id, p.id) canon FROM productos p WHERE p.ean13 = ? LIMIT 1
     )
     ${SQL_GRUPOS}`,
    ean13,
  );
  return agrupar(filas)[0] ?? null;
}

export async function cadenasLocales(): Promise<{ cadena: string; nombre: string; productos: string }[]> {
  const d = await db();
  return d.getAllAsync(
    `SELECT t.cadena, t.nombre, count(pr.producto_id) productos
       FROM tiendas t LEFT JOIN precios pr ON pr.cadena = t.cadena
      GROUP BY t.cadena, t.nombre ORDER BY productos DESC`,
  );
}
