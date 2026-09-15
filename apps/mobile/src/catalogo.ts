import { Platform } from 'react-native';
import * as remoto from './api';
import type { Cadena, Grupo } from './api';
import { buscarLocal, cadenasLocales, hayCatalogo, porEanLocal, revisionLocal } from './local/db';

/** De donde salen los datos del catalogo.
 *
 *  En el celular, de la copia local: adentro del super no hay señal confiable
 *  y la app tiene que andar igual. En el navegador, de la API, porque
 *  expo-sqlite en web esta en alfa y necesita cabeceras COEP/COOP que el
 *  servidor de desarrollo no manda.
 *
 *  Las pantallas no saben nada de esto: piden por aca y listo. */

const puedeLocal = Platform.OS !== 'web';

let local = false;

export async function prepararCatalogo(): Promise<{ local: boolean; revision: number }> {
  local = puedeLocal && (await hayCatalogo());
  return { local, revision: local ? await revisionLocal() : 0 };
}

export const usandoLocal = () => local;

export async function buscar(termino: string, cadena?: string): Promise<Grupo[]> {
  if (local) return buscarLocal(termino, { cadena, limite: 20 });
  return (await remoto.buscar(termino, cadena)).resultados;
}

export async function porEan(ean13: string): Promise<Grupo> {
  if (local) {
    const g = await porEanLocal(ean13);
    if (!g) throw new Error('No tenemos ese codigo todavia.');
    return g;
  }
  return remoto.porEan(ean13);
}

export async function listarCadenas(): Promise<Cadena[]> {
  if (local) return cadenasLocales();
  return (await remoto.listarCadenas()).cadenas;
}
