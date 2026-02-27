// lib/warzone/templates.ts
// Phase 1: Preset templates for War Zone challenges
// These are status-based challenges that use existing weigh-in data

export type TemplateCategory = 'weekend' | 'weekly';

export type ChallengeTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  duration: string;
  winCondition: string;
  stakes: string;
};

// 4 preset templates (no BlowOut options per requirements)
export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'epic_weekend',
    name: 'Epic Weekend! (weight loss)',
    category: 'weekend',
    description: 'Challenge someone to have an Epic Weekend - lose weight over the weekend!',
    duration: 'Friday to Monday',
    winCondition: 'Weigh less on Monday than on Friday',
    stakes: 'Bragging rights + team glory',
  },
  {
    id: 'solid_weekend',
    name: 'Solid Weekend (< +1.0kg)',
    category: 'weekend',
    description: 'Hold steady over the weekend - gain less than 1kg from Friday to Monday.',
    duration: 'Friday to Monday',
    winCondition: 'Gain less than 1kg over the weekend',
    stakes: 'Weekend warrior status',
  },
  {
    id: 'ripper_week',
    name: 'Ripper Week (-0 to -1.0kg)',
    category: 'weekly',
    description: 'Have a solid week of weight loss - lose 0-1kg from Friday to Friday.',
    duration: 'Friday to Friday (1 week)',
    winCondition: 'Lose between 0 and 1kg over the week',
    stakes: 'Weekly consistency badge',
  },
  {
    id: 'pisscutter_week',
    name: 'Pisscutter Week!!! (> -1.0kg)',
    category: 'weekly',
    description: 'Go hard and smash it - lose more than 1kg from Friday to Friday!',
    duration: 'Friday to Friday (1 week)',
    winCondition: 'Lose more than 1kg over the week',
    stakes: 'Ultimate shredder title',
  },
];

// Helper to get templates by category
export function getTemplatesByCategory(category: TemplateCategory): ChallengeTemplate[] {
  return CHALLENGE_TEMPLATES.filter((t) => t.category === category);
}

// Helper to get a template by ID
export function getTemplateById(id: string): ChallengeTemplate | undefined {
  return CHALLENGE_TEMPLATES.find((t) => t.id === id);
}
