import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/db';
import { challenges } from '@/shared/schema';
import { eq } from 'drizzle-orm';
import { parseSessionFromRequest } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = parseSessionFromRequest(req);
  if (!session) {
    return res.send(`<html><body style="background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:40px;"><h2>Not logged in</h2><p>Please <a href="/login" style="color:#60a5fa;">log in</a> first, then come back to this page.</p></body></html>`);
  }

  const uname = session.username?.toLowerCase() || '';
  if (uname !== 'nox' && uname !== 'kman') {
    return res.send(`<html><body style="background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:40px;"><h2>Access denied</h2><p>Admin or Kman only.</p></body></html>`);
  }

  const challengeId = '92ed02fb-9724-40b0-9e84-db49854248b1';

  if (req.method === 'POST') {
    await db.update(challenges).set({
      starts_on: '2026-02-20',
      ends_on: '2026-02-26',
      target_duration_minutes: 630,
      target_avg_heart_rate: 150,
      target_calories: 7000,
    }).where(eq(challenges.id, challengeId));

    return res.send(`
      <html><body style="background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:40px;text-align:center;">
        <h2 style="color:#4ade80;">Challenge Updated Successfully!</h2>
        <p>7 Days of Flaps Challenge has been updated:</p>
        <ul style="list-style:none;padding:0;line-height:2;">
          <li>Period: <strong>20/02/2026 → 26/02/2026</strong></li>
          <li>Duration: <strong>630 mins</strong> (90 min/day x 7)</li>
          <li>Avg HR: <strong>150 bpm</strong></li>
          <li>Calories: <strong>7,000 cal</strong> (1,000/day x 7)</li>
        </ul>
        <a href="/warzone/${challengeId}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#e11d48;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">View Challenge</a>
      </body></html>
    `);
  }

  const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
  if (!challenge) {
    return res.send(`<html><body style="background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:40px;"><h2>Challenge not found</h2></body></html>`);
  }

  return res.send(`
    <html><body style="background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:40px;text-align:center;">
      <h2>Fix: 7 Days of Flaps Challenge</h2>
      <p style="color:#94a3b8;">This will update Kman's challenge with the correct 7-day date range and daily targets.</p>
      <table style="margin:20px auto;border-collapse:collapse;text-align:left;">
        <tr><th style="padding:8px 16px;color:#94a3b8;"></th><th style="padding:8px 16px;color:#f87171;">Current</th><th style="padding:8px 16px;color:#4ade80;">Updated</th></tr>
        <tr><td style="padding:8px 16px;color:#94a3b8;">Period</td><td style="padding:8px 16px;">${challenge.starts_on} → ${challenge.ends_on}</td><td style="padding:8px 16px;">2026-02-20 → 2026-02-26</td></tr>
        <tr><td style="padding:8px 16px;color:#94a3b8;">Duration</td><td style="padding:8px 16px;">${challenge.target_duration_minutes} mins</td><td style="padding:8px 16px;">630 mins (90/day x 7)</td></tr>
        <tr><td style="padding:8px 16px;color:#94a3b8;">Avg HR</td><td style="padding:8px 16px;">${challenge.target_avg_heart_rate} bpm</td><td style="padding:8px 16px;">150 bpm (unchanged)</td></tr>
        <tr><td style="padding:8px 16px;color:#94a3b8;">Calories</td><td style="padding:8px 16px;">${challenge.target_calories} cal</td><td style="padding:8px 16px;">7,000 cal (1,000/day x 7)</td></tr>
      </table>
      <form method="POST" style="margin-top:20px;">
        <button type="submit" style="padding:14px 32px;background:#e11d48;color:white;border:none;border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;">Apply Changes</button>
      </form>
    </body></html>
  `);
}
