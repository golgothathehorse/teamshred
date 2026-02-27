# Challenges / War Zone - Phase 2 Documentation

## Overview

Phase 2 establishes the database groundwork for the War Zone feature. This phase is **additive only** - it creates new tables without modifying any existing database structure or application code.

## What Phase 2 Adds

### New Database Tables

| Table | Purpose |
|-------|---------|
| `challenges` | Main challenge records with scope, template, stakes, and dates |
| `challenge_participants` | Tracks who is in each challenge and their participation state |
| `challenge_tasks` | Defines tasks for rep/checklist-style challenges (future use) |
| `challenge_entries` | Stores user progress logs for tasks |

### Challenge Scopes (War Zone Terminology)

| Scope | War Zone Name | Description |
|-------|---------------|-------------|
| `team` | Team Blitzkrieg | Team vs team competition |
| `duel` | Attack | 1v1 personal challenges |
| `solo` | Lone Wolf | Individual challenges (team can spectate) |

### Template Keys

The `template_key` column stores references to preset challenge templates defined in `lib/warzone/templates.ts`:

- `epic_weekend` - Epic Weekend! (lose weight Fri→Mon)
- `solid_weekend` - Solid Weekend (gain <1kg Fri→Mon)
- `decent_weekend` - Decent Weekend (gain <2kg Fri→Mon)
- `ripper_week` - Ripper Week (lose 0-1kg Fri→Fri)
- `pisscutter_week` - Pisscutter Week!!! (lose >1kg Fri→Fri)

**Note:** Minor BlowOut and Massive BlowOut are NOT templates - those are weekend performance ratings in the existing system.

## How to Run the SQL

### Step 1: Run Discovery SQL First

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Paste the contents of `supabase/phase2/00_discovery.sql`
5. Run each query section individually to inspect your current schema
6. **Review the output** - particularly:
   - Does `pgcrypto` extension exist?
   - What is the `id` column type in `users` table? (UUID or something else?)
   - Do any `challenges*` tables already exist?

### Step 2: Create the Challenge Tables

1. In SQL Editor, create a new query
2. Paste the contents of `supabase/phase2/01_create_challenges_tables.sql`
3. Run the entire script
4. Verify tables were created by running:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name LIKE 'challenge%';
   ```

## Design Decisions

### Why No Foreign Keys to User Tables?

We deliberately avoided adding foreign key constraints from our new tables to existing tables (`users`, `profiles`, etc.) because:

1. **Schema uncertainty** - The existing schema may have changed and we can't assume column names/types
2. **Migration safety** - FKs can cause migration failures if the referenced table structure doesn't match
3. **Flexibility** - User references are stored as `UUID` columns, making it easy to add FKs later

In Phase 3, after confirming the user ID format via discovery queries, we can safely add:
```sql
ALTER TABLE challenges 
ADD CONSTRAINT fk_challenges_created_by 
FOREIGN KEY (created_by_user_id) REFERENCES users(id);
```

### Why No RLS Yet?

Row Level Security (RLS) is deferred to Phase 3 because:

1. **Auth model uncertainty** - We need to confirm how authentication works (Supabase Auth vs custom JWT)
2. **User ID format** - RLS policies depend on knowing how to match `auth.uid()` to user records
3. **Testability** - Tables are easier to test and debug without RLS enabled initially

### Why Allow Multiple Entries Per Day?

The `challenge_entries` table intentionally does NOT have a unique constraint on `(task_id, user_id, entry_date)` because:

1. **Mobile UX** - Users may submit small increments throughout the day (e.g., logging sets of pushups)
2. **Flexibility** - Aggregation queries can sum values; a unique constraint would require upsert logic
3. **Audit trail** - Multiple entries preserve the full history of logging

## File Locations

```
supabase/
└── phase2/
    ├── 00_discovery.sql     # Read-only schema inspection
    └── 01_create_challenges_tables.sql  # Table creation script

docs/
└── challenges-phase2.md     # This documentation
```

## What's NOT in Phase 2

- ❌ No changes to existing tables
- ❌ No API endpoints
- ❌ No Supabase client code in the app
- ❌ No RLS policies
- ❌ No triggers or functions
- ❌ No changes to existing pages/routes

## Next Steps (Phase 3)

1. Run discovery SQL to confirm user ID format and auth model
2. Add FK constraints to user tables if safe
3. Enable RLS policies with appropriate access controls
4. Create API endpoints (`/api/warzone/*`)
5. Connect the existing War Zone UI to the backend
6. Implement challenge creation flow (Launch tab functionality)
