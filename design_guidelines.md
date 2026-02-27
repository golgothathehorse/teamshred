# Team Shred v3 Design Guidelines

## Design Approach
**Selected Strategy**: Hybrid approach combining Linear's clean data presentation with Strava's activity tracking aesthetics. Dark-themed dashboard optimized for data-heavy interfaces with vibrant accent system for team differentiation.

**Core Principles**:
- Data-first hierarchy with clear visual emphasis on metrics
- Team identity through strategic color application
- Card-based modular system for flexible dashboard layouts
- Scannable information architecture with strong contrast

## Typography

**Font Stack**: 
- Primary: Inter (500, 600, 700) via Google Fonts
- Monospace: JetBrains Mono (500) for numerical data

**Hierarchy**:
- Page Headers: text-3xl font-bold (slate-50)
- Card Titles: text-lg font-semibold (slate-200)
- Metrics/Numbers: text-4xl font-bold tracking-tight (accent colors)
- Body Text: text-sm font-medium (slate-400)
- Labels: text-xs font-medium uppercase tracking-wide (slate-500)

## Layout System

**Spacing**: Use Tailwind units of 2, 4, 6, and 8 for consistency
- Card padding: p-6
- Section gaps: gap-6
- Page margins: px-6 py-8

**Grid Structure**:
- Dashboard: 12-column grid (grid-cols-12)
- Stats cards: 3-column on desktop (lg:grid-cols-3), stack mobile
- Team cards: 2-column layout (lg:grid-cols-2)
- Chart sections: Full-width within containers

## Component Library

**Cards** (slate-900 background, slate-800 border):
- Stat Cards: Metric number (large, accent color) + label + trend indicator (↑↓ with emerald/pink)
- Team Cards: Team name + member count + total weight lost + progress bar (accent colored)
- Activity Feed: Timeline design with user avatar + weight entry + timestamp
- Chart Cards: Title + time range selector + visualization area

**Navigation**:
- Top bar: Logo left, user profile right, notifications icon (slate-700 bg, h-16)
- Sidebar: Vertical nav with icons + labels (w-64, slate-900, hover:slate-800)

**Data Visualization**:
- Line charts for weight trends (Chart.js/Recharts)
- Bar charts for team comparisons
- Progress circles for body fat % goals
- Use accent colors per team/user consistently

**Forms**:
- Weight entry: Large number input (text-center, text-3xl) + unit toggle
- Date picker with calendar icon
- Body fat % slider with visual feedback
- Submit button: Primary accent (emerald-500, full-width on mobile)

**Leaderboard**:
- Ranked list with position badges (1st=amber, 2nd=slate-400, 3rd=sky-500)
- User row: Avatar + name + weight lost + trend arrow
- Alternating row backgrounds (slate-900/slate-950)

**Buttons**:
- Primary: emerald-500 bg, slate-900 text, px-6 py-3, font-semibold
- Secondary: slate-800 bg, slate-200 text, border slate-700
- Icon buttons: slate-800 bg, rounded-lg, p-2

## Images

**Dashboard Hero Banner** (if included):
- Motivational fitness imagery (weights, team workout, progress visualization)
- Placement: Top of dashboard, h-48, with gradient overlay (slate-950 to transparent)
- Blurred button overlay if CTA needed

**Team Avatars**: 
- Circular, 40px diameter, colored border matching team accent
- Placeholder pattern if no image uploaded

**Achievement Badges**:
- SVG icons for milestones (10lb lost, 30-day streak, etc.)
- Subtle glow effect using team colors

No large hero needed for main app - focus on immediate data access. Dashboard prioritizes metric cards and charts over imagery.