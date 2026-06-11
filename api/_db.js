import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = connectionString ? neon(connectionString) : null;
let schemaReady = false;

export function hasDatabase() {
  return Boolean(sql);
}

export async function ensureSchema() {
  if (!sql || schemaReady) return;

  await sql`
    create table if not exists submissions (
      id text primary key,
      display_name text not null,
      champion text,
      bracket jsonb not null,
      score integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create index if not exists submissions_leaderboard_idx
      on submissions (score desc, created_at asc)
  `;

  schemaReady = true;
}

export async function query(strings, ...values) {
  if (!sql) {
    throw new Error("DATABASE_URL is not configured");
  }

  return sql(strings, ...values);
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

