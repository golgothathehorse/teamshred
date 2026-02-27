// pages/api/waist.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db, waistLogs } from '../../lib/db';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { parseSessionFromRequest } from '../../lib/auth';

type WaistRow = {
  id: string;
  user_id: string;
  log_date: string;
  waist_cm: number;
  inserted_at: string;
  comment: string | null;
};

type WaistResponse =
  | { ok: true; logs?: WaistRow[]; log?: WaistRow }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WaistResponse>
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
  res: NextApiResponse<WaistResponse>,
  userId: string
) {
  try {
    const data = await db
      .select({
        id: waistLogs.id,
        user_id: waistLogs.user_id,
        log_date: waistLogs.log_date,
        waist_cm: waistLogs.waist_cm,
        inserted_at: waistLogs.inserted_at,
        comment: waistLogs.comment,
      })
      .from(waistLogs)
      .where(eq(waistLogs.user_id, userId))
      .orderBy(desc(waistLogs.log_date))
      .limit(400);

    const formattedLogs = data.map((row) => ({
      ...row,
      waist_cm: Number(row.waist_cm),
      inserted_at: row.inserted_at?.toISOString() ?? new Date().toISOString(),
    }));

    return res.status(200).json({ ok: true, logs: formattedLogs });
  } catch (error) {
    console.error('Waist GET error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<WaistResponse>,
  userId: string
) {
  const { waistCm, logDate, comment } = req.body ?? {};

  if (!waistCm || !logDate) {
    return res.status(400).json({
      ok: false,
      error: 'waistCm and logDate are required',
    });
  }

  const waistNum = Number(waistCm);
  if (!Number.isFinite(waistNum) || waistNum <= 0 || waistNum > 300) {
    return res.status(400).json({ ok: false, error: 'waistCm must be between 0 and 300' });
  }

  const dateStr = String(logDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ ok: false, error: 'logDate must be YYYY-MM-DD' });
  }

  const sanitizedComment = comment ? String(comment).slice(0, 500).trim() || null : null;

  try {
    const existing = await db
      .select({ id: waistLogs.id })
      .from(waistLogs)
      .where(and(eq(waistLogs.user_id, userId), eq(waistLogs.log_date, dateStr)))
      .limit(1);

    let logId: string;

    if (existing.length > 0) {
      await db
        .update(waistLogs)
        .set({
          waist_cm: waistNum.toString(),
          comment: sanitizedComment,
          inserted_at: new Date(),
        })
        .where(eq(waistLogs.id, existing[0].id));
      logId = existing[0].id;
    } else {
      const inserted = await db
        .insert(waistLogs)
        .values({
          user_id: userId,
          log_date: dateStr,
          waist_cm: waistNum.toString(),
          comment: sanitizedComment,
          inserted_at: new Date(),
        })
        .returning({ id: waistLogs.id });
      logId = inserted[0].id;
    }

    const savedLogs = await db
      .select()
      .from(waistLogs)
      .where(eq(waistLogs.id, logId))
      .limit(1);

    const log = savedLogs[0];

    return res.status(200).json({
      ok: true,
      log: log
        ? {
            id: log.id,
            user_id: log.user_id,
            log_date: log.log_date,
            waist_cm: Number(log.waist_cm),
            inserted_at: log.inserted_at?.toISOString() ?? new Date().toISOString(),
            comment: log.comment,
          }
        : undefined,
    });
  } catch (error) {
    console.error('Waist POST error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse<WaistResponse>,
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
      .delete(waistLogs)
      .where(and(eq(waistLogs.user_id, userId), inArray(waistLogs.id, ids)));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Waist DELETE error:', error);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
}
