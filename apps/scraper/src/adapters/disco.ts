import type { ChainAdapter, SourceProduct } from './types.js';
import {
  isValidEan13, normalizeUnit, parseContentFromName, parsePriceToCents,
} from '../normalize.js';

const API = 'https://www.disco.com.ar/api/catalog_system/pub';
const UA = 'precios-varios/0.1 (proyecto personal de comparacion de precios)';

const DELAY_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** VTEX no entrega mas de 50 articulos por pedido y rechaza _from > 2500:
 *  quedan 2550 alcanzables por consulta, haga lo que haga la paginacion. */
const PAGE_SIZE = 50;
const MAX_OFFSET = 2500;
const ALCANCE = MAX_OFFSET + PAGE_SIZE;

/** Techo del rango de precios que usamos para partir categorias grandes.
 *  Nada en el catalogo se acerca, es solo el extremo abierto del intervalo. */
const PRECIO_TECHO = 10_000_000;

const REINTENTOS = 3;

interface VtexCategoria {
  id: number;
  name: string;
  children: VtexCategoria[] | null;
}

interface VtexOferta {
  Price: number | null;
  PriceWithoutDiscount: number | null;
  IsAvailable: boolean;
}

interface VtexItem {
  itemId: string;
  nameComplete?: string | null;
  name?: string | null;
  ean?: string | null;
  measurementUnit?: string | null;
  unitMultiplier?: number | null;
  images?: { imageUrl: string }[] | null;
  sellers?: { commertialOffer: VtexOferta }[] | null;
}

interface VtexProducto {
  productId: string;
  productName: string;
  brand?: string | null;
  link?: string | null;
  linkText?: string | null;
  categories?: string[] | null;
  items?: VtexItem[] | null;
}

/** VTEX devuelve un 500 cada tanto sin motivo: el mismo pedido repetido anda.
 *  Sin reintento, un hipo suelto se lleva puesto el catalogo entero. */
async function apiGet<T>(path: string): Promise<T> {
  let ultimo: unknown;

  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`${path} respondio HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      ultimo = err;
      if (intento < REINTENTOS) await sleep(DELAY_MS * 2 ** intento);
    }
  }
  throw ultimo;
}

interface Pagina {
  items: VtexProducto[];
  /** Total de la consulta, que VTEX manda en el header `resources: 0-49/2969`. */
  total: number;
}

async function pedirPagina(query: string, desde: number): Promise<Pagina> {
  const path = `products/search?${query}&_from=${desde}&_to=${desde + PAGE_SIZE - 1}`;
  let ultimo: unknown;

  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      const res = await fetch(`${API}/${path}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`${path} respondio HTTP ${res.status}`);
      const items = (await res.json()) as VtexProducto[];
      const total = Number(res.headers.get('resources')?.split('/')[1] ?? items.length);
      return { items, total: Number.isFinite(total) ? total : items.length };
    } catch (err) {
      ultimo = err;
      if (intento < REINTENTOS) await sleep(DELAY_MS * 2 ** intento);
    }
  }
  throw ultimo;
}

/** Las hojas del arbol, con el camino de ids que espera el filtro fq=C:/a/b/c/ */
function* hojas(
  nodes: VtexCategoria[],
  prefijo: number[] = [],
): Generator<{ ids: number[]; nombre: string }> {
  for (const n of nodes) {
    const ids = [...prefijo, n.id];
    const hijos = n.children ?? [];
    if (hijos.length === 0) yield { ids, nombre: n.name };
    else yield* hojas(hijos, ids);
  }
}

/** De ["/Almacen/Desayuno/Azucar/", "/Almacen/Desayuno/", "/Almacen/"] al
 *  camino mas profundo, que es el que describe mejor al producto. */
function categoryPath(categorias: string[] | null | undefined): string[] {
  const caminos = (categorias ?? []).map((c) => c.split('/').filter(Boolean));
  caminos.sort((a, b) => b.length - a.length);
  return caminos[0] ?? [];
}

