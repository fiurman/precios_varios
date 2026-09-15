import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aPagar, type Grupo, type Oferta } from './api';

const CLAVE = 'changuito.v1';

export interface Item {
  grupoId: string;
  nombre: string;
  marca: string | null;
  contenido: { valor: number; unidad: string } | null;
  ean13: string | null;
  imagen: string | null;
  /** Si es por peso, `cantidad` son kilos y el precio guardado es por kilo. */
  porPeso: boolean;
  /** Guardamos las ofertas de todas las cadenas, no solo la que se compra.
   *  Es lo que permite decir "este mismo changuito en Disco sale tanto" sin
   *  volver a consultar, incluso parado en la gondola sin señal. */
  ofertas: Oferta[];
  cantidad: number;
  agregadoEn: number;
  /** Cargado a mano con el precio del cartel: no existe en ningun catalogo.
   *  Siempre habra algo que las cadenas no publican —la verdura suelta, la
   *  oferta escrita a fibron— y un total al que le falta eso no sirve. */
  manual?: boolean;
}

export interface TotalPorCadena {
  cadena: string;
  tienda: string;
  /** Centavos de los items que esa cadena si tiene. */
  totalCentavos: number;
  /** Items del changuito que no existen en esa cadena. */
  faltantes: number;
}

const precioEn = (item: Item, cadena: string): number | null => {
  // El precio de un item manual vale en cualquier cadena: lo tipeaste parado
  // frente a la gondola, es el mas confiable que hay.
  if (item.manual) return item.ofertas[0] ? aPagar(item.ofertas[0]) : null;
  const oferta = item.ofertas.find((o) => o.cadena === cadena);
  return oferta ? aPagar(oferta) : null;
};

/** Cuanto sale el changuito entero en cada cadena.
 *
 *  Los faltantes se cuentan aparte en vez de sumar cero: un total mas barato
 *  porque a esa cadena le faltan tres productos no es mas barato, es otro
 *  changuito. Que la app lo diga es la diferencia entre informar y mentir. */
export function totales(items: Item[]): TotalPorCadena[] {
  const cadenas = new Map<string, string>();
  for (const item of items) {
    if (item.manual) continue; // no define cadenas: existe en todas
    for (const o of item.ofertas) cadenas.set(o.cadena, o.tienda);
  }

  return [...cadenas.entries()]
    .map(([cadena, tienda]) => {
      let total = 0;
      let faltantes = 0;
      for (const item of items) {
        const precio = precioEn(item, cadena);
        if (precio === null) faltantes++;
        else total += precio * item.cantidad;
      }
      return { cadena, tienda, totalCentavos: total, faltantes };
    })
    .sort((a, b) => a.faltantes - b.faltantes || a.totalCentavos - b.totalCentavos);
}

export const totalDe = (items: Item[], cadena: string): number =>
  items.reduce((acc, item) => acc + (precioEn(item, cadena) ?? 0) * item.cantidad, 0);

export const subtotal = (item: Item, cadena: string): number | null => {
  const p = precioEn(item, cadena);
  return p === null ? null : p * item.cantidad;
};

