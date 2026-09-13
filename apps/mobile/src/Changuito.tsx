import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { plata } from './api';
import { AgregarRapido } from './AgregarRapido';
import { Confirmacion } from './Confirmacion';
import { useAtras } from './atras';
import { Fab } from './Fab';
import { subtotal, totales, totalDe, type Changuito as Estado, type Item } from './changuito';
import type { Historial } from './compras';
import { colorDe, tema } from './tema';

const NOMBRE_CORTO: Record<string, string> = {
  cooperativa_obrera: 'Cooperativa',
  disco: 'Disco',
  carrefour: 'Carrefour',
};
const corto = (cadena: string, tienda: string) => NOMBRE_CORTO[cadena] ?? tienda;

/** "0.3 kg" para lo que va por peso, "3" para lo que va por unidad. */
const cantidadTexto = (item: Item) =>
  item.porPeso ? `${item.cantidad.toFixed(item.cantidad < 1 ? 3 : 2)} kg` : String(item.cantidad);

type Vista = 'lista' | 'ticket';

/** Fila completa: nombre, controles de cantidad y subtotal. Para revisar. */
function Linea({ item, cadena, changuito }: { item: Item; cadena: string; changuito: Estado }) {
  const sub = subtotal(item, cadena);
  // Los nombres de catalogo son largos y descriptivos; cortados a dos lineas a
  // veces se pierde justo la variante. Un toque los muestra enteros.
  const [expandido, setExpandido] = useState(false);

  return (
    <View style={estilos.linea}>
      {item.imagen ? (
        <Image source={{ uri: item.imagen }} style={estilos.miniatura} resizeMode="contain" />
      ) : (
        <View style={[estilos.miniatura, estilos.miniaturaVacia]} />
      )}
      <Pressable style={estilos.lineaTexto} onPress={() => setExpandido(!expandido)}>
        <Text style={estilos.lineaNombre} numberOfLines={expandido ? undefined : 2}>
          {item.nombre}
        </Text>
        {sub === null ? (
          <Text style={estilos.faltante}>No esta en {NOMBRE_CORTO[cadena] ?? cadena}</Text>
        ) : (
          <Text style={estilos.lineaSub}>
            {plata(sub / item.cantidad)} {item.porPeso ? 'el kilo' : 'c/u'}
            {item.manual ? ' · cargado a mano' : ''}
          </Text>
        )}
      </Pressable>

      <View style={estilos.controles}>
        <Pressable style={estilos.boton} onPress={() => changuito.cambiarCantidad(item.grupoId, -1)}>
          <Text style={estilos.botonTexto}>-</Text>
        </Pressable>
        <Text style={[estilos.cantidad, item.porPeso && estilos.cantidadPeso]}>
          {cantidadTexto(item)}
        </Text>
        <Pressable style={estilos.boton} onPress={() => changuito.cambiarCantidad(item.grupoId, 1)}>
          <Text style={estilos.botonTexto}>+</Text>
        </Pressable>
      </View>

      <Text style={estilos.subtotal}>{sub === null ? '—' : plata(sub)}</Text>

      {/* Sacar un producto entero no puede costar diez toques al menos. */}
      <Pressable
        style={estilos.tacho}
        onPress={() => changuito.quitar(item.grupoId)}
        hitSlop={8}
      >
        <MaterialIcons name="delete-outline" size={20} color={tema.suave} />
      </Pressable>
    </View>
  );
}

/** Fila compacta: una linea por producto, sin foto ni precio unitario, pero
 *  con los controles de cantidad. Con veinte cosas en el changuito lo que hace
 *  falta es ver muchas de una y poder corregir sin cambiar de vista. */
