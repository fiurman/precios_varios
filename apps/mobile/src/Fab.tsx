import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tema } from './tema';

const CLAVE = 'fab.posicion.v1';
const LADO = 58;
const MARGEN = 16;
/** Cuanto puede moverse el dedo y seguir contando como toque y no arrastre. */
const TOLERANCIA = 6;

interface Caja { ancho: number; alto: number }

/** Boton flotante que se puede arrastrar.
 *
 *  Agregar es la accion que se repite veinte veces por compra, asi que el boton
 *  vive encima del contenido. Pero encima del contenido tapa algo, y cual es
 *  ese algo depende de la pantalla y de si sos zurdo o diestro. En vez de
 *  adivinar la mejor posicion, que la elija el usuario: se arrastra y se queda
 *  donde lo dejes, tambien entre sesiones. */
export function Fab({ onPress, caja }: { onPress: () => void; caja: Caja }) {
  const [listo, setListo] = useState(false);
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const actual = useRef({ x: 0, y: 0 });

  // Dentro de la caja: si la pantalla cambia de tamaño o el boton quedo
  // guardado fuera de rango, se lo trae de vuelta.
  const encajar = (x: number, y: number) => ({
    x: Math.max(MARGEN, Math.min(x, caja.ancho - LADO - MARGEN)),
    y: Math.max(MARGEN, Math.min(y, caja.alto - LADO - MARGEN)),
  });

  useEffect(() => {
    if (caja.ancho === 0 || caja.alto === 0) return;
    AsyncStorage.getItem(CLAVE)
      .then((crudo) => {
        const guardada = crudo ? (JSON.parse(crudo) as { x: number; y: number }) : null;
        // Por defecto, abajo a la derecha: donde cae el pulgar de un diestro.
        const inicial = guardada ?? {
          x: caja.ancho - LADO - MARGEN - 4,
          y: caja.alto - LADO - MARGEN - 4,
        };
        const dentro = encajar(inicial.x, inicial.y);
        actual.current = dentro;
        pos.setValue(dentro);
      })
      .catch(() => {})
      .finally(() => setListo(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caja.ancho, caja.alto]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Recien tomamos el gesto cuando el dedo se movio: si no, cada toque
      // quedaria atrapado aca y el boton no abriria nunca el panel.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > TOLERANCIA || Math.abs(g.dy) > TOLERANCIA,
      onPanResponderGrant: () => {
        pos.setOffset(actual.current);
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        pos.flattenOffset();
        const movio = Math.abs(g.dx) > TOLERANCIA || Math.abs(g.dy) > TOLERANCIA;
        if (!movio) {
          onPressRef.current();
          return;
        }
        const dentro = encajarRef.current(
          actual.current.x + g.dx,
          actual.current.y + g.dy,
        );
        actual.current = dentro;
        Animated.spring(pos, { toValue: dentro, useNativeDriver: false, friction: 7 }).start();
        void AsyncStorage.setItem(CLAVE, JSON.stringify(dentro)).catch(() => {});
      },
    }),
  ).current;

  // El PanResponder se crea una sola vez, asi que las funciones que usa adentro
  // tienen que leerse por referencia o quedarian congeladas en el primer render.
  const onPressRef = useRef(onPress);
  const encajarRef = useRef(encajar);
  onPressRef.current = onPress;
  encajarRef.current = encajar;

  if (!listo || caja.ancho === 0) return null;

  return (
    <Animated.View
      style={[estilos.fab, { transform: pos.getTranslateTransform() }]}
      {...responder.panHandlers}
    >
      <View style={estilos.centro}>
        <Text style={estilos.texto}>+</Text>
      </View>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LADO,
    height: LADO,
    borderRadius: LADO / 2,
    backgroundColor: tema.acento,
    // boxShadow y no shadow*: react-native-web deprecio esas props y avisa en
    // cada render. La forma nueva funciona igual en Android y en iOS.
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.25)',
    elevation: 6,
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  texto: { color: '#fff', fontSize: 32, lineHeight: 36, fontWeight: '300' },
});
