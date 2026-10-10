import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { TicketRecord } from "./formatters.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

if (config.databaseUrl) {
  try {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    pool.on("error", (err) => {
      logger.warn({ error: err.message }, "Database pool idle error");
    });
  } catch (err: any) {
    logger.warn({ error: err.message }, "Gagal menginisialisasi pool database PostgreSQL");
  }
}

export function getPool(): pg.Pool | null {
  return pool;
}

export async function findTicketByCode(ticketCode: string): Promise<TicketRecord | null> {
  const normalizedCode = ticketCode.trim().toUpperCase();

  // 1. Coba kueri langsung via PostgreSQL Pool jika tersedia
  if (pool) {
    try {
      const res = await pool.query(
        `
        SELECT
          r.ticket_code,
          r.status,
          r.revision_note,
          r.contact_phone,
          r.created_at,
          r.verified_at,
          t.name AS type_name,
          r.form_data->'resident'->>'name' AS resident_name
        FROM online_requests r
        JOIN letter_types t ON t.id = r.type_id
        WHERE UPPER(r.ticket_code) = $1
        LIMIT 1
      `,
        [normalizedCode],
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          ticket_code: row.ticket_code,
          type_name: row.type_name,
          status: row.status,
          resident_name: row.resident_name || undefined,
          created_at: row.created_at,
          verified_at: row.verified_at,
          revision_note: row.revision_note,
        };
      }
    } catch (err: any) {
      logger.warn(
        { error: err.message, ticket: normalizedCode },
        "Kueri database langsung gagal, beralih ke endpoint internal SIKEPEL",
      );
    }
  }

  // 2. Fallback ke endpoint internal SIKEPEL
  try {
    const targetUrl = new URL(
      `/api/internal/wa-bot/ticket-status?ticket=${encodeURIComponent(normalizedCode)}`,
      config.sikepelInternalUrl,
    );
    const headers: Record<string, string> = {};
    if (config.secret) {
      headers["Authorization"] = `Bearer ${config.secret}`;
    }

    const response = await fetch(targetUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(4000),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      if (data && data.ticket_code) {
        return data as TicketRecord;
      }
    }
  } catch (err: any) {
    logger.warn(
      { error: err.message, ticket: normalizedCode },
      "Pemanggilan endpoint internal SIKEPEL gagal",
    );
  }

  return null;
}
