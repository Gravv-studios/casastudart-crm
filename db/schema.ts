import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', {
  id: text('id').primaryKey(), kind: text('kind').notNull(),
  payload: text('payload').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [index('idx_records_kind').on(table.kind)]);
export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(), entityId: text('entity_id').notNull(),
  action: text('action').notNull(), label: text('label').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [index('idx_activity_created_at').on(table.createdAt)]);