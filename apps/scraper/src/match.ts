import { sql } from 'drizzle-orm';
import { db, pool, productMatches } from '@precios/db';
import { contenidoBase, jaccard, nameTokens, toNormalizedName } from './normalize.js';

/** Empareja los productos de una cadena sin EAN contra los de otra que si lo
 *  publica. No toca products: escribe candidatos en product_matches con su
 *  score, para revisar y aplicar aparte. */

const SIN_EAN = 'cooperativa_obrera';
const CON_EAN = 'disco';

/** Cuanto puede diferir el gramaje y seguir siendo el mismo producto. Cubre el
 *  redondeo de "0.29 kg" contra "290 grs", no un envase distinto. */
const TOLERANCIA = 0.02;

/** Con gramaje coincidente el nombre puede ser mas laxo; sin el, es lo unico
 *  que queda y hay que exigirle bastante mas. */
const UMBRAL = {
  conGramaje: { auto: 0.7, pendiente: 0.45 },
  sinGramaje: { auto: 0.85, pendiente: 0.6 },
};

interface Fila {
  id: string;
  name: string;
  brand: string | null;
  ean13: string | null;
  contentValue: string | null;
  contentUnit: string | null;
}

async function traerCadena(chain: string, conEan: boolean): Promise<Fila[]> {
  const { rows } = await pool.query<Fila>(
    `select p.id, p.name, p.brand, p.ean13,
            p.content_value as "contentValue", p.content_unit as "contentUnit"
       from products p
       join product_sources s on s.product_id = p.id
      where s.chain = $1
        and p.deleted_at is null
        and p.brand is not null
        and p.ean13 is ${conEan ? 'not null' : 'null'}`,
    [chain],
  );
  return rows;
}

const claveMarca = (b: string | null) => toNormalizedName(b ?? '');

async function main(): Promise<void> {
  const izquierda = await traerCadena(SIN_EAN, false);
  const derecha = await traerCadena(CON_EAN, true);

  console.log(`Emparejando ${izquierda.length} productos sin EAN contra ${derecha.length} con EAN.\n`);

  // La marca es el ancla: sin ella el espacio de comparacion es inmanejable y
  // el nombre solo no alcanza para decidir.
  const porMarca = new Map<string, Fila[]>();
  for (const d of derecha) {
    const k = claveMarca(d.brand);
    if (!k) continue;
    const lista = porMarca.get(k);
    if (lista) lista.push(d);
    else porMarca.set(k, [d]);
  }

  const aGuardar: {
    productId: string; matchProductId: string; ean13: string | null;
    score: string; strategy: string; status: string;
  }[] = [];

  let sinMarcaEnLaOtra = 0;
  let descartados = 0;

  for (const c of izquierda) {
    const candidatos = porMarca.get(claveMarca(c.brand));
    if (!candidatos) { sinMarcaEnLaOtra++; continue; }

    const tokensC = nameTokens(c.name, c.brand);
    const contC = contenidoBase(c.contentValue, c.contentUnit);

    let mejor: { fila: Fila; score: number; conGramaje: boolean } | null = null;

    for (const d of candidatos) {
      const contD = contenidoBase(d.contentValue, d.contentUnit);

      // Si los dos declaran contenido en la misma unidad, tiene que coincidir:
      // es el unico dato objetivo que tenemos y un envase distinto es otro EAN.
      let conGramaje = false;
      if (contC && contD && contC.unidad === contD.unidad) {
        const diff = Math.abs(contC.valor - contD.valor) / Math.max(contC.valor, contD.valor);
        if (diff > TOLERANCIA) continue;
        conGramaje = true;
      }

      const score = jaccard(tokensC, nameTokens(d.name, d.brand));
      if (!mejor || score > mejor.score) mejor = { fila: d, score, conGramaje };
    }

    if (!mejor) { descartados++; continue; }

    const umbral = mejor.conGramaje ? UMBRAL.conGramaje : UMBRAL.sinGramaje;
    const status =
      mejor.score >= umbral.auto ? 'auto' : mejor.score >= umbral.pendiente ? 'pendiente' : null;

    if (status === null) { descartados++; continue; }

    aGuardar.push({
      productId: c.id,
      matchProductId: mejor.fila.id,
      ean13: mejor.fila.ean13,
      score: mejor.score.toFixed(3),
      strategy: mejor.conGramaje ? 'marca_gramaje_nombre' : 'marca_nombre',
      status,
    });
  }

  // Recalcular no debe pisar lo que una persona ya decidio.
  for (let i = 0; i < aGuardar.length; i += 500) {
    await db.insert(productMatches).values(aGuardar.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [productMatches.productId, productMatches.matchProductId],
        set: {
          score: sql`excluded.score`,
          strategy: sql`excluded.strategy`,
          status: sql`excluded.status`,
          ean13: sql`excluded.ean13`,
          updatedAt: new Date(),
        },
        setWhere: sql`${productMatches.status} in ('auto','pendiente')`,
      });
  }

  const auto = aGuardar.filter((m) => m.status === 'auto').length;
  console.log(`  auto (score alto):  ${auto}`);
  console.log(`  pendientes:         ${aGuardar.length - auto}`);
  console.log(`  sin marca en ${CON_EAN}: ${sinMarcaEnLaOtra}`);
  console.log(`  sin candidato bueno:     ${descartados}`);
  console.log(`\nGuardados ${aGuardar.length} pares en product_matches.`);
}

try {
  await main();
} finally {
  await pool.end();
}
