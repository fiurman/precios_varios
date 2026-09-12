import type { ChainAdapter, SourceProduct } from './types.js';
import { normalizeUnit, parsePriceToCents, toCoopeUrlSlug } from '../normalize.js';

const API = 'https://api.lacoopeencasa.coop/api';
const UA = 'precios-varios/0.1 (proyecto personal de comparacion de precios)';

/** Pausa entre pedidos. Somos invitados en su servidor: de a uno y sin apuro. */
const DELAY_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} respondio HTTP ${res.status}`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.estado !== 1) throw new Error(`${path}: ${body.mensaje}`);
  return body.datos;
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

export class CooperativaAdapter implements ChainAdapter {
  readonly chain = 'cooperativa_obrera';
  readonly displayName = 'La Coope en Casa';

  /** TEMPORAL: el endpoint que lista una categoria entera (articulos/pagina)
   *  es POST y pide un tipo_seleccion que no pudimos deducir del bundle
   *  minificado. Hasta capturarlo con Playwright, sembramos con busquedas.
   *  Cuando se resuelva, cambia SOLO este metodo: nada mas del pipeline. */
  private readonly seedTerms = ['yerba', 'leche', 'fideos', 'arroz', 'aceite'];

  async *fetchProducts({ limit }: { limit: number }): AsyncGenerator<SourceProduct> {
    const tree = await apiGet<ApiCategoria[]>('categorias/arbol');
    const categories = flattenCategories(tree);
    await sleep(DELAY_MS);

    const vistos = new Set<string>();
    let emitidos = 0;

    for (const term of this.seedTerms) {
      if (emitidos >= limit) return;

      const articulos = await apiGet<ApiArticulo[]>(
        `buscar/articulos?q=${encodeURIComponent(term)}&offset=0&pedido=0`,
      );
      await sleep(DELAY_MS);

      for (const a of articulos) {
        if (emitidos >= limit) return;
        if (vistos.has(a.cod_interno)) continue; // un producto puede salir en 2 busquedas
        vistos.add(a.cod_interno);

        const precio = parsePriceToCents(a.precio);
        if (precio === null) continue; // sin precio no nos sirve

        const idCat = a.id_categoria ? Number(a.id_categoria) : null;

        yield {
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
          promoCents: parsePriceToCents(a.precio_promo),
          promoLabel: a.descripcion_promo ?? null,
          categoryPath: (idCat !== null ? categories.get(idCat) : undefined) ?? [],
          imageUrl: a.imagen,
          url: `https://www.lacoopeencasa.coop/producto/${toCoopeUrlSlug(a.descripcion)}/${a.cod_interno}`,
          raw: a,
        };
        emitidos++;
      }
    }
  }
}
