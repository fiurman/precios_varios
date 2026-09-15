import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Grupo } from './api';
import { porEan } from './catalogo';
import type { Changuito } from './changuito';
import { TarjetaProducto } from './TarjetaProducto';
import { tema } from './tema';

/** Hay camara utilizable? En el navegador puede no haber dispositivo, y en un
 *  telefono el usuario puede negar el permiso. Los dos casos caen en lo mismo:
 *  tipear el codigo a mano, que ademas salva cuando el codigo esta borroneado. */
function useHayCamara(): boolean | null {
  const [hay, setHay] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setHay(true);
      return;
    }
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.enumerateDevices) {
      setHay(false);
      return;
    }
    media
      .enumerateDevices()
      .then((ds) => setHay(ds.some((d) => d.kind === 'videoinput')))
      .catch(() => setHay(false));
  }, []);

  return hay;
}

export function Escanear({ changuito }: { changuito: Changuito }) {
  const hayCamara = useHayCamara();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // El ultimo codigo atendido y si hay una consulta en curso. La camara avisa
  // en cada cuadro, asi que sin esto un producto quieto dispara decenas de
  // consultas por segundo.
  const ultimo = useRef<string | null>(null);
  const ocupado = useRef(false);

  const consultar = useCallback(async (ean: string) => {
    ultimo.current = ean;
    ocupado.current = true;
    setCargando(true);
    setError(null);
    setGrupo(null);
    try {
      setGrupo(await porEan(ean));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fallo la consulta');
    } finally {
      ocupado.current = false;
      setCargando(false);
    }
  }, []);

  /** La camara sigue prendida con un resultado en pantalla: apuntar al
   *  siguiente producto lo reemplaza. Antes habia que encontrar el boton de
   *  "escanear otro", que la ficha del producto empujaba fuera de la vista. */
  const alLeer = useCallback(
    ({ data }: { data: string }) => {
      if (ocupado.current || data === ultimo.current) return;
      void consultar(data);
    },
    [consultar],
  );

  const usarCamara = hayCamara === true && !manual;

  return (
    <View style={estilos.contenedor}>
      {hayCamara === null && <ActivityIndicator color={tema.acento} />}

      {usarCamara && permiso?.granted !== true && (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>Necesitamos la camara para leer el codigo.</Text>
          <Pressable style={estilos.boton} onPress={() => void pedirPermiso()}>
            <Text style={estilos.botonTexto}>Dar permiso</Text>
          </Pressable>
        </View>
      )}

      {usarCamara && permiso?.granted === true && (
        <View style={[estilos.visor, grupo ? estilos.visorChico : null]}>
          <CameraView
            style={estilos.camara}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={alLeer}
          />
        </View>
      )}

      {(hayCamara === false || manual) && (
        <View style={estilos.manual}>
          <Text style={estilos.etiqueta}>Codigo de barras</Text>
          <TextInput
            style={estilos.input}
            placeholder="7790480089963"
            placeholderTextColor={tema.suave}
            value={codigo}
            onChangeText={setCodigo}
            onSubmitEditing={() => codigo.length >= 8 && void consultar(codigo)}
            keyboardType="number-pad"
            maxLength={13}
          />
          <Pressable
            style={[estilos.boton, codigo.length < 8 && estilos.botonInactivo]}
            disabled={codigo.length < 8}
            onPress={() => void consultar(codigo)}
          >
            <Text style={estilos.botonTexto}>Buscar precio</Text>
          </Pressable>
          {hayCamara === false && (
            <Text style={estilos.nota}>
              No hay camara disponible en este dispositivo, asi que va a mano.
            </Text>
          )}
        </View>
      )}

      {hayCamara === true && (
        <Pressable onPress={() => { setManual(!manual); setGrupo(null); setError(null); }}>
          <Text style={estilos.alterna}>
            {manual ? 'Usar la camara' : 'Escribir el codigo a mano'}
          </Text>
        </Pressable>
      )}

      {cargando && <ActivityIndicator style={estilos.centro} color={tema.acento} />}
      {error && <Text style={estilos.error}>{error}</Text>}

      {/* Con scroll: la ficha de un producto en tres cadenas es alta, y sin
          esto empujaba el boton de agregar fuera de la pantalla. */}
      {grupo && (
        <ScrollView style={estilos.resultado} contentContainerStyle={estilos.resultadoInterior}>
          <Text style={estilos.pista}>Apunta al siguiente producto para cambiarlo</Text>
          <TarjetaProducto
            grupo={grupo}
            onAgregar={changuito.agregar}
            enChanguito={changuito.items.find((i) => i.grupoId === grupo.id)?.cantidad}
          />
          <Pressable
            onPress={() => { setGrupo(null); setCodigo(''); setError(null); ultimo.current = null; }}
          >
            <Text style={estilos.alterna}>Limpiar</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, paddingHorizontal: 16 },
  visor: { height: 260, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  // Con un resultado en pantalla el visor cede espacio: seguis viendo lo que
  // apuntas, pero la ficha del producto tiene lugar para mostrarse entera.
  visorChico: { height: 130 },
  camara: { flex: 1 },
  manual: { marginBottom: 12 },
  etiqueta: { fontSize: 13, color: tema.suave, marginBottom: 6 },
  input: {
    backgroundColor: tema.tarjeta,
    borderWidth: 1,
    borderColor: tema.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: tema.texto,
    fontVariant: ['tabular-nums'],
  },
  boton: {
    backgroundColor: tema.acento,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  botonInactivo: { opacity: 0.4 },
  botonTexto: { color: '#fff', fontWeight: '600', fontSize: 15 },
  aviso: { paddingVertical: 20 },
  avisoTexto: { color: tema.texto, fontSize: 14 },
  nota: { color: tema.suave, fontSize: 12, marginTop: 8 },
  alterna: { color: tema.acento, fontSize: 14, textAlign: 'center', paddingVertical: 10 },
  centro: { marginTop: 20 },
  error: { color: tema.alerta, marginTop: 12, fontSize: 14 },
  resultado: { flex: 1, marginTop: 8 },
  resultadoInterior: { paddingBottom: 16 },
  pista: { fontSize: 11, color: tema.suave, textAlign: 'center', paddingBottom: 8 },
});
