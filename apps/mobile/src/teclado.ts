import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';

/** Cuanto hay que levantar un panel anclado abajo para que el teclado no lo tape.
 *
 *  Hay dos comportamientos posibles segun como este configurada la ventana:
 *  si el sistema la achica al abrir el teclado, "abajo de todo" ya es arriba
 *  del teclado y no hay nada que corregir; si en cambio la deja del mismo
 *  tamaño y monta el teclado encima, hay que desplazar a mano.
 *
 *  Expo Go no respeta la configuracion de app.json, asi que no se puede asumir
 *  ninguno de los dos: lo detectamos mirando si la ventana efectivamente se
 *  encogio. */
export function useDesplazamientoTeclado(): { desplazamiento: number; alto: number } {
  const { height } = useWindowDimensions();
  const [teclado, setTeclado] = useState(0);
  const maxAlto = useRef(height);

  if (height > maxAlto.current) maxAlto.current = height;

  useEffect(() => {
    const mostrar = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setTeclado(e.endCoordinates.height),
    );
    const ocultar = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setTeclado(0),
    );
    return () => { mostrar.remove(); ocultar.remove(); };
  }, []);

  // Si la ventana se achico al menos la mitad de lo que mide el teclado, el
  // sistema ya lo resolvio y desplazar seria subirlo dos veces.
  const seEncogio = teclado > 0 && height < maxAlto.current - teclado / 2;

  return {
    desplazamiento: seEncogio ? 0 : teclado,
    alto: height,
  };
}
