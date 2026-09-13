import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/** Engancha el boton Atras de Android.
 *
 *  Sin esto, Atras hace lo predeterminado —cerrar la app— aunque tengas un
 *  panel abierto o estes en otra solapa. Para el sistema nada de eso es una
 *  pantalla: son estados internos nuestros, asi que nos toca a nosotros decir
 *  que "atras" significa en cada momento.
 *
 *  Los manejadores corren del ultimo registrado al primero, asi que lo mas
 *  cercano a la pantalla —un panel abierto— se cierra antes que lo general. */
export function useAtras(activo: boolean, accion: () => void): void {
  useEffect(() => {
    if (!activo) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      accion();
      return true; // consumido: no sale de la app
    });
    return () => sub.remove();
  }, [activo, accion]);
}
