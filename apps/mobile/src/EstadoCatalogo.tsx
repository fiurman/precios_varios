import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { sincronizar, type Progreso } from './local/sync';
import { ultimaSincronizacion } from './local/db';
import { tema } from './tema';

const TEXTO: Record<Progreso['etapa'], string> = {
  consultando: 'Viendo si hay novedades...',
  descargando: 'Bajando el catalogo...',
  guardando: 'Guardando en el telefono...',
  listo: 'Catalogo actualizado',
  'al-dia': 'Ya estabas al dia',
};

/** Aviso y boton para bajar el catalogo al telefono.
 *
 *  Solo aparece en el celular: en el navegador la app consulta la API, porque
 *  expo-sqlite en web esta en alfa. Y solo mientras falte bajarlo: una vez que
 *  esta, la app arranca directo contra la copia local. */
/** "hace 3 horas" en vez de un numero de revision: al que usa la app le
 *  importa que tan viejos son los precios, no como los versionamos adentro. */
function hace(fecha: Date): string {
  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 2) return 'recien';
  if (minutos < 60) return `hace ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export function EstadoCatalogo({
  onListo,
  yaEsta = false,
}: {
  onListo: () => void;
  /** true cuando el catalogo ya esta bajado y esto es solo para actualizarlo. */
  yaEsta?: boolean;
}) {
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oculto, setOculto] = useState(false);
  const [bajadoEn, setBajadoEn] = useState<Date | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    ultimaSincronizacion().then(setBajadoEn).catch(() => {});
  }, [progreso]);

  if (Platform.OS === 'web' || (oculto && !yaEsta)) return null;

  const trabajando =
    progreso !== null && progreso.etapa !== 'listo' && progreso.etapa !== 'al-dia';

  const bajar = async () => {
    setError(null);
    try {
      // Si ya lo tenias y tocaste Actualizar, bajamos igual.
      const fin = await sincronizar(setProgreso, yaEsta);
      if (fin.etapa === 'listo' || fin.etapa === 'al-dia') {
        onListo();
        setTimeout(() => setOculto(true), 1500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos sincronizar');
      setProgreso(null);
    }
  };

  return (
    <View style={estilos.caja}>
      <View style={estilos.texto}>
        <Text style={estilos.titulo}>
          {progreso ? TEXTO[progreso.etapa] : yaEsta ? 'Catalogo en el telefono' : 'Falta bajar el catalogo'}
        </Text>
        <Text style={estilos.detalle}>
          {error
            ? error
            : progreso?.productos
              ? `${progreso.productos.toLocaleString('es-AR')} productos`
              : yaEsta
                ? bajadoEn
                  ? `Actualizado ${hace(bajadoEn)}. Anda sin señal.`
                  : 'Anda sin señal adentro del super.'
                : 'Son 3 MB. Despues funciona sin señal adentro del super.'}
        </Text>
      </View>

      {trabajando ? (
        <ActivityIndicator color={tema.acento} />
      ) : (
        <Pressable style={estilos.boton} onPress={() => void bajar()}>
          <Text style={estilos.botonTexto}>
            {error ? 'Reintentar' : yaEsta ? 'Actualizar' : 'Bajar'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    // Sin esto, dentro de un contenedor centrado la fila se encoge al ancho de
    // su contenido y el texto con flex:1 colapsa a cero: la fila desaparece.
    alignSelf: 'stretch',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tema.borde,
    backgroundColor: tema.tarjeta,
  },
  texto: { flex: 1 },
  titulo: { fontSize: 13, fontWeight: '600', color: tema.texto },
  detalle: { fontSize: 11, color: tema.suave, marginTop: 2 },
  boton: {
    backgroundColor: tema.acento,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  botonTexto: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
