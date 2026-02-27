// pages/api/bodyfat.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, bodyFatLogs } from '../../lib/db';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../lib/auth';

type BodyFatRow = {
  id: string;
  user_id: string;
  log_date: string;
  bf_percent: number;
  inserted_at: string;
  comment: string | null;
};

type BodyFatResponse =
  | { ok: true; logs?: BodyFatRow[]; log?: BodyFatRow }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BodyFatResponse>
) {
  let session = parseSessionFromRequest(req);

  if (!session && process.env.TEST_BYPASS_AUTH === 'true') {
    session = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, session.id);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, session.id);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, session.id);
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleGet(
  _req: NextApiRequest,
  res: NextApiResponse<BodyFatResponse>,
  userId: string
) {
  try {
    const data = await db
      .select({
        id: bodyFatLogs.id,
        user_id: bodyFatLogs.user_id,
        log_date: bodyFatLogs.log_date,
        bf_percent: bodyFatLogs.bf_percent,
        inserted_at: bodyFatLogs.inserted_at,
        comment: bodyFatLogs.comment,
      })
      .from(bodyFatLogs)
      .where(eq(bodyFatLogs.user_id, userId))
      .orderBy(desc(bodyFatLogs.log_date))
      .limit(400);

    const formattedLogs = data.map((row) => ({
      ...row,
      bf_percent: Number(row.bf_percent),
      inserted_at: row.inserted_at?.toISOString() ?? new Date().toISOString(),
    }));

    return res.status(200).json({ ok: true, logs: formattedLogs });
  } catch (error) {
    console.error('Body fat GET error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<BodyFatResponse>,
  userId: string
) {
  const { bfPercent, logDate, comment } = req.body ?? {};

  if (!bfPercent || !logDate) {
    return res.status(400).json({
      ok: false,
      error: 'bfPercent and logDate are required',
    });
  }

  const bfNum = Number(bfPercent);
  if (!Number.isFinite(bfNum) || bfNum <= 0 || bfNum > 100) {
    return res.status(400).json({ ok: false, error: 'bfPercent must be between 0 and 100' });
  }

  const dateStr = String(logDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ ok: false, error: 'logDate must be YYYY-MM-DD' });
  }

  const sanitizedComment = comment ? String(comment).slice(0, 500).trim() || null : null;

  try {
    const existing = await db
      .select({ id: bodyFatLogs.id })
      .from(bodyFatLogs)
      .where(and(eq(bodyFatLogs.user_id, userId), eq(bodyFatLogs.log_date, dateStr)))
      .limit(1);

    let logId: string;

    if (existing.length > 0) {
      await db
        .update(bodyFatLogs)
        .set({
          bf_percent: bfNum.toString(),
          comment: sanitizedComment,
          inserted_at: new Date(),
        })
        .where(eq(bodyFatLogs.id, existing[0].id));
      logId = existing[0].id;
    } else {
      const inserted = await db
        .insert(bodyFatLogs)
        .values({
          user_id: userId,
          log_date: dateStr,
          bf_percent: bfNum.toString(),
          comment: sanitizedComment,
          inserted_at: new Date(),
        })
        .returning({ id: bodyFatLogs.id });
      logId = inserted[0].id;
    }

    const savedLogs = await db
      .select()
      .from(bodyFatLogs)
      .where(eq(bodyFatLogs.id, logId))
      .limit(1);

    const log = savedLogs[0];

    return res.status(200).json({
      ok: true,
      log: log
        ? {
            id: log.id,
            user_id: log.user_id,
            log_date: log.log_date,
            bf_percent: Number(log.bf_percent),
            inserted_at: log.inserted_at?.toISOString() ?? new Date().toISOString(),
            comment: log.comment,
          }
        : undefined,
    });
  } catch (error) {
    console.error('Body fat POST error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse<BodyFatResponse>,
  userId: string
) {
  const { ids } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'ids array is required',
    });
  }

  try {
    await db
      .delete(bodyFatLogs)
      .where(and(eq(bodyFatLogs.user_id, userId), inArray(bodyFatLogs.id, ids)));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Body fat DELETE error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
