import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { aPagar, plata, type Grupo, type Oferta } from './api';
import { tema } from './tema';

const NOMBRE_CORTO: Record<string, string> = {
  cooperativa_obrera: 'Cooperativa',
  disco: 'Disco',
  carrefour: 'Carrefour',
};

function Fila({ oferta, esBarato }: { oferta: Oferta; esBarato: boolean }) {
  const precio = aPagar(oferta);
  const hayPromo = oferta.promoCentavos !== null;

  return (
    <Pressable
      style={[estilos.fila, esBarato && estilos.filaBarata]}
      onPress={() => oferta.url && Linking.openURL(oferta.url)}
      disabled={!oferta.url}
    >
      <Text style={[estilos.cadena, esBarato && estilos.textoBarato]}>
        {NOMBRE_CORTO[oferta.cadena] ?? oferta.tienda}
      </Text>
      <View style={estilos.precios}>
        {hayPromo && <Text style={estilos.tachado}>{plata(oferta.precioCentavos)}</Text>}
        <Text style={[estilos.precio, esBarato && estilos.textoBarato]}>{plata(precio)}</Text>
      </View>
    </Pressable>
  );
}

export function TarjetaProducto({
  grupo,
  onAgregar,
  enChanguito,
}: {
  grupo: Grupo;
  onAgregar?: (grupo: Grupo) => void;
  enChanguito?: number;
}) {
  const comparable = grupo.ofertas.length > 1;
  const barato = aPagar(grupo.masBarato);

  // Precio por unidad: es lo unico que deja comparar honestamente 900ml contra
  // 1L, que es donde la gente se come la diferencia sin darse cuenta.
  const unitario = grupo.contenido
    ? `${plata(Math.round(barato / grupo.contenido.valor))} por ${grupo.contenido.unidad}`
    : null;

  return (
    <View style={estilos.tarjeta}>
      <View style={estilos.encabezado}>
        {grupo.imagen ? (
          <Image source={{ uri: grupo.imagen }} style={estilos.foto} resizeMode="contain" />
        ) : (
          <View style={[estilos.foto, estilos.fotoVacia]}>
            <Text style={estilos.fotoVaciaTexto}>sin foto</Text>
          </View>
        )}
        <View style={estilos.encabezadoTexto}>
          <Text style={estilos.nombre}>{grupo.nombre}</Text>

          <View style={estilos.meta}>
        {grupo.marca && <Text style={estilos.metaTexto}>{grupo.marca}</Text>}
        {grupo.contenido && (
          <Text style={estilos.metaTexto}>
            {grupo.contenido.valor} {grupo.contenido.unidad}
          </Text>
        )}
            {unitario && <Text style={estilos.metaTexto}>{unitario}</Text>}
          </View>
        </View>
      </View>

      {grupo.ofertas.map((o) => (
        <Fila key={`${o.cadena}-${o.productId}`} oferta={o} esBarato={comparable && aPagar(o) === barato} />
      ))}

      {comparable && grupo.ahorroCentavos > 0 && (
        <Text style={estilos.ahorro}>
          Ahorras {plata(grupo.ahorroCentavos)} comprandolo en{' '}
          {NOMBRE_CORTO[grupo.masBarato.cadena] ?? grupo.masBarato.tienda}
        </Text>
      )}
      {!comparable && (
        <Text style={estilos.soloUna}>Solo lo encontramos en una cadena</Text>
      )}

      {onAgregar && (
        <Pressable style={estilos.agregar} onPress={() => onAgregar(grupo)}>
          <Text style={estilos.agregarTexto}>
            {enChanguito ? `Agregar otro (llevas ${enChanguito})` : 'Agregar al changuito'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: tema.tarjeta,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tema.borde,
    padding: 14,
    marginBottom: 12,
  },
  encabezado: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  encabezadoTexto: { flex: 1 },
  foto: {
    width: 56, height: 56, borderRadius: 8,
    backgroundColor: tema.fondo, borderWidth: 1, borderColor: tema.borde,
  },
  fotoVacia: { alignItems: 'center', justifyContent: 'center' },
  fotoVaciaTexto: { fontSize: 9, color: tema.suave },
  nombre: { fontSize: 15, fontWeight: '600', color: tema.texto, marginBottom: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  metaTexto: { fontSize: 12, color: tema.suave },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  filaBarata: { backgroundColor: tema.baratoFondo },
  cadena: { fontSize: 14, color: tema.texto },
  textoBarato: { color: tema.barato, fontWeight: '700' },
  precios: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  precio: { fontSize: 15, fontWeight: '600', color: tema.texto, fontVariant: ['tabular-nums'] },
  tachado: { fontSize: 12, color: tema.suave, textDecorationLine: 'line-through' },
  ahorro: { marginTop: 6, fontSize: 13, color: tema.barato, fontWeight: '600' },
  soloUna: { marginTop: 6, fontSize: 12, color: tema.suave },
  agregar: {
    marginTop: 10,
    backgroundColor: tema.acento,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  agregarTexto: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
