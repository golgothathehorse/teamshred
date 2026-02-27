// lib/db.ts
// Direct PostgreSQL connection using Drizzle ORM
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema";

const { Pool } = pg;

// Get database connection string - use DATABASE_URL secret ONLY
// This ensures both dev and production use the SAME database
function getConnectionString(): string {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    return envUrl;
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = getConnectionString();

console.log(`[DB] Using Replit PostgreSQL database`);

export const pool = new Pool({ 
  connectionString,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });

// Legacy query functions for gradual migration
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export * from "../shared/schema";
