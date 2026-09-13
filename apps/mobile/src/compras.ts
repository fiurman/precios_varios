import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Item } from './changuito';

const CLAVE = 'compras.v1';
/** Cuantas compras guardamos. Bajo de cien a cincuenta porque ahora cada una
 *  lleva tambien sus items completos para poder devolverlos al changuito, y el
 *  almacenamiento del telefono no es infinito. Cincuenta compras es cerca de un
 *  año comprando por semana. */
const TOPE = 50;

export interface LineaCompra {
  nombre: string;
  cantidad: number;
  /** Precio unitario congelado al momento de cerrar la compra: si manana el
   *  producto aumenta, el ticket viejo tiene que seguir diciendo lo que
   *  pagaste. Un historial que se actualiza solo no es un historial. */
  precioCentavos: number;
}

export interface Compra {
  id: string;
  fecha: number;
  cadena: string | null;
  tienda: string;
  lineas: LineaCompra[];
  totalCentavos: number;
  unidades: number;
  /** El changuito tal cual estaba, para poder deshacer el paso por caja.
   *  Opcional: las compras guardadas antes de esta version no lo tienen. */
  items?: Item[];
}

export function useCompras() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((crudo) => { if (crudo) setCompras(JSON.parse(crudo) as Compra[]); })
      .catch(() => {})
      .finally(() => setListo(true));
  }, []);

  const persistir = useCallback(async (siguiente: Compra[]) => {
    setCompras(siguiente);
    await AsyncStorage.setItem(CLAVE, JSON.stringify(siguiente)).catch(() => {});
  }, []);

  const guardar = useCallback(
    async (items: Item[], cadena: string | null, tienda: string, precioDe: (i: Item) => number | null) => {
      const lineas: LineaCompra[] = items.map((i) => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precioCentavos: precioDe(i) ?? 0,
      }));

      const compra: Compra = {
        id: `${Date.now()}`,
        fecha: Date.now(),
        cadena,
        tienda,
        lineas,
        totalCentavos: lineas.reduce((a, l) => a + l.precioCentavos * l.cantidad, 0),
        unidades: lineas.reduce((a, l) => a + l.cantidad, 0),
        items,
      };

      await persistir([compra, ...compras].slice(0, TOPE));
      return compra;
    },
    [compras, persistir],
  );

  const borrar = useCallback(
    (id: string) => persistir(compras.filter((c) => c.id !== id)),
    [compras, persistir],
  );

  const gastoTotal = compras.reduce((a, c) => a + c.totalCentavos, 0);

  return { compras, guardar, borrar, gastoTotal, listo };
}

export type Historial = ReturnType<typeof useCompras>;
