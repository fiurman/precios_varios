/** Cliente de la API. En el navegador de la VM alcanza con localhost; cuando
 *  la app corra en un celular hay que apuntarla a la IP de la maquina con
 *  EXPO_PUBLIC_API_URL, porque para el telefono "localhost" es el telefono. */
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface Oferta {
  productId: string;
  cadena: string;
  tienda: string;
  nombre: string;
  ean13: string | null;
  precioCentavos: number;
  promoCentavos: number | null;
  url: string | null;
}

export interface Grupo {
  id: string;
  nombre: string;
  marca: string | null;
  contenido: { valor: number; unidad: string } | null;
  ean13: string | null;
  imagen: string | null;
  porPeso: boolean;
  ofertas: Oferta[];
  masBarato: Oferta;
  ahorroCentavos: number;
}

export interface Cadena {
  cadena: string;
  nombre: string;
  productos: string;
}

async function pedir<T>(ruta: string): Promise<T> {
  const res = await fetch(`${BASE}${ruta}`);
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(cuerpo.error ?? `La API respondio ${res.status}`);
  }
  return (await res.json()) as T;
}

export function buscar(q: string, cadena?: string): Promise<{ resultados: Grupo[] }> {
  const params = new URLSearchParams({ q });
  if (cadena) params.set('cadena', cadena);
  return pedir(`/buscar?${params}`);
}

export const porEan = (ean13: string): Promise<Grupo> => pedir(`/ean/${ean13}`);
export const listarCadenas = (): Promise<{ cadenas: Cadena[] }> => pedir('/cadenas');

/** El precio que se paga hoy: la promo si hay, si no el de lista. */
export const aPagar = (o: Oferta): number => o.promoCentavos ?? o.precioCentavos;

const formato = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
export const plata = (centavos: number): string => `$${formato.format(centavos / 100)}`;
