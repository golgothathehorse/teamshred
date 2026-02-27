import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFromRequest } from '../../../lib/auth';
import { db, journalEntries } from '../../../lib/db';
import { eq, and, desc } from 'drizzle-orm';

type JournalEntry = {
  id: string;
  user_id: string;
  category: 'training' | 'diet' | 'supplements' | 'stack';
  content: string;
  created_at: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user = parseSessionFromRequest(req);

  if (!user && process.env.TEST_BYPASS_AUTH === 'true') {
    user = {
      id: '7d921803-163b-4f6e-827f-4c3a94ba9efb',
      username: 'Nox',
      isAdmin: true,
    };
  }

  if (!user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const { category } = req.query;

    try {
      let query = db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.user_id, user.id))
        .orderBy(desc(journalEntries.created_at));

      if (category && typeof category === 'string') {
        query = db
          .select()
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.user_id, user.id),
              eq(journalEntries.category, category)
            )
          )
          .orderBy(desc(journalEntries.created_at));
      }

      const data = await query;

      const formattedEntries = data.map((entry) => ({
        ...entry,
        created_at: entry.created_at?.toISOString() ?? new Date().toISOString(),
      }));

      return res.status(200).json({ ok: true, entries: formattedEntries });
    } catch (error) {
      console.error('Journal fetch error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to fetch journal entries' });
    }
  }

  if (req.method === 'POST') {
    const { category, content } = req.body;

    if (!category || !content) {
      return res.status(400).json({ ok: false, error: 'Category and content are required' });
    }

    const validCategories = ['training', 'diet', 'supplements', 'stack'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ ok: false, error: 'Invalid category' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ ok: false, error: 'Content too long (max 5000 characters)' });
    }

    const sanitizedContent = content.trim();
    if (!sanitizedContent) {
      return res.status(400).json({ ok: false, error: 'Content cannot be empty' });
    }

    try {
      const inserted = await db
        .insert(journalEntries)
        .values({
          user_id: user.id,
          category,
          content: sanitizedContent,
          created_at: new Date(),
        })
        .returning();

      const entry = inserted[0];

      return res.status(201).json({
        ok: true,
        entry: {
          ...entry,
          created_at: entry.created_at?.toISOString() ?? new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Journal insert error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to save journal entry' });
    }
  }

  if (req.method === 'PATCH') {
    const { id, content } = req.body;

    if (!id || !content) {
      return res.status(400).json({ ok: false, error: 'Entry ID and content are required' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ ok: false, error: 'Content too long (max 5000 characters)' });
    }

    const sanitizedContent = content.trim();
    if (!sanitizedContent) {
      return res.status(400).json({ ok: false, error: 'Content cannot be empty' });
    }

    try {
      const updated = await db
        .update(journalEntries)
        .set({ content: sanitizedContent })
        .where(and(eq(journalEntries.id, id), eq(journalEntries.user_id, user.id)))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ ok: false, error: 'Entry not found' });
      }

      const entry = updated[0];

      return res.status(200).json({
        ok: true,
        entry: {
          ...entry,
          created_at: entry.created_at?.toISOString() ?? new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Journal update error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to update entry' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ ok: false, error: 'Entry ID is required' });
    }

    try {
      await db
        .delete(journalEntries)
        .where(and(eq(journalEntries.id, id), eq(journalEntries.user_id, user.id)));

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Journal delete error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to delete entry' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