function LineaTicket({
  item,
  cadena,
  changuito,
}: {
  item: Item;
  cadena: string;
  changuito: Estado;
}) {
  const sub = subtotal(item, cadena);
  const [expandido, setExpandido] = useState(false);

  return (
    <View style={estilos.ticketLinea}>
      <Pressable style={estilos.ticketTexto} onPress={() => setExpandido(!expandido)}>
        <Text style={estilos.ticketNombre} numberOfLines={expandido ? undefined : 1}>
          {item.nombre}
        </Text>
      </Pressable>

      <View style={estilos.ticketControles}>
        <Pressable
          style={estilos.botonChico}
          onPress={() => changuito.cambiarCantidad(item.grupoId, -1)}
        >
          <Text style={estilos.botonChicoTexto}>-</Text>
        </Pressable>
        <Text style={[estilos.ticketCantidad, item.porPeso && estilos.ticketCantidadPeso]}>
          {item.porPeso ? cantidadTexto(item) : item.cantidad}
        </Text>
        <Pressable
          style={estilos.botonChico}
          onPress={() => changuito.cambiarCantidad(item.grupoId, 1)}
        >
          <Text style={estilos.botonChicoTexto}>+</Text>
        </Pressable>
      </View>

      <Text style={estilos.ticketImporte}>{sub === null ? '—' : plata(sub)}</Text>

      <Pressable
        style={estilos.tachoChico}
        onPress={() => changuito.quitar(item.grupoId)}
        hitSlop={6}
      >
        <MaterialIcons name="delete-outline" size={17} color={tema.suave} />
      </Pressable>
    </View>
  );
}

