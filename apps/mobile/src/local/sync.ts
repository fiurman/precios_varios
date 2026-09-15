import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, revisionLocal, sinTildes } from './db';

/** Trae el catalogo desde los archivos estaticos y lo guarda local.
 *
 *  No hay servidor: el scraper publica un manifiesto y un .gz en un CDN. El
 *  telefono pide primero el manifiesto —medio KB— y si ya esta al dia, ahi
 *  termina. Si no, baja el catalogo completo. */

const POR_DEFECTO = process.env.EXPO_PUBLIC_SNAPSHOT_URL ?? 'http://localhost:3000/snapshot';
const CLAVE_SERVIDOR = 'servidor.snapshot';

/** De donde se baja el catalogo.
 *
 *  Configurable y no fijo en el build: la direccion por defecto queda grabada
 *  al compilar, pero un router que reparte IP por DHCP te la cambia cuando se
 *  le da la gana. Sin esto, ese dia la app queda rota hasta recompilarla. */
export async function servidor(): Promise<string> {
  const guardado = await AsyncStorage.getItem(CLAVE_SERVIDOR).catch(() => null);
  return (guardado || POR_DEFECTO).replace(/\/+$/, '');
}

export async function guardarServidor(url: string): Promise<void> {
  await AsyncStorage.setItem(CLAVE_SERVIDOR, url.trim()).catch(() => {});
}

interface Manifiesto {
  revision: number;
  generado: string;
  completo: string;
  bytes: number;
  conteos: Record<string, number>;
}

interface Snapshot {
  revision: number;
  tiendas: { cadena: string; nombre: string }[];
  productos: {
    id: string; ean13: string | null; nombre: string; marca: string | null;
    categoriaId: string | null; contenidoValor: string | number | null;
    contenidoUnidad: string | null; porPeso: boolean;
    canonicoId: string | null; imagen: string | null; revision: number | string;
  }[];
  precios: {
    productoId: string; cadena: string; precioCentavos: number;
    promoCentavos: number | null; revision: number | string;
  }[];
}

export interface Progreso {
  etapa: 'consultando' | 'descargando' | 'guardando' | 'listo' | 'al-dia';
  revision?: number;
  productos?: number;
}

/** `forzar` vuelve a bajar aunque la revision sea la misma.
 *
 *  Hace falta porque la revision cuenta cambios de datos, no de formato: si el
 *  snapshot se regenera agregando un campo nuevo, el numero no se mueve y el
 *  telefono se quedaria con la version vieja para siempre. Cuando el usuario
 *  toca "Actualizar" a proposito, quiere bajar. */
export async function sincronizar(
  avisar: (p: Progreso) => void = () => {},
  forzar = false,
): Promise<Progreso> {
  avisar({ etapa: 'consultando' });

  const base = await servidor();
  const res = await fetch(`${base}/manifiesto.json`);
  if (!res.ok) throw new Error(`No pudimos leer el manifiesto (${res.status})`);
  const manifiesto = (await res.json()) as Manifiesto;

  const local = await revisionLocal();
  if (!forzar && local >= manifiesto.revision) {
    const listo: Progreso = { etapa: 'al-dia', revision: local };
    avisar(listo);
    return listo;
  }

  avisar({ etapa: 'descargando', revision: manifiesto.revision });
  const bajada = await fetch(`${base}/${manifiesto.completo}`);
  if (!bajada.ok) throw new Error(`No pudimos bajar el catalogo (${bajada.status})`);
  // fetch descomprime el gzip solo: llega JSON.
  const snapshot = (await bajada.json()) as Snapshot;

  avisar({ etapa: 'guardando', revision: snapshot.revision, productos: snapshot.productos.length });
  await guardar(snapshot);

  const listo: Progreso = {
    etapa: 'listo',
    revision: snapshot.revision,
    productos: snapshot.productos.length,
  };
  avisar(listo);
  return listo;
}

async function guardar(s: Snapshot): Promise<void> {
  const d = await db();

  // Todo en una transaccion: si se corta la descarga a medio guardar, es
  // preferible quedarse con el catalogo viejo entero que con uno mitad y mitad.
  await d.withTransactionAsync(async () => {
    await d.execAsync('DELETE FROM productos; DELETE FROM precios; DELETE FROM tiendas;');

    for (const t of s.tiendas) {
      await d.runAsync('INSERT INTO tiendas (cadena, nombre) VALUES (?, ?)', t.cadena, t.nombre);
    }

    const insProd = await d.prepareAsync(
      `INSERT INTO productos
        (id, ean13, nombre, buscable, marca, categoria_id, contenido_valor,
         contenido_unidad, por_peso, canonico_id, imagen, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const p of s.productos) {
        await insProd.executeAsync(
          p.id, p.ean13, p.nombre, sinTildes(p.nombre), p.marca, p.categoriaId,
          p.contenidoValor === null ? null : Number(p.contenidoValor),
          p.contenidoUnidad, p.porPeso ? 1 : 0, p.canonicoId, p.imagen, Number(p.revision),
        );
      }
    } finally {
      await insProd.finalizeAsync();
    }

    const insPrecio = await d.prepareAsync(
      `INSERT INTO precios (producto_id, cadena, precio_centavos, promo_centavos, revision)
       VALUES (?, ?, ?, ?, ?)`,
    );
    try {
      for (const p of s.precios) {
        await insPrecio.executeAsync(
          p.productoId, p.cadena, p.precioCentavos, p.promoCentavos, Number(p.revision),
        );
      }
    } finally {
      await insPrecio.finalizeAsync();
    }

    await d.runAsync(
      'INSERT OR REPLACE INTO meta (clave, valor) VALUES (?, ?)',
      'revision', String(s.revision),
    );
    await d.runAsync(
      'INSERT OR REPLACE INTO meta (clave, valor) VALUES (?, ?)',
      'sincronizado', new Date().toISOString(),
    );
  });
}
