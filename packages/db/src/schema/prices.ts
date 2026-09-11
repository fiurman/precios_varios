import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, integer, text, char, bigserial, bigint, timestamp, index, primaryKey,
} from 'drizzle-orm/pg-core';
import { products } from './products.js';
import { stores } from './stores.js';

/** Historial append-only. Nunca se hace UPDATE aca: cada scrapeo inserta.
 *  Es lo que permite responder "¿esto aumento?". */
export const prices = pgTable(
  'prices',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),

    priceCents: integer('price_cents').notNull(), // centavos enteros, jamas float
    promoCents: integer('promo_cents'),
    promoLabel: text('promo_label'),
    currency: char('currency', { length: 3 }).notNull().default('ARS'),

    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    scrapeRunId: uuid('scrape_run_id'),
  },
  (t) => [index('idx_prices_lookup').on(t.productId, t.storeId, t.capturedAt.desc())],
);

/** Precio vigente desnormalizado: una fila por producto/sucursal.
 *  Es lo que el celular baja en modo Light. Se pisa en cada scrapeo. */
export const currentPrices = pgTable(
  'current_prices',
  {
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    priceCents: integer('price_cents').notNull(),
    promoCents: integer('promo_cents'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    revision: bigint('revision', { mode: 'number' })
      .notNull()
      .default(sql`nextval('global_revision_seq')`),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.storeId] }),
    index('idx_current_prices_revision').on(t.revision),
  ],
);
