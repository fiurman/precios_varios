import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { tema } from './tema';

/** Cartel de confirmacion para acciones que no se pueden deshacer de un toque.
 *
 *  Va como cartel y no como botones en linea porque la fila de abajo cambiaba
 *  de forma al aparecer la confirmacion: el boton principal se encogia para
 *  hacerle lugar al de cancelar, y todo se movia de lugar justo cuando estabas
 *  por tocar. */
export function Confirmacion({
  visible,
  titulo,
  detalle,
  destacado,
  confirmar,
  peligro = false,
  onConfirmar,
  onCancelar,
}: {
  visible: boolean;
  titulo: string;
  detalle?: string;
  /** El dato que hay que mirar antes de decidir: el total, cuantas unidades. */
  destacado?: string;
  confirmar: string;
  peligro?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <Pressable style={estilos.telon} onPress={onCancelar}>
        {/* Un toque adentro del cartel no tiene que cerrarlo. */}
        <Pressable style={estilos.cartel} onPress={() => {}}>
          <Text style={estilos.titulo}>{titulo}</Text>
          {destacado && <Text style={estilos.destacado}>{destacado}</Text>}
          {detalle && <Text style={estilos.detalle}>{detalle}</Text>}

          <View style={estilos.botones}>
            <Pressable style={estilos.cancelar} onPress={onCancelar}>
              <Text style={estilos.cancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[estilos.confirmar, peligro && estilos.confirmarPeligro]}
              onPress={onConfirmar}
            >
              <Text style={estilos.confirmarTexto}>{confirmar}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  telon: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  cartel: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: tema.tarjeta,
    borderRadius: 14,
    padding: 20,
  },
  titulo: { fontSize: 16, fontWeight: '700', color: tema.texto },
  destacado: {
    fontSize: 30,
    fontWeight: '700',
    color: tema.texto,
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  detalle: { fontSize: 13, color: tema.suave, marginTop: 4, lineHeight: 18 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelar: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tema.borde,
  },
  cancelarTexto: { color: tema.texto, fontWeight: '600', fontSize: 14 },
  confirmar: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: tema.barato,
  },
  confirmarPeligro: { backgroundColor: tema.alerta },
  confirmarTexto: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