export function useChanguito() {
  const [items, setItems] = useState<Item[]>([]);
  const [cadena, setCadena] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // El changuito se arma caminando el super: si la app se cierra a mitad de
  // camino no se puede perder.
  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((crudo) => {
        if (!crudo) return;
        const guardado = JSON.parse(crudo) as { items: Item[]; cadena: string | null };
        setItems(guardado.items ?? []);
        setCadena(guardado.cadena ?? null);
      })
      .catch(() => {})
      .finally(() => setListo(true));
  }, []);

  useEffect(() => {
    if (!listo) return; // no pisar lo guardado con el estado vacio inicial
    void AsyncStorage.setItem(CLAVE, JSON.stringify({ items, cadena })).catch(() => {});
  }, [items, cadena, listo]);

  /** `veces` son toques, no unidades: para lo que va por peso cada toque suma
   *  el paso minimo de esa cadena, no un kilo. */
  const agregar = useCallback((grupo: Grupo, veces = 1) => {
    const paso = grupo.porPeso ? (grupo.contenido?.valor ?? 0.5) : 1;
    const suma = Math.round(paso * veces * 1000) / 1000;

    setItems((previos) => {
      const existente = previos.find((i) => i.grupoId === grupo.id);
      if (existente) {
        return previos.map((i) =>
          i.grupoId === grupo.id
            ? { ...i, cantidad: Math.round((i.cantidad + suma) * 1000) / 1000 }
            : i,
        );
      }
      return [
        ...previos,
        {
          grupoId: grupo.id,
          nombre: grupo.nombre,
          marca: grupo.marca,
          contenido: grupo.contenido,
          ean13: grupo.ean13,
          imagen: grupo.imagen,
          porPeso: grupo.porPeso,
          ofertas: grupo.ofertas,
          // Un producto por peso arranca en el minimo que declara la cadena
          // (100 g de queso, no un kilo): siempre es mas facil sumar que
          // descubrir en la caja que cargaste de mas.
          cantidad: suma,
          agregadoEn: Date.now(),
        },
      ];
    });
  }, []);

  const agregarManual = useCallback((nombre: string, precioCentavos: number, cadena: string | null) => {
    setItems((previos) => [
      ...previos,
      {
        grupoId: `manual:${Date.now()}`,
        nombre,
        marca: null,
        contenido: null,
        ean13: null,
        imagen: null,
        porPeso: false,
        ofertas: [{
          productId: '',
          cadena: cadena ?? 'manual',
          tienda: 'Cargado a mano',
          nombre,
          ean13: null,
          precioCentavos,
          promoCentavos: null,
          url: null,
        }],
        cantidad: 1,
        agregadoEn: Date.now(),
        manual: true,
      },
    ]);
  }, []);

  /** Cuanto suma o resta un toque. Por peso va de a 100 g; por unidad, de a 1. */
  const paso = (item: Item) => (item.porPeso ? 0.1 : 1);

  const cambiarCantidad = useCallback((grupoId: string, signo: number) => {
    setItems((previos) =>
      previos
        .map((i) => {
          if (i.grupoId !== grupoId) return i;
          // Redondeo explicito: 0.1 + 0.2 en punto flotante da 0.30000000000004
          // y el changuito mostraria basura.
          const cantidad = Math.round((i.cantidad + signo * paso(i)) * 1000) / 1000;
          return { ...i, cantidad };
        })
        .filter((i) => i.cantidad > 0),
    );
  }, []);

  const fijarCantidad = useCallback((grupoId: string, cantidad: number) => {
    setItems((previos) =>
      previos
        .map((i) => (i.grupoId === grupoId ? { ...i, cantidad } : i))
        .filter((i) => i.cantidad > 0),
    );
  }, []);

  const quitar = useCallback((grupoId: string) => {
    setItems((previos) => previos.filter((i) => i.grupoId !== grupoId));
  }, []);

  const vaciar = useCallback(() => setItems([]), []);

  /** Devuelve al changuito una compra ya cerrada. Se suma a lo que haya,
   *  no lo reemplaza: podes estar armando el siguiente cuando te das cuenta
   *  de que cerraste el anterior por error. */
  const restaurar = useCallback((devueltos: Item[]) => {
    setItems((previos) => {
      const porId = new Map(previos.map((i) => [i.grupoId, i]));
      for (const d of devueltos) {
        const existente = porId.get(d.grupoId);
        if (existente) porId.set(d.grupoId, { ...existente, cantidad: existente.cantidad + d.cantidad });
        else porId.set(d.grupoId, d);
      }
      return [...porId.values()];
    });
  }, []);

  // Los que van por peso no se cuentan como unidades: "2.3 unidades" no
  // significa nada. Cuentan como un renglon del changuito.
  const unidades = items.reduce((acc, i) => acc + (i.porPeso ? 1 : i.cantidad), 0);

  return {
    items, cadena, setCadena, agregar, agregarManual, restaurar,
    cambiarCantidad, fijarCantidad, quitar, vaciar, unidades, listo,
  };
}

export type Changuito = ReturnType<typeof useChanguito>;
