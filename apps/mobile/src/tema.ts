/** El color con el que cada cadena se identifica, sacado de sus propios logos.
 *
 *  Diferencia de un vistazo sin usar marcas ajenas: reconoces el rojo de Disco
 *  antes de leer la palabra. Los tonos van un poco mas oscuros que el original
 *  para que el texto blanco encima se lea. */
export const colorCadena: Record<string, string> = {
  cooperativa_obrera: '#004090',
  carrefour: '#00539b',
  disco: '#c40000',
};

/** Para cuando no hay una cadena elegida. */
export const NEUTRO = '#11181c';

export const colorDe = (cadena: string | null | undefined): string =>
  (cadena && colorCadena[cadena]) || NEUTRO;

export const tema = {
  fondo: '#f6f7f9',
  tarjeta: '#ffffff',
  borde: '#e3e6ea',
  texto: '#11181c',
  suave: '#687076',
  acento: '#0b7285',
  barato: '#0f7b3e',
  baratoFondo: '#e7f6ed',
  alerta: '#b42318',
};