export function ChanguitoPantalla({
  changuito,
  historial,
  onCerrada,
}: {
  changuito: Estado;
  historial: Historial;
  onCerrada: () => void;
}) {
  const { items, cadena, setCadena } = changuito;
  const [agregando, setAgregando] = useState(false);
  const [vista, setVista] = useState<Vista>('lista');
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const [confirmandoCaja, setConfirmandoCaja] = useState(false);
  // Medimos el area util para que el boton no se pueda arrastrar fuera de ella.
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });

  // Atras cierra lo que este abierto, de lo mas puntual a lo mas general.
  useAtras(agregando, () => setAgregando(false));
  useAtras(confirmandoCaja, () => setConfirmandoCaja(false));
  useAtras(confirmandoVaciar, () => setConfirmandoVaciar(false));

  const porCadena = totales(items);
  // Si todavia no elegiste donde estas comprando, asumimos la cadena que tiene
  // todos los productos del changuito y sale mas barata.
  const activa = cadena ?? porCadena[0]?.cadena ?? null;
  // Un changuito de puros items manuales no tiene cadena, pero tiene total:
  // el precio que tipeaste vale igual. Sin esto marcaria cero.
  const clave = activa ?? 'manual';
  const total = totalDe(items, clave);
  const laActiva = porCadena.find((t) => t.cadena === activa);

  const pasarPorCaja = async () => {
    await historial.guardar(
      items,
      activa,
      activa ? corto(activa, laActiva?.tienda ?? activa) : 'Cargado a mano',
      (i) => {
        const s = subtotal(i, clave);
        return s === null ? null : s / i.cantidad;
      },
    );
    changuito.vaciar();
    onCerrada();
  };

  if (items.length === 0) {
    return (
      <View
        style={estilos.raiz}
        onLayout={(e) => setCaja({
          ancho: e.nativeEvent.layout.width,
          alto: e.nativeEvent.layout.height,
        })}
      >
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>El changuito esta vacio</Text>
          <Text style={estilos.vacioTexto}>
            Toca el + y escribi el nombre o el codigo de lo que pusiste en el carro. El total se
            va actualizando mientras caminas el super, asi llegas a la caja sabiendo cuanto vas
            a pagar.
          </Text>
        </View>
        {agregando ? (
          <>
            <Pressable style={estilos.telon} onPress={() => setAgregando(false)} />
            <AgregarRapido changuito={changuito} onCerrar={() => setAgregando(false)} />
          </>
        ) : (
          <Fab onPress={() => setAgregando(true)} caja={caja} />
        )}
      </View>
    );
  }

  return (
    <View
      style={estilos.raiz}
      onLayout={(e) => setCaja({
        ancho: e.nativeEvent.layout.width,
        alto: e.nativeEvent.layout.height,
      })}
    >
      <View style={estilos.contenedor}>
        <View style={[estilos.totalCaja, { backgroundColor: colorDe(activa) }]}>
          <Text style={estilos.totalEtiqueta}>
            Total en {activa ? corto(activa, laActiva?.tienda ?? activa) : 'lo cargado a mano'}
          </Text>
          <Text style={estilos.totalNumero}>{plata(total)}</Text>
          <Text style={estilos.totalDetalle}>
            {changuito.unidades} {changuito.unidades === 1 ? 'unidad' : 'unidades'}
            {laActiva && laActiva.faltantes > 0 ? ` · ${laActiva.faltantes} sin precio aca` : ''}
          </Text>
        </View>

        <View style={estilos.selector}>
          {porCadena.map((t) => (
            <Pressable
              key={t.cadena}
              style={[
                estilos.opcion,
                t.cadena === activa && estilos.opcionActiva,
                t.cadena === activa && { borderColor: colorDe(t.cadena) },
              ]}
              onPress={() => setCadena(t.cadena)}
            >
              <Text
                style={[
                  estilos.opcionNombre,
                  t.cadena === activa && { color: colorDe(t.cadena), fontWeight: '600' },
                ]}
              >
                {corto(t.cadena, t.tienda)}
              </Text>
              <Text
                style={[estilos.opcionPrecio, t.cadena === activa && { color: colorDe(t.cadena) }]}
              >
                {plata(t.totalCentavos)}
              </Text>
              {t.faltantes > 0 && <Text style={estilos.opcionFalta}>faltan {t.faltantes}</Text>}
            </Pressable>
          ))}
        </View>

        <View style={estilos.vistas}>
          <Pressable onPress={() => setVista('lista')}>
            <Text style={[estilos.vistaTexto, vista === 'lista' && estilos.vistaActiva]}>
              Detallado
            </Text>
          </Pressable>
          <Pressable onPress={() => setVista('ticket')}>
            <Text style={[estilos.vistaTexto, vista === 'ticket' && estilos.vistaActiva]}>
              Compactado
            </Text>
          </Pressable>
        </View>

        <FlatList
          data={items}
          keyExtractor={(i) => i.grupoId}
          renderItem={({ item }) =>
            vista === 'lista' ? (
              <Linea item={item} cadena={clave} changuito={changuito} />
            ) : (
              <LineaTicket item={item} cadena={clave} changuito={changuito} />
            )
          }
          contentContainerStyle={vista === 'ticket' ? estilos.ticket : estilos.lista}
          ListFooterComponent={
            vista === 'ticket' ? (
              <View style={estilos.ticketPie}>
                <Text style={estilos.ticketPieTexto}>TOTAL</Text>
                <Text style={estilos.ticketPieNumero}>{plata(total)}</Text>
              </View>
            ) : null
          }
        />

        {/* Mientras el panel de agregar esta abierto el pie se retira: si no,
            el boton de caja queda asomando por detras del panel. */}
        {!agregando && (
          <>
            <Pressable style={estilos.caja} onPress={() => setConfirmandoCaja(true)}>
              <Text style={estilos.cajaTexto}>Pasar por caja · {plata(total)}</Text>
            </Pressable>

            <Pressable onPress={() => setConfirmandoVaciar(true)}>
              <Text style={estilos.vaciar}>Vaciar sin guardar</Text>
            </Pressable>
          </>
        )}
      </View>

      {agregando ? (
        <>
          {/* Tocar afuera cierra, que es lo que uno intenta por reflejo. */}
          <Pressable style={estilos.telon} onPress={() => setAgregando(false)} />
          <AgregarRapido changuito={changuito} onCerrar={() => setAgregando(false)} />
        </>
      ) : (
        <Fab onPress={() => setAgregando(true)} caja={caja} />
      )}

      <Confirmacion
        visible={confirmandoCaja}
        titulo="Cerrar la compra"
        destacado={plata(total)}
        detalle={`${changuito.unidades} ${changuito.unidades === 1 ? 'unidad' : 'unidades'}${
          activa ? ` en ${corto(activa, laActiva?.tienda ?? activa)}` : ''
        }. Se guarda en el historial y el changuito queda vacio.`}
        confirmar="Pasar por caja"
        onConfirmar={() => { setConfirmandoCaja(false); void pasarPorCaja(); }}
        onCancelar={() => setConfirmandoCaja(false)}
      />

      <Confirmacion
        visible={confirmandoVaciar}
        titulo="Vaciar el changuito"
        destacado={`${changuito.unidades} ${changuito.unidades === 1 ? 'unidad' : 'unidades'}`}
        detalle="Se descarta sin guardar nada en el historial. No se puede deshacer."
        confirmar="Vaciar"
        peligro
        onConfirmar={() => { changuito.vaciar(); setConfirmandoVaciar(false); }}
        onCancelar={() => setConfirmandoVaciar(false)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: { flex: 1 },
  telon: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(17, 24, 28, 0.35)',
  },
  contenedor: { flex: 1, paddingHorizontal: 16 },
  totalCaja: { backgroundColor: tema.texto, borderRadius: 12, padding: 16, marginBottom: 12 },
  totalEtiqueta: { color: '#aeb6bb', fontSize: 13 },
  totalNumero: {
    color: '#fff', fontSize: 34, fontWeight: '700',
    fontVariant: ['tabular-nums'], marginVertical: 2,
  },
  totalDetalle: { color: '#aeb6bb', fontSize: 12 },
  selector: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  opcion: {
    flex: 1, borderWidth: 1, borderColor: tema.borde, backgroundColor: tema.tarjeta,
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center',
  },
  opcionActiva: { borderWidth: 2, backgroundColor: tema.tarjeta },
  opcionNombre: { fontSize: 12, color: tema.suave },
  opcionPrecio: { fontSize: 14, fontWeight: '600', color: tema.texto, fontVariant: ['tabular-nums'] },
  opcionTextoActivo: { color: tema.acento },
  opcionFalta: { fontSize: 10, color: tema.alerta },
  vistas: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  vistaTexto: { fontSize: 13, color: tema.suave, paddingVertical: 4 },
  vistaActiva: { color: tema.acento, fontWeight: '700' },
  lista: { paddingBottom: 8 },
  linea: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: tema.tarjeta,
    borderWidth: 1, borderColor: tema.borde, borderRadius: 10,
    padding: 10, marginBottom: 8, gap: 8,
  },
  miniatura: {
    width: 40, height: 40, borderRadius: 6,
    backgroundColor: tema.fondo, borderWidth: 1, borderColor: tema.borde,
  },
  miniaturaVacia: { opacity: 0.5 },
  lineaTexto: { flex: 1 },
  lineaNombre: { fontSize: 14, color: tema.texto },
  lineaSub: { fontSize: 12, color: tema.suave, marginTop: 2 },
  faltante: { fontSize: 12, color: tema.alerta, marginTop: 2 },
  controles: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boton: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: tema.fondo,
    borderWidth: 1, borderColor: tema.borde, alignItems: 'center', justifyContent: 'center',
  },
  botonTexto: { fontSize: 17, color: tema.texto, lineHeight: 20 },
  cantidad: { minWidth: 20, textAlign: 'center', fontSize: 15, color: tema.texto },
  cantidadPeso: { minWidth: 58, fontSize: 13, fontVariant: ['tabular-nums'] },
  tacho: { paddingLeft: 4, paddingVertical: 4 },
  tachoChico: { paddingLeft: 2, paddingVertical: 2 },
  subtotal: {
    minWidth: 70, textAlign: 'right', fontSize: 15, fontWeight: '600',
    color: tema.texto, fontVariant: ['tabular-nums'],
  },
  ticket: {
    backgroundColor: tema.tarjeta, borderWidth: 1, borderColor: tema.borde,
    borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8,
  },
  ticketLinea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: tema.fondo,
  },
  ticketTexto: { flex: 1 },
  ticketNombre: { fontSize: 13, color: tema.texto },
  ticketControles: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  botonChico: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: tema.fondo,
    borderWidth: 1,
    borderColor: tema.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonChicoTexto: { fontSize: 14, lineHeight: 16, color: tema.texto },
  ticketCantidad: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 13,
    color: tema.texto,
    fontVariant: ['tabular-nums'],
  },
  ticketCantidadPeso: { minWidth: 52, fontSize: 11 },
  ticketImporte: {
    minWidth: 68, textAlign: 'right', fontSize: 13,
    color: tema.texto, fontVariant: ['tabular-nums'],
  },
  ticketPie: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: tema.borde, marginTop: 6, paddingTop: 8,
  },
  ticketPieTexto: { fontSize: 13, fontWeight: '700', color: tema.texto, letterSpacing: 1 },
  ticketPieNumero: {
    fontSize: 15, fontWeight: '700', color: tema.texto, fontVariant: ['tabular-nums'],
  },
  caja: {
    backgroundColor: tema.barato, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  cajaTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  vaciar: { color: tema.suave, textAlign: 'center', paddingVertical: 10, fontSize: 13 },
  vacio: { flex: 1, paddingHorizontal: 32, paddingTop: 48, alignItems: 'center' },
  vacioTitulo: { fontSize: 17, fontWeight: '600', color: tema.texto, marginBottom: 8 },
  vacioTexto: { fontSize: 14, color: tema.suave, textAlign: 'center', lineHeight: 20 },
});
