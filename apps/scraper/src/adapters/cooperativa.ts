import type { ChainAdapter, SourceProduct } from './types.js';
import { normalizeUnit, parsePriceToCents, toCoopeUrlSlug } from '../normalize.js';

const API = 'https://api.lacoopeencasa.coop/api';
const UA = 'precios-varios/0.1 (proyecto personal de comparacion de precios)';

/** Pausa entre pedidos. Somos invitados en su servidor: de a uno y sin apuro. */
const DELAY_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** articulos/pagina devuelve 32 articulos cuando `modificado` es true (la carga
 *  inicial del listado) y 8 cuando es false (el scroll infinito). Siempre 32:
 *  mismo catalogo con la cuarta parte de los pedidos. */
const PAGE_SIZE = 32;

/** Tope de seguridad: ninguna hoja del arbol se acerca siquiera a esto, pero
 *  si el backend deja de devolver la pagina vacia no queremos girar de gratis. */
const MAX_PAGINAS = 40;

/** Criterios de orden del listado. En varias hojas la paginacion muere despues
 *  de la primera pagina, pero cada orden devuelve una ventana distinta de los
 *  mismos articulos: barriendo los seis se recupera la categoria completa.
 *  El 1 va primero porque es el que usa el sitio. */
const ORDENES = [1, 0, 2, 3, 4, 5];

interface ApiEnvelope<T> {
  estado: number;
  mensaje: string;
  datos: T;
}

interface ApiArticulo {
  cod_interno: string;
  descripcion: string;
  precio: string;
  precio_promo: string | null;
  descripcion_promo?: string | null;
  gramaje: string | null;
  unimed_desc: string | null;
  marca_desc: string | null;
  id_categoria: string | null;
  imagen: string | null;
  tipo_articulo: string;
}

interface ApiCategoria {
  id_categoria: number;
  descripcion: string;
  hijos: ApiCategoria[];
}

interface ApiPagina {
  cantidad_articulos: number;
  articulos: ApiArticulo[] | null;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} respondio HTTP ${res.status}`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.estado !== 1) throw new Error(`${path}: ${body.mensaje}`);
  return body.datos;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} respondio HTTP ${res.status}`);
  const parsed = (await res.json()) as ApiEnvelope<T>;
  if (parsed.estado !== 1) throw new Error(`${path}: ${parsed.mensaje}`);
  return parsed.datos;
}

/** Cuerpo que espera articulos/pagina para listar una categoria completa.
 *  Todos los campos son obligatorios aunque no filtremos por ninguno: el
 *  backend valida la forma entera, no campo por campo. */
function filtrosDeCategoria() {
  return {
    preciomenor: -1,
    preciomayor: -1,
    marca: [],
    categoria: [],
    tipo_seleccion: 'categoria',
    filtros_gramaje: [],
    filtros_descuento: [],
    cant_articulos: PAGE_SIZE,
    ofertas: false,
    // Sin esto la respuesta trae las facetas (marcas, gramajes, precios) pero
    // `articulos` viene vacio. Es el flag que distingue "primera carga".
    modificado: true,
    primer_filtro: '',
  };
}

/** Aplana el arbol de categorias a id -> ['Almacen','Desayuno','Yerba'] */
function flattenCategories(nodes: ApiCategoria[], prefix: string[] = []): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const node of nodes) {
    const path = [...prefix, node.descripcion];
    out.set(node.id_categoria, path);
    for (const [k, v] of flattenCategories(node.hijos ?? [], path)) out.set(k, v);
  }
  return out;
}

