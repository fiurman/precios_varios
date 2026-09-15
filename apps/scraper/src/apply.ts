import { pool } from '@precios/db';

/** Vuelca los matches aceptados a products.canonical_product_id.
 *
 *  No fusiona ni borra nada: cada producto conserva su fila, su historial y sus
 *  precios, y solo queda apuntando a cual es el canonico del par. Por eso
 *  `npm run apply -- deshacer` alcanza para volver atras. */

const deshacer = (process.argv[2] ?? '') === 'deshacer';

async function aplicar(): Promise<void> {
  // Reconciliar primero: si un match se borro o se rechazo despues de haberse
  // aplicado, su puntero quedo colgado apuntando a un par que ya no existe.
  // Recalcular el matcher es normal, asi que esto tiene que autocorregirse.
  const { rowCount: huerfanos } = await pool.query(
    `update products p set canonical_product_id = null, updated_at = now()
      where p.canonical_product_id is not null
        and not exists (select 1 from product_matches m
                         where m.product_id = p.id and m.applied_at is not null)`,
  );
  if (huerfanos) console.log(`Punteros huerfanos limpiados: ${huerfanos}`);

  const { rows: [previo] } = await pool.query<{ pendientes: string }>(
    `select count(*) pendientes from product_matches
      where status in ('auto','confirmado') and applied_at is null`,
  );
  console.log(`Matches aceptados sin aplicar: ${previo!.pendientes}`);

  const { rowCount: apuntados } = await pool.query(
    `update products p
        set canonical_product_id = m.match_product_id, updated_at = now()
       from product_matches m
      where m.product_id = p.id
        and m.status in ('auto','confirmado')
        and m.applied_at is null
        and p.id <> m.match_product_id`,
  );

  await pool.query(
    `update product_matches set applied_at = now(), updated_at = now()
      where status in ('auto','confirmado') and applied_at is null`,
  );

  console.log(`Productos apuntados a su canonico: ${apuntados}`);
}

async function revertir(): Promise<void> {
  const { rowCount: limpiados } = await pool.query(
    `update products p set canonical_product_id = null, updated_at = now()
       from product_matches m
      where m.product_id = p.id and m.applied_at is not null`,
  );
  await pool.query(`update product_matches set applied_at = null, updated_at = now()
                     where applied_at is not null`);
  console.log(`Punteros borrados: ${limpiados}`);
}

try {
  if (deshacer) await revertir();
  else await aplicar();

  const { rows: [estado] } = await pool.query<{ con_canonico: string }>(
    `select count(*) con_canonico from products where canonical_product_id is not null`,
  );
  console.log(`Total de productos con canonico: ${estado!.con_canonico}`);
} finally {
  await pool.end();
}
