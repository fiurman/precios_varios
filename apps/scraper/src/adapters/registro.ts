import type { ChainAdapter } from './types.js';
import { CooperativaAdapter } from './cooperativa.js';
import { DiscoAdapter } from './disco.js';
import { CarrefourAdapter } from './carrefour.js';
import { CoopeHogarAdapter } from './coopehogar.js';

/** Las cadenas que sabemos scrapear, por su nombre corto en la linea de
 *  comandos. Un solo lugar: si mañana se suma Jumbo, se agrega aca y aparece
 *  tanto en el scrapeo manual como en el refresco automatico. */
export const ADAPTERS: Record<string, (raices?: number[]) => ChainAdapter> = {
  coope: () => new CooperativaAdapter(),
  hogar: () => new CoopeHogarAdapter(),
  disco: () => new DiscoAdapter(),
  carrefour: (raices) => new CarrefourAdapter(raices),
};
