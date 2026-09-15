import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
// El SafeAreaView de react-native quedo deprecado: el mantenido es este, y
// ademas respeta el notch y la barra de gestos en Android, que el viejo no.
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { plata, type Cadena } from './src/api';
import { listarCadenas, prepararCatalogo } from './src/catalogo';
import { Buscar } from './src/Buscar';
import { Escanear } from './src/Escanear';
import { ChanguitoPantalla } from './src/Changuito';
import { HistorialPantalla } from './src/Historial';
import { totales, totalDe, useChanguito } from './src/changuito';
import { EstadoCatalogo } from './src/EstadoCatalogo';
import { useCompras } from './src/compras';
import { colorDe, tema } from './src/tema';
import { useAtras } from './src/atras';

type Pestana = 'changuito' | 'escanear' | 'buscar' | 'historial';

const NOMBRE_CORTO: Record<string, string> = {
  cooperativa_obrera: 'Cooperativa',
  disco: 'Disco',
  carrefour: 'Carrefour',
};

const SECCIONES: { clave: Pestana; texto: string }[] = [
  { clave: 'changuito', texto: 'Changuito' },
  { clave: 'escanear', texto: 'Escanear' },
  { clave: 'buscar', texto: 'Buscar' },
  { clave: 'historial', texto: 'Historial' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Contenido />
    </SafeAreaProvider>
  );
}

