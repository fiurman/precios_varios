import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { plata } from './api';
import { EstadoCatalogo } from './EstadoCatalogo';
import type { Compra, Historial as Estado } from './compras';
import { tema } from './tema';

const fecha = (ms: number) =>
  new Date(ms).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

function Ticket({
  compra,
  onBorrar,
  onDevolver,
}: {
  compra: Compra;
  onBorrar: () => void;
  onDevolver?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <View style={estilos.compra}>
      <Pressable style={estilos.cabecera} onPress={() => setAbierto(!abierto)}>
        <View style={estilos.cabeceraTexto}>
          <Text style={estilos.tienda}>{compra.tienda}</Text>
          <Text style={estilos.fecha}>
            {fecha(compra.fecha)} · {compra.unidades} {compra.unidades === 1 ? 'unidad' : 'unidades'}
          </Text>
        </View>
        <Text style={estilos.total}>{plata(compra.totalCentavos)}</Text>
      </Pressable>

      {abierto && (
        <View style={estilos.detalle}>
          {compra.lineas.map((l, i) => (
            <LineaTicketCompra key={`${l.nombre}-${i}`} linea={l} />
          ))}
          <View style={estilos.acciones}>
            {onDevolver && (
              <Pressable style={estilos.devolver} onPress={onDevolver}>
                <Text style={estilos.devolverTexto}>Volver al changuito</Text>
              </Pressable>
            )}
            <Pressable style={estilos.borrarBoton} onPress={onBorrar}>
              <Text style={estilos.borrar}>Borrar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/** Un toque muestra el nombre completo: los del catalogo se cortan seguido. */
function LineaTicketCompra({ linea }: { linea: { nombre: string; cantidad: number; precioCentavos: number } }) {
  const [expandido, setExpandido] = useState(false);
  return (
    <Pressable style={estilos.linea} onPress={() => setExpandido(!expandido)}>
      <Text style={estilos.cantidad}>{linea.cantidad}×</Text>
      <Text style={estilos.nombre} numberOfLines={expandido ? undefined : 2}>{linea.nombre}</Text>
      <Text style={estilos.importe}>{plata(linea.precioCentavos * linea.cantidad)}</Text>
    </Pressable>
  );
}

export function HistorialPantalla({
  historial,
  catalogo,
  onActualizado,
  onDevolver,
}: {
  historial: Estado;
  catalogo?: { local: boolean; revision: number } | null;
  onActualizado?: () => void;
  /** Devuelve los items de una compra cerrada al changuito. */
  onDevolver?: (compra: Compra) => void;
}) {
  const { compras, gastoTotal, borrar } = historial;

  // Si el catalogo ya esta bajado, el aviso de arriba no aparece nunca mas:
  // este es el unico lugar desde donde se puede pedir una actualizacion.
  //
  // No se condiciona a que `catalogo` haya cargado: si esa consulta falla o
  // tarda, la fila desapareceria y no quedaria ninguna forma de actualizar.
  // En web el propio componente no se dibuja.
  const actualizar = onActualizado ? (
    <EstadoCatalogo onListo={onActualizado} yaEsta />
  ) : null;

  if (compras.length === 0) {
    return (
      <View style={estilos.vacio}>
        {actualizar}
        <Text style={estilos.vacioTitulo}>Todavia no cerraste ninguna compra</Text>
        <Text style={estilos.vacioTexto}>
          Cuando termines de cargar el changuito, tocá "Pasar por caja" y queda guardado aca
          para que puedas ver en que se te va la plata.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={estilos.contenedor} contentContainerStyle={estilos.lista}>
      <View style={estilos.resumen}>
        <Text style={estilos.resumenEtiqueta}>
          {compras.length} {compras.length === 1 ? 'compra guardada' : 'compras guardadas'}
        </Text>
        <Text style={estilos.resumenNumero}>{plata(gastoTotal)}</Text>
        <Text style={estilos.resumenEtiqueta}>gastado en total</Text>
      </View>

      {compras.map((c) => (
        <Ticket
          key={c.id}
          compra={c}
          onBorrar={() => void borrar(c.id)}
          // Las compras viejas no guardaron sus items: no hay que devolver.
          onDevolver={onDevolver && c.items?.length ? () => onDevolver(c) : undefined}
        />
      ))}

      {actualizar}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, paddingHorizontal: 16 },
  lista: { paddingBottom: 24 },
  resumen: {
    backgroundColor: tema.texto,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resumenEtiqueta: { color: '#aeb6bb', fontSize: 12 },
  resumenNumero: {
    color: '#fff', fontSize: 28, fontWeight: '700',
    fontVariant: ['tabular-nums'], marginVertical: 2,
  },
  compra: {
    backgroundColor: tema.tarjeta,
    borderWidth: 1,
    borderColor: tema.borde,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  cabeceraTexto: { flex: 1 },
  tienda: { fontSize: 15, fontWeight: '600', color: tema.texto },
  fecha: { fontSize: 12, color: tema.suave, marginTop: 2 },
  total: { fontSize: 16, fontWeight: '700', color: tema.texto, fontVariant: ['tabular-nums'] },
  detalle: {
    borderTopWidth: 1,
    borderTopColor: tema.borde,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linea: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  cantidad: { width: 30, fontSize: 13, color: tema.suave, fontVariant: ['tabular-nums'] },
  nombre: { flex: 1, fontSize: 13, color: tema.texto },
  importe: {
    minWidth: 74, textAlign: 'right', fontSize: 13,
    color: tema.texto, fontVariant: ['tabular-nums'],
  },
  acciones: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  devolver: {
    flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: tema.acento, backgroundColor: tema.tarjeta,
  },
  devolverTexto: { color: tema.acento, fontWeight: '600', fontSize: 13 },
  borrarBoton: { paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  borrar: { color: tema.alerta, fontSize: 13, textAlign: 'center' },
  vacio: { flex: 1, paddingHorizontal: 16, paddingTop: 24, alignItems: 'center' },
  vacioTitulo: { fontSize: 17, fontWeight: '600', color: tema.texto, marginBottom: 8 },
  vacioTexto: { fontSize: 14, color: tema.suave, textAlign: 'center', lineHeight: 20 },
});
