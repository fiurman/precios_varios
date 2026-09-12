/** Helpers genericos de normalizacion, compartidos por todos los adapters. */

/** Minusculas y sin tildes: lo que se indexa para la busqueda trigram. */
export function toNormalizedName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** "4790.00" -> 479000. Enteros siempre: los float con plata mienten. */
export function parsePriceToCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Unifica las unidades que usa cada cadena a un juego chico y estable. */
const UNIT_MAP: Record<string, string> = {
  gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', g: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', cc: 'ml',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  un: 'un', uni: 'un', unid: 'un', unidad: 'un', unidades: 'un',
};

export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return UNIT_MAP[toNormalizedName(raw)] ?? null;
}

/** Valida el digito verificador de un EAN-13. La Coope no publica codigos de
 *  barras, pero otras cadenas si: mejor rechazar basura en la puerta de entrada
 *  que descubrir codigos invalidos cuando la camara no matchea nada. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number) as number[];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i]! * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/** Convierte UN nombre de categoria en UN segmento de slug.
 *  Clave: La Coope usa "/" dentro de los nombres ("Yogures/Salud Activa",
 *  "Azucar/Edulcorante"). Si no lo sacamos, el slug finge una jerarquia que no
 *  existe y puede colisionar con una categoria hija real del mismo nombre. */
export function toSlugSegment(name: string): string {
  return toNormalizedName(name)
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug tal como lo arma La Coope para sus URLs: minusculas y espacios por
 *  guiones, CONSERVANDO acentos y ñ. Verificado contra su sitemap, que publica
 *  /listado/marca/cañuelas/4052/ y /listado/marca/verónica/4041/.
 *
 *  Ojo: no confundir con toSlugSegment(), que si saca los acentos porque sirve
 *  para claves internas nuestras. Aca la forma la dicta el sitio, no nosotros. */
export function toCoopeUrlSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[/\\]+/g, '-')   // una barra partiria el path de la URL
    .replace(/\s+/g, '-')
    // Un % suelto es una secuencia de escape invalida: el sitio responde 400.
    // Pasa seguido ("0% lactosa", "1% sachet"). El % va primero, si no
    // reencodearia los % que introducen las lineas siguientes.
    .replace(/%/g, '%25')
    .replace(/\?/g, '%3F')
    .replace(/#/g, '%23');
}