function Contenido() {
  const changuito = useChanguito();
  const historial = useCompras();
  const [pestana, setPestana] = useState<Pestana>('changuito');
  const [cadenas, setCadenas] = useState<Cadena[]>([]);
  const [catalogo, setCatalogo] = useState<{ local: boolean; revision: number } | null>(null);

  const cargarCadenas = () => {
    prepararCatalogo()
      .then((estado) => {
        setCatalogo(estado);
        return listarCadenas();
      })
      .then(setCadenas)
      .catch(() => {});
  };

  useEffect(() => {
    // Primero se decide de donde salen los datos, y recien despues se piden:
    // al reves, la primera consulta iria a la API aunque haya catalogo local.
    prepararCatalogo()
      .then(() => listarCadenas())
      .then(setCadenas)
      .catch(() => {});
  }, []);

  // Estando en otra solapa, Atras vuelve al changuito en vez de cerrar la app.
  // Desde el changuito si sale, que es lo que espera cualquiera en Android.
  useAtras(pestana !== 'changuito', () => setPestana('changuito'));

  const porCadena = totales(changuito.items);
  const activa = changuito.cadena ?? porCadena[0]?.cadena ?? null;
  const total = activa ? totalDe(changuito.items, activa) : 0;

  return (
    <SafeAreaView style={estilos.raiz}>
      <StatusBar barStyle="dark-content" />

      {/* Marca arriba, filtros abajo. Dos filas livianas en vez de tres
          densas: lo que apretaba antes era la bajada con el conteo repetido,
          no el titulo. */}
      <View style={estilos.marca}>
        <View style={estilos.sello}>
          <Text style={estilos.selloTexto}>$</Text>
        </View>
        <Text style={estilos.titulo}>
          Precios <Text style={estilos.tituloAcento}>Varios</Text>
        </Text>
        <View style={estilos.empuje} />
        {changuito.unidades > 0 && pestana !== 'changuito' && (
          <Text style={estilos.totalVivo}>{plata(total)}</Text>
        )}
      </View>

      <View style={estilos.barra}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={estilos.lugares}
        >
          <Lugar
            texto="Todos"
            activo={changuito.cadena === null}
            onPress={() => changuito.setCadena(null)}
          />
          {cadenas.map((c) => (
            <Lugar
              key={c.cadena}
              texto={NOMBRE_CORTO[c.cadena] ?? c.nombre}
              activo={changuito.cadena === c.cadena}
              color={colorDe(c.cadena)}
              onPress={() => changuito.setCadena(c.cadena)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Solo si de verdad falta: antes se mostraba siempre al abrir, aunque
          el catalogo ya estuviera guardado. */}
      {catalogo && !catalogo.local && <EstadoCatalogo onListo={cargarCadenas} />}

      <View style={estilos.cuerpo}>
        {pestana === 'changuito' && (
          <ChanguitoPantalla
            changuito={changuito}
            historial={historial}
            onCerrada={() => setPestana('historial')}
          />
        )}
        {pestana === 'escanear' && <Escanear changuito={changuito} />}
        {pestana === 'buscar' && <Buscar changuito={changuito} />}
        {pestana === 'historial' && (
          <HistorialPantalla
            historial={historial}
            catalogo={catalogo}
            onActualizado={cargarCadenas}
            onDevolver={(compra) => {
              if (!compra.items) return;
              changuito.restaurar(compra.items);
              if (compra.cadena) changuito.setCadena(compra.cadena);
              void historial.borrar(compra.id);
              setPestana('changuito');
            }}
          />
        )}
      </View>

      {/* Navegacion abajo: la app se usa con una mano, empujando un carro.
          Arriba el pulgar no llega. */}
      <View style={estilos.nav}>
        {SECCIONES.map((s) => {
          const activaSeccion = pestana === s.clave;
          const cuenta =
            s.clave === 'changuito' ? changuito.unidades
            : s.clave === 'historial' ? historial.compras.length
            : 0;
          return (
            <Pressable key={s.clave} style={estilos.navItem} onPress={() => setPestana(s.clave)}>
              {/* El globo se posiciona contra la palabra, no contra la pestaña:
                  anclado a la pestaña caia a un porcentaje fijo del ancho y
                  terminaba partiendo la palabra al medio. */}
              <View style={estilos.etiqueta}>
                <Text style={[estilos.navTexto, activaSeccion && estilos.navTextoActivo]}>
                  {s.texto}
                </Text>
                {cuenta > 0 && (
                  <View style={[estilos.globo, activaSeccion && estilos.globoActivo]}>
                    <Text style={estilos.globoTexto}>{cuenta}</Text>
                  </View>
                )}
              </View>
              <View style={[estilos.subrayado, activaSeccion && estilos.subrayadoActivo]} />
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function Lugar({
  texto,
  activo,
  onPress,
  color,
}: {
  texto: string;
  activo: boolean;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      style={[
        estilos.lugar,
        activo && estilos.lugarActivo,
        activo && color ? { backgroundColor: color, borderColor: color } : null,
      ]}
      onPress={onPress}
    >
      <Text style={[estilos.lugarTexto, activo && estilos.lugarTextoActivo]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: tema.fondo },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
  },
  sello: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: tema.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selloTexto: { color: '#fff', fontSize: 15, fontWeight: '800', lineHeight: 19 },
  titulo: { fontSize: 18, fontWeight: '700', color: tema.texto, letterSpacing: -0.4 },
  tituloAcento: { color: tema.acento },
  empuje: { flex: 1 },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  lugares: { gap: 6, paddingRight: 4 },
  lugar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tema.borde,
    backgroundColor: tema.tarjeta,
  },
  lugarActivo: { backgroundColor: tema.acento, borderColor: tema.acento },
  lugarTexto: { fontSize: 13, color: tema.suave },
  lugarTextoActivo: { color: '#fff', fontWeight: '600' },
  totalVivo: {
    fontSize: 18,
    fontWeight: '700',
    color: tema.acento,
    fontVariant: ['tabular-nums'],
  },
  cuerpo: { flex: 1 },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: tema.borde,
    backgroundColor: tema.tarjeta,
    paddingBottom: 6,
  },
  navItem: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  navTexto: { fontSize: 12, color: tema.suave, fontWeight: '500' },
  navTextoActivo: { color: tema.acento, fontWeight: '700' },
  etiqueta: { position: 'relative' },
  globo: {
    position: 'absolute',
    // Sobre la ultima letra: arriba y apenas pasada del borde derecho del texto.
    top: -9,
    right: -13,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: tema.suave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globoActivo: { backgroundColor: tema.acento },
  globoTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
  subrayado: { height: 2, width: 22, borderRadius: 2, marginTop: 4, backgroundColor: 'transparent' },
  subrayadoActivo: { backgroundColor: tema.acento },
});