function toSourceProduct(p: VtexProducto, it: VtexItem): SourceProduct | null {
  const oferta = it.sellers?.[0]?.commertialOffer;
  if (!oferta?.IsAvailable) return null; // sin stock no hay precio que registrar

  // En VTEX `Price` es lo que se paga hoy. Cuando hay descuento lo guardamos
  // como promo y dejamos el de lista en priceCents, igual que en La Coope.
  const pagado = parsePriceToCents(oferta.Price);
  if (pagado === null) return null;
  const lista = parsePriceToCents(oferta.PriceWithoutDiscount);
  const hayDescuento = lista !== null && lista > pagado;

  const nombre = it.nameComplete || it.name || p.productName;

  // Los productos por peso traen la medida en el item; el resto hay que
  // sacarla del nombre, porque VTEX no la publica en un campo propio.
  const unidadMedida = normalizeUnit(it.measurementUnit);
  const porPeso = (it.measurementUnit ?? 'un') !== 'un';
  const contenido =
    parseContentFromName(nombre) ??
    (porPeso && unidadMedida && it.unitMultiplier
      ? { value: it.unitMultiplier, unit: unidadMedida }
      : null);

  return {
    externalId: it.itemId,
    ean13: it.ean && isValidEan13(it.ean) ? it.ean : null,
    name: nombre,
    brand: p.brand ?? null,
    contentValue: contenido?.value ?? null,
    contentUnit: contenido?.unit ?? null,
    isWeighted: porPeso,
    priceCents: hayDescuento ? lista : pagado,
    promoCents: hayDescuento ? pagado : null,
    promoLabel: null,
    categoryPath: categoryPath(p.categories),
    imageUrl: it.images?.[0]?.imageUrl ?? null,
    url: p.link ?? (p.linkText ? `https://www.disco.com.ar/${p.linkText}/p` : null),
    raw: { producto: p.productId, item: it },
  };
}

interface Recorrido {
  vistos: Set<string>;
  emitidos: number;
  limit: number;
}

export class DiscoAdapter implements ChainAdapter {
  readonly chain = 'disco';
  readonly displayName = 'Disco';

  async *fetchProducts({ limit }: { limit: number }): AsyncGenerator<SourceProduct> {
    const arbol = await apiGet<VtexCategoria[]>('category/tree/5');
    await sleep(DELAY_MS);

    const ctx: Recorrido = { vistos: new Set<string>(), emitidos: 0, limit };

    for (const hoja of hojas(arbol)) {
      if (ctx.emitidos >= ctx.limit) return;

      const query = `fq=C:/${hoja.ids.join('/')}/`;
      const primera = await pedirPagina(query, 0);
      await sleep(DELAY_MS);

      // Casi todas las hojas entran enteras; solo las gigantes (galletitas
      // dulces, vinos tintos) hay que partirlas para pasar el tope de VTEX.
      if (primera.total > ALCANCE) {
        yield* this.recorrerPorPrecio(hoja, query, 0, PRECIO_TECHO, ctx);
      } else {
        yield* this.paginar(query, primera, ctx);
      }
    }
  }

  /** Parte el rango de precios al medio hasta que cada pedazo entre en el tope.
   *  Los extremos se pisan (P:[0 TO 1000] y P:[1000 TO 2000] comparten el 1000),
   *  pero el set de vistos ya deduplica por SKU. */
  private async *recorrerPorPrecio(
    hoja: { ids: number[]; nombre: string },
    base: string,
    min: number,
    max: number,
    ctx: Recorrido,
  ): AsyncGenerator<SourceProduct> {
    if (ctx.emitidos >= ctx.limit) return;

    const query = `${base}&fq=P:%5B${min}%20TO%20${max}%5D`;
    const primera = await pedirPagina(query, 0);
    await sleep(DELAY_MS);

    if (primera.total > ALCANCE) {
      const medio = Math.floor((min + max) / 2);
      if (medio > min) {
        yield* this.recorrerPorPrecio(hoja, base, min, medio, ctx);
        yield* this.recorrerPorPrecio(hoja, base, medio, max, ctx);
        return;
      }
      // Mas de 2550 articulos al mismo precio exacto: no hay por donde partir.
      console.warn(
        `  ! "${hoja.nombre}" tiene ${primera.total} articulos a $${min}: entran ${ALCANCE}.`,
      );
    }

    yield* this.paginar(query, primera, ctx);
  }

  private async *paginar(
    query: string,
    primera: Pagina,
    ctx: Recorrido,
  ): AsyncGenerator<SourceProduct> {
    let desde = 0;
    let lote = primera.items;

    while (lote.length > 0) {
      for (const p of lote) {
        // Un producto puede tener varios SKU (500ml y 1L): cada uno es una
        // fila distinta, con su propio codigo de barras y su propio precio.
        for (const it of p.items ?? []) {
          if (ctx.emitidos >= ctx.limit) return;
          if (ctx.vistos.has(it.itemId)) continue; // aparece en varias categorias
          ctx.vistos.add(it.itemId);

          const producto = toSourceProduct(p, it);
          if (producto === null) continue;

          yield producto;
          ctx.emitidos++;
        }
      }

      if (lote.length < PAGE_SIZE) return;
      desde += PAGE_SIZE;
      if (desde > MAX_OFFSET) return;

      lote = (await pedirPagina(query, desde)).items;
      await sleep(DELAY_MS);
    }
  }
}
