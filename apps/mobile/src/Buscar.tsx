import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Grupo } from './api';
import { buscar } from './catalogo';
import type { Changuito } from './changuito';
import { TarjetaProducto } from './TarjetaProducto';
import { tema } from './tema';

export function Buscar({ changuito }: { changuito: Changuito }) {
  // Donde estoy parado lo decide el selector de arriba, no esta pantalla.
  const cadena = changuito.cadena ?? undefined;
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<Grupo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busco, setBusco] = useState(false);

  const lanzar = useCallback(async () => {
    if (termino.trim().length < 2) return;
    setCargando(true);
    setError(null);
    setBusco(true);
    try {
      setResultados(await buscar(termino.trim(), cadena));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos conectar con la API');
      setResultados([]);
    } finally {
      setCargando(false);
    }
  }, [termino, cadena]);

  // Al cambiar de cadena rebuscamos solo si ya habia una busqueda hecha:
  // filtrar sin termino no tiene sentido.
  useEffect(() => {
    if (busco) void lanzar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadena]);

  return (
    <View style={estilos.contenedor}>
      <TextInput
        style={estilos.input}
        placeholder="Buscar: yerba, aceite, shampoo..."
        placeholderTextColor={tema.suave}
        value={termino}
        onChangeText={setTermino}
        onSubmitEditing={lanzar}
        returnKeyType="search"
        autoCorrect={false}
      />

      {cargando && <ActivityIndicator style={estilos.centro} color={tema.acento} />}
      {error && <Text style={estilos.error}>{error}</Text>}
      {!cargando && !error && busco && resultados.length === 0 && (
        <Text style={estilos.vacio}>No encontramos nada con ese nombre.</Text>
      )}

      <FlatList
        data={resultados}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => (
          <TarjetaProducto
            grupo={item}
            onAgregar={changuito.agregar}
            enChanguito={changuito.items.find((i) => i.grupoId === item.id)?.cantidad}
          />
        )}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, paddingHorizontal: 16 },
  input: {
    backgroundColor: tema.tarjeta,
    borderWidth: 1,
    borderColor: tema.borde,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: tema.texto,
  },
  lista: { paddingTop: 12, paddingBottom: 24 },
  centro: { marginTop: 24 },
  error: { color: tema.alerta, marginTop: 16, fontSize: 14 },
  vacio: { color: tema.suave, marginTop: 16, fontSize: 14 },
});