function toSourceProduct(a: ApiArticulo, categories: Map<number, string[]>): SourceProduct | null {
  const precio = parsePriceToCents(a.precio);
  if (precio === null) return null; // sin precio no nos sirve

  // El listado repite el precio en precio_promo aunque no haya promo vigente:
  // solo la tomamos cuando de verdad es mas barata y viene descripta.
  const promo = parsePriceToCents(a.precio_promo);
  const promoCents = promo !== null && promo < precio ? promo : null;
  const promoLabel = promoCents !== null ? (a.descripcion_promo || null) : null;

  const idCat = a.id_categoria ? Number(a.id_categoria) : null;

  return {
    externalId: a.cod_interno,
    // La Coope no publica codigo de barras. Otras cadenas si lo haran.
    ean13: null,
    name: a.descripcion,
    brand: a.marca_desc,
    contentValue: a.gramaje ? Number.parseFloat(a.gramaje) : null,
    contentUnit: normalizeUnit(a.unimed_desc),
    // tipo_articulo '2' = se vende por peso variable (fiambreria, carniceria)
    isWeighted: a.tipo_articulo === '2',
    priceCents: precio,
    promoCents,
    promoLabel,
    categoryPath: (idCat !== null ? categories.get(idCat) : undefined) ?? [],
    imageUrl: a.imagen,
    url: `https://www.lacoopeencasa.coop/producto/${toCoopeUrlSlug(a.descripcion)}/${a.cod_interno}`,
    raw: a,
  };
}

interface Recorrido {
  categories: Map<number, string[]>;
  vistos: Set<string>;
  emitidos: number;
  limit: number;
}

export class CooperativaAdapter implements ChainAdapter {
  readonly chain = 'cooperativa_obrera';
  readonly displayName = 'La Coope en Casa';

  async *fetchProducts({ limit }: { limit: number }): AsyncGenerator<SourceProduct> {
    const tree = await apiGet<ApiCategoria[]>('categorias/arbol');
    await sleep(DELAY_MS);

    const ctx: Recorrido = {
      categories: flattenCategories(tree),
      vistos: new Set<string>(),
      emitidos: 0,
      limit,
    };

    for (const raiz of tree) {
      if (ctx.emitidos >= ctx.limit) return;
      yield* this.recorrerCategoria(raiz, ctx);
    }
  }

  private async pedirPagina(
    idCategoria: number,
    pagina: number,
    orden: number,
  ): Promise<ApiPagina> {
    const datos = await apiPost<ApiPagina>('articulos/pagina', {
      id_busqueda: idCategoria,
      pagina,
      orden,
      filtros: filtrosDeCategoria(),
    });
    await sleep(DELAY_MS);
    return datos;
  }

  /** Solo pedimos las hojas del arbol.
   *
   *  Una categoria con hijas informa en cantidad_articulos el total de su rama,
   *  pero su listado devuelve una sola pagina recortada: "Papeles" declara 40 y
   *  entrega 32, y de las 9 servilletas de su hija aparece una. En las hojas, en
   *  cambio, el total declarado es fiable y sirve para saber cuando terminamos. */
  private async *recorrerCategoria(
    cat: ApiCategoria,
    ctx: Recorrido,
  ): AsyncGenerator<SourceProduct> {
    const hijos = cat.hijos ?? [];
    if (hijos.length > 0) {
      for (const hijo of hijos) {
        if (ctx.emitidos >= ctx.limit) return;
        yield* this.recorrerCategoria(hijo, ctx);
      }
      return;
    }

    const enLaHoja = new Set<string>();
    let declarados = Number.POSITIVE_INFINITY;

    // Un orden alcanza para la mayoria de las hojas; el barrido completo solo
    // se paga en las que cortan la paginacion temprano.
    for (const orden of ORDENES) {
      let pagina = 0;

      while (pagina < MAX_PAGINAS) {
        const datos = await this.pedirPagina(cat.id_categoria, pagina, orden);
        declarados = datos.cantidad_articulos;
        const lote = datos.articulos ?? [];
        if (lote.length === 0) break;
        pagina++;

        for (const a of lote) {
          enLaHoja.add(a.cod_interno);
          if (ctx.emitidos >= ctx.limit) return;
          if (ctx.vistos.has(a.cod_interno)) continue; // cae en varias ramas
          ctx.vistos.add(a.cod_interno);

          const producto = toSourceProduct(a, ctx.categories);
          if (producto === null) continue;

          yield producto;
          ctx.emitidos++;
        }
      }

      if (enLaHoja.size >= declarados) break;
    }

    if (enLaHoja.size < declarados) {
      console.warn(`  ! "${cat.descripcion}": declara ${declarados} y listo ${enLaHoja.size}.`);
    }
  }
}
