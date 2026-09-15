import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { aPagar, plata, type Grupo } from './api';
import { buscar, porEan } from './catalogo';
import { useDesplazamientoTeclado } from './teclado';
import type { Changuito } from './changuito';
import { tema } from './tema';

/** Un numero largo es un codigo de barras; cualquier otra cosa es un nombre.
 *  Un solo campo para las dos cosas: en la gondola no se elige de que tipo es
 *  lo que estas por tipear, se tipea y listo. */
const esCodigo = (texto: string) => /^\d{8,13}$/.test(texto.trim());

/** Cuanto espera antes de dar por cerrada la cuenta de toques. */
const ESPERA = 2000;

/** "12,50" y "12.50" son lo mismo escribiendo rapido con una mano. */
const centavos = (texto: string): number | null => {
  const n = Number.parseFloat(texto.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

type Modo = 'buscar' | 'manual';

export function AgregarRapido({
  changuito,
  onCerrar,
}: {
  changuito: Changuito;
  onCerrar: () => void;
}) {
  const cadena = changuito.cadena ?? undefined;
  const { desplazamiento, alto } = useDesplazamientoTeclado();
  const [modo, setModo] = useState<Modo>('buscar');
  const [texto, setTexto] = useState('');
  const [precio, setPrecio] = useState('');
  const [resultados, setResultados] = useState<Grupo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);
  // Lo que estas sumando a toques pero todavia no se confirmo.
  const [pendiente, setPendiente] = useState<{ grupo: Grupo; toques: number } | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campo = useRef<TextInput>(null);

  useEffect(() => { campo.current?.focus(); }, []);

  const consultar = useCallback(async (valor: string) => {
    const q = valor.trim();
    if (q.length < 2) { setResultados([]); return; }
    setCargando(true);
    setError(null);
    try {
      if (esCodigo(q)) setResultados([await porEan(q)]);
      else setResultados((await buscar(q, cadena)).slice(0, 8));
    } catch {
      // Que no encuentre no es un error: es el caso de cargarlo a mano.
      setResultados([]);
    } finally {
      setCargando(false);
    }
  }, [cadena]);

  // Buscamos mientras escribis, pero esperando a que frenes: si no, cada letra
  // dispara una consulta y llegan desordenadas.
  useEffect(() => {
    if (modo !== 'buscar') return;
    const t = setTimeout(() => void consultar(texto), 350);
    return () => clearTimeout(t);
  }, [texto, consultar, modo]);

  const limpiar = (nombre: string) => {
    setUltimo(nombre);
    setTexto('');
    setPrecio('');
    setResultados([]);
    campo.current?.focus();
  };

  /** Confirma lo acumulado y lo manda al changuito. */
  const confirmar = (p: { grupo: Grupo; toques: number }) => {
    changuito.agregar(p.grupo, p.toques);
    setUltimo(p.toques > 1 ? `${p.toques} × ${p.grupo.nombre}` : p.grupo.nombre);
    setPendiente(null);
  };

  /** Suma o resta uno y reinicia la cuenta regresiva. Asi cargar cuatro
   *  yogures es tocar el mas cuatro veces seguidas, sin esperar a que la lista
   *  se rearme entre toque y toque. */
  const agregar = (grupo: Grupo, delta = 1) => {
    if (reloj.current) clearTimeout(reloj.current);

    // Si tocaste otro producto, lo anterior se confirma ya mismo.
    if (pendiente && pendiente.grupo.id !== grupo.id) confirmar(pendiente);

    const previos = pendiente && pendiente.grupo.id === grupo.id ? pendiente.toques : 0;
    const toques = previos + delta;

    // Bajar hasta cero es arrepentirse: no se agrega nada.
    if (toques <= 0) {
      setPendiente(null);
      return;
    }

    const siguiente = { grupo, toques };
    setPendiente(siguiente);
    reloj.current = setTimeout(() => confirmar(siguiente), ESPERA);
  };

  // Nada puede quedar colgado. Si el panel se cierra de cualquier forma —el
  // boton Listo, un toque afuera— lo que estabas contando entra igual. Perder
  // tres yogures porque cerraste antes de que corriera el reloj seria peor que
  // no tener el contador.
  const pendienteRef = useRef<{ grupo: Grupo; toques: number } | null>(null);
  pendienteRef.current = pendiente;

  const changuitoRef = useRef(changuito);
  changuitoRef.current = changuito;

  useEffect(() => () => {
    if (reloj.current) clearTimeout(reloj.current);
    const p = pendienteRef.current;
    if (p) changuitoRef.current.agregar(p.grupo, p.toques);
  }, []);

  const agregarAMano = () => {
    const c = centavos(precio);
    const nombre = texto.trim();
    if (!c || nombre.length < 2) return;
    changuito.agregarManual(nombre, c, changuito.cadena);
    limpiar(nombre);
  };

  const sinResultados =
    modo === 'buscar' && !cargando && texto.trim().length >= 2 && resultados.length === 0;

  return (
    <View
      style={[
        estilos.panel,
        // Se levanta lo que mida el teclado, y se limita para que la lista se
        // encoja en vez de empujar el campo de texto fuera de la pantalla.
        { bottom: desplazamiento, maxHeight: alto - desplazamiento - 90 },
      ]}
    >
      {/* Orden invertido a proposito: los resultados van ARRIBA y el campo
          abajo de todo, pegado al teclado. Al reves, el teclado tapaba
          justamente las opciones que hay que tocar. */}
      <View style={estilos.modos}>
        <Pressable onPress={() => setModo('buscar')}>
          <Text style={[estilos.modo, modo === 'buscar' && estilos.modoActivo]}>Buscar</Text>
        </Pressable>
        <Pressable onPress={() => setModo('manual')}>
          <Text style={[estilos.modo, modo === 'manual' && estilos.modoActivo]}>A mano</Text>
        </Pressable>
        <View style={estilos.empuje} />
        <Pressable
          onPress={() => {
            if (reloj.current) clearTimeout(reloj.current);
            if (pendiente) confirmar(pendiente);
            onCerrar();
          }}
        >
          <Text style={estilos.cerrarTexto}>Listo</Text>
        </Pressable>
      </View>

      {modo === 'buscar' && resultados.length > 0 && (
        <ScrollView style={estilos.lista} keyboardShouldPersistTaps="handled">
          {resultados.map((g) => {
            const barato = aPagar(g.masBarato);
            const yaTiene = changuito.items.find((i) => i.grupoId === g.id)?.cantidad;
            const contando = pendiente?.grupo.id === g.id;
            return (
              <View key={g.id} style={estilos.opcion}>
                {g.imagen ? (
                  <Image source={{ uri: g.imagen }} style={estilos.miniatura} resizeMode="contain" />
                ) : (
                  <View style={[estilos.miniatura, estilos.miniaturaVacia]} />
                )}
                <View style={estilos.opcionTexto}>
                  <Text style={estilos.opcionNombre} numberOfLines={2}>{g.nombre}</Text>
                  <Text style={estilos.opcionMeta}>
                    {plata(barato)} {g.porPeso ? 'el kilo' : ''} en {g.masBarato.tienda}
                    {g.ofertas.length > 1 ? ` · ${g.ofertas.length} cadenas` : ''}
                    {yaTiene ? ` · llevas ${yaTiene}` : ''}
                  </Text>
                </View>

                {/* Mas y menos explicitos: el contador solo no dice que hacer
                    con el, y tocar un numero para que suba no se adivina. */}
                {contando ? (
                  <View style={estilos.controles}>
                    <Pressable style={estilos.paso} onPress={() => agregar(g, -1)}>
                      <Text style={estilos.pasoTexto}>-</Text>
                    </Pressable>
                    <View style={estilos.contador}>
                      <Text style={estilos.contadorTexto}>{pendiente.toques}</Text>
                    </View>
                    <Pressable style={estilos.paso} onPress={() => agregar(g, 1)}>
                      <Text style={estilos.pasoTexto}>+</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={estilos.masBoton} onPress={() => agregar(g, 1)}>
                    <Text style={estilos.masTexto}>+</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {ultimo && <Text style={estilos.agregado}>Agregado: {ultimo}</Text>}
      {cargando && <ActivityIndicator style={estilos.cargando} color={tema.acento} />}
      {error && <Text style={estilos.error}>{error}</Text>}

      {(modo === 'manual' || sinResultados) && (
        <View style={estilos.manual}>
          {sinResultados && modo === 'buscar' && (
            <Text style={estilos.manualTitulo}>No lo encontramos. Ponele el precio del cartel:</Text>
          )}
          <View style={estilos.manualFila}>
            <TextInput
              style={estilos.manualPrecio}
              placeholder="$ precio"
              placeholderTextColor={tema.suave}
              value={precio}
              onChangeText={setPrecio}
              onSubmitEditing={agregarAMano}
              keyboardType="decimal-pad"
              inputMode="decimal"
            />
            <Pressable
              style={[
                estilos.manualBoton,
                (!centavos(precio) || texto.trim().length < 2) && estilos.manualBotonOff,
              ]}
              disabled={!centavos(precio) || texto.trim().length < 2}
              onPress={agregarAMano}
            >
              <Text style={estilos.manualBotonTexto}>Agregar al changuito</Text>
            </Pressable>
          </View>
        </View>
      )}

      <TextInput
        ref={campo}
        style={estilos.input}
        placeholder={modo === 'buscar' ? 'Nombre o codigo de barras' : 'Que pusiste en el carro'}
        placeholderTextColor={tema.suave}
        value={texto}
        onChangeText={(t) => { setTexto(t); setUltimo(null); }}
        onSubmitEditing={() => {
          if (modo === 'manual') agregarAMano();
          else if (resultados[0]) agregar(resultados[0]);
        }}
        returnKeyType="done"
        autoCorrect={false}
        inputMode={modo === 'buscar' && esCodigo(texto) ? 'numeric' : 'text'}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: tema.tarjeta,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: tema.borde,
    padding: 12,
    gap: 8,
    // Hacia arriba: el panel se apoya en el borde de abajo de la pantalla.
    boxShadow: '0px -4px 12px rgba(0, 0, 0, 0.12)',
    elevation: 12,
  },
  modos: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  modo: { fontSize: 14, color: tema.suave, paddingVertical: 2 },
  modoActivo: { color: tema.acento, fontWeight: '700' },
  empuje: { flex: 1 },
  cerrarTexto: { color: tema.acento, fontWeight: '600', fontSize: 15 },
  input: {
    backgroundColor: tema.fondo,
    borderWidth: 1,
    borderColor: tema.borde,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: tema.texto,
  },
  manual: {
    backgroundColor: tema.fondo,
    borderWidth: 1,
    borderColor: tema.borde,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  manualTitulo: { fontSize: 12, color: tema.suave },
  manualFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualPrecio: {
    width: 100,
    backgroundColor: tema.tarjeta,
    borderWidth: 1,
    borderColor: tema.borde,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    color: tema.texto,
    fontVariant: ['tabular-nums'],
  },
  manualBoton: {
    flex: 1,
    backgroundColor: tema.acento,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  manualBotonOff: { opacity: 0.4 },
  manualBotonTexto: { color: '#fff', fontWeight: '600', fontSize: 14 },
  manualNota: { fontSize: 11, color: tema.suave, lineHeight: 15 },
  agregado: { color: tema.barato, fontSize: 13 },
  cargando: { marginVertical: 6 },
  error: { color: tema.alerta, fontSize: 13 },
  lista: { flexShrink: 1 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: tema.borde,
  },
  miniatura: {
    width: 36, height: 36, borderRadius: 6,
    backgroundColor: tema.fondo, borderWidth: 1, borderColor: tema.borde,
  },
  miniaturaVacia: { opacity: 0.5 },
  opcionTexto: { flex: 1 },
  opcionNombre: { fontSize: 14, color: tema.texto },
  opcionMeta: { fontSize: 12, color: tema.suave, marginTop: 2 },
  masBoton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tema.acento,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masTexto: { color: '#fff', fontSize: 22, lineHeight: 25, fontWeight: '400' },
  controles: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  paso: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tema.borde,
    backgroundColor: tema.fondo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasoTexto: { fontSize: 17, lineHeight: 20, color: tema.texto },
  contador: {
    minWidth: 30,
    alignItems: 'center',
  },
  contadorTexto: { color: tema.acento, fontWeight: '700', fontSize: 17 },
});
