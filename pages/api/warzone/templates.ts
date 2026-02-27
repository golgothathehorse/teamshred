// pages/api/warzone/templates.ts
// GET /api/warzone/templates - Return selectable challenge templates

import type { NextApiRequest, NextApiResponse } from 'next';
import { CHALLENGE_TEMPLATES } from '../../../lib/warzone/templates';

type TemplateResponse = {
  id: string;
  name: string;
  category: string;
  description: string;
  duration: string;
  winCondition: string;
  stakes: string;
};

type ApiResponse =
  | { ok: true; templates: TemplateResponse[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Return all 5 templates (blowouts are already excluded from CHALLENGE_TEMPLATES)
    const templates = CHALLENGE_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      duration: t.duration,
      winCondition: t.winCondition,
      stakes: t.stakes,
    }));

    return res.status(200).json({ ok: true, templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({ ok: false, error: 'Failed to fetch templates' });
  }
}
