import { pgTable, uuid, text, timestamp, boolean, numeric, date, integer, varchar, jsonb } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  password_hash: text("password_hash").notNull(),
  is_admin: boolean("is_admin").default(false),
  team_id: uuid("team_id"),
  active_team_id: uuid("active_team_id"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  activeTeam: one(teams, { fields: [users.active_team_id], references: [teams.id] }),
  userTeams: many(userTeams),
  profile: one(profiles, { fields: [users.id], references: [profiles.user_id] }),
  weights: many(weights),
  bodyFatLogs: many(bodyFatLogs),
  journalEntries: many(journalEntries),
  activityLog: many(activityLog),
  flapsLog: many(flapsLog),
  challengeParticipants: many(challengeParticipants),
  challengeEntries: many(challengeEntries),
}));

// Teams table
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  motto: text("motto").default(""),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  userTeams: many(userTeams),
  banners: many(banners),
  teamSettings: many(teamSettings),
}));

// User Teams junction table
export const userTeams = pgTable("user_teams", {
  user_id: uuid("user_id").notNull().references(() => users.id),
  team_id: uuid("team_id").notNull().references(() => teams.id),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const userTeamsRelations = relations(userTeams, ({ one }) => ({
  user: one(users, { fields: [userTeams.user_id], references: [users.id] }),
  team: one(teams, { fields: [userTeams.team_id], references: [teams.id] }),
}));

// Profiles table
export const profiles = pgTable("profiles", {
  user_id: uuid("user_id").primaryKey().references(() => users.id),
  pb_weight_kg: numeric("pb_weight_kg"),
  pb_date: date("pb_date"),
  bf_percent: numeric("bf_percent"),
  bf_date: date("bf_date"),
  goal_weight: numeric("goal_weight"),
  goal_bf: numeric("goal_bf"),
  sex: varchar("sex", { length: 10 }),
  age: integer("age"),
  height_cm: numeric("height_cm"),
  activity_level: varchar("activity_level", { length: 50 }),
  tdee_goal: varchar("tdee_goal", { length: 50 }),
  cut_level: varchar("cut_level", { length: 50 }),
  bulk_level: varchar("bulk_level", { length: 50 }),
  shredulator_settings: jsonb("shredulator_settings").default(sql`'{}'::jsonb`),
  share_workout_history: boolean("share_workout_history").default(false),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.user_id], references: [users.id] }),
}));

// Team Settings table
export const teamSettings = pgTable("team_settings", {
  team_id: uuid("team_id").primaryKey().references(() => teams.id),
  motto: text("motto").default(""),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

// User Settings table
export const userSettings = pgTable("user_settings", {
  user_id: uuid("user_id").primaryKey().references(() => users.id),
  activity_level: varchar("activity_level", { length: 50 }),
  tdee_goal: varchar("tdee_goal", { length: 50 }),
  cut_level: varchar("cut_level", { length: 50 }),
  bulk_level: varchar("bulk_level", { length: 50 }),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

// Weights table
export const weights = pgTable("weights", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  weigh_date: date("weigh_date").notNull(),
  weight_kg: numeric("weight_kg").notNull(),
  is_monday: boolean("is_monday").default(false),
  is_friday: boolean("is_friday").default(false),
  comment: text("comment"),
  inserted_at: timestamp("inserted_at", { withTimezone: true }).default(sql`now()`),
});

export const weightsRelations = relations(weights, ({ one }) => ({
  user: one(users, { fields: [weights.user_id], references: [users.id] }),
}));

// Body Fat Logs table
export const bodyFatLogs = pgTable("body_fat_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  log_date: date("log_date").notNull(),
  bf_percent: numeric("bf_percent").notNull(),
  comment: text("comment"),
  inserted_at: timestamp("inserted_at", { withTimezone: true }).default(sql`now()`),
});

export const bodyFatLogsRelations = relations(bodyFatLogs, ({ one }) => ({
  user: one(users, { fields: [bodyFatLogs.user_id], references: [users.id] }),
}));

// Waist Logs table
export const waistLogs = pgTable("waist_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  log_date: date("log_date").notNull(),
  waist_cm: numeric("waist_cm").notNull(),
  comment: text("comment"),
  inserted_at: timestamp("inserted_at", { withTimezone: true }).default(sql`now()`),
});

export const waistLogsRelations = relations(waistLogs, ({ one }) => ({
  user: one(users, { fields: [waistLogs.user_id], references: [users.id] }),
}));

// Banners table
export const banners = pgTable("banners", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  team_id: uuid("team_id").references(() => teams.id),
  message: text("message").notNull(),
  type: text("type").notNull(),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const bannersRelations = relations(banners, ({ one }) => ({
  team: one(teams, { fields: [banners.team_id], references: [teams.id] }),
  createdBy: one(users, { fields: [banners.created_by], references: [users.id] }),
}));

// Journal Entries table
export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  category: varchar("category", { length: 20 }).notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
  user: one(users, { fields: [journalEntries.user_id], references: [users.id] }),
}));

// Exercise Types table
export const exerciseTypes = pgTable("exercise_types", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  unit_type: varchar("unit_type", { length: 20 }).notNull(),
  unit_label: varchar("unit_label", { length: 20 }).notNull(),
  is_active: boolean("is_active").default(true),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const exerciseTypesRelations = relations(exerciseTypes, ({ many }) => ({
  activityLogs: many(activityLog),
  challengeTasks: many(challengeTasks),
}));

// Activity Log table
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  exercise_type_id: uuid("exercise_type_id").notNull().references(() => exerciseTypes.id),
  value: numeric("value").notNull(),
  entry_date: date("entry_date").notNull(),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  user: one(users, { fields: [activityLog.user_id], references: [users.id] }),
  exerciseType: one(exerciseTypes, { fields: [activityLog.exercise_type_id], references: [exerciseTypes.id] }),
}));

// Challenges table
export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: text("scope").notNull(),
  template_key: text("template_key"),
  title: text("title").notNull(),
  description: text("description"),
  stake_text: text("stake_text"),
  stake_amount: numeric("stake_amount"),
  stake_currency: text("stake_currency").default("AUD"),
  starts_on: date("starts_on").notNull(),
  ends_on: date("ends_on").notNull(),
  status: text("status").notNull().default("pending"),
  created_by_user_id: uuid("created_by_user_id").notNull().references(() => users.id),
  team_id: uuid("team_id").references(() => teams.id),
  winner_user_id: uuid("winner_user_id").references(() => users.id),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  result_json: jsonb("result_json"),
  target_weight_kg: numeric("target_weight_kg"),
  // Flaps challenge fields
  target_avg_heart_rate: integer("target_avg_heart_rate"), // Target average HR in bpm
  target_calories: integer("target_calories"), // Target calories to burn
  target_duration_minutes: integer("target_duration_minutes"), // Target workout duration
  allowed_exercise_modes: jsonb("allowed_exercise_modes").default(sql`'[]'::jsonb`), // ["Ride","Run","Hike","Swim","HIIT","Custom"]
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  createdBy: one(users, { fields: [challenges.created_by_user_id], references: [users.id] }),
  team: one(teams, { fields: [challenges.team_id], references: [teams.id] }),
  winner: one(users, { fields: [challenges.winner_user_id], references: [users.id] }),
  participants: many(challengeParticipants),
  tasks: many(challengeTasks),
  entries: many(challengeEntries),
}));

// Challenge Participants table
export const challengeParticipants = pgTable("challenge_participants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  challenge_id: uuid("challenge_id").notNull().references(() => challenges.id),
  user_id: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("participant"),
  state: text("state").notNull().default("invited"),
  joined_at: timestamp("joined_at", { withTimezone: true }).default(sql`now()`),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const challengeParticipantsRelations = relations(challengeParticipants, ({ one }) => ({
  challenge: one(challenges, { fields: [challengeParticipants.challenge_id], references: [challenges.id] }),
  user: one(users, { fields: [challengeParticipants.user_id], references: [users.id] }),
}));

// Challenge Tasks table
export const challengeTasks = pgTable("challenge_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  challenge_id: uuid("challenge_id").notNull().references(() => challenges.id),
  name: text("name").notNull(),
  exercise_type_id: uuid("exercise_type_id").references(() => exerciseTypes.id),
  unit_type: text("unit_type").notNull().default("reps"),
  target_type: text("target_type").notNull().default("daily"),
  target_value: numeric("target_value"),
  schedule_json: jsonb("schedule_json"),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const challengeTasksRelations = relations(challengeTasks, ({ one, many }) => ({
  challenge: one(challenges, { fields: [challengeTasks.challenge_id], references: [challenges.id] }),
  exerciseType: one(exerciseTypes, { fields: [challengeTasks.exercise_type_id], references: [exerciseTypes.id] }),
  entries: many(challengeEntries),
}));

// Flaps Log table - for cardio/HIIT activities with HR and calories tracking
export const flapsLog = pgTable("flaps_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  entry_date: date("entry_date").notNull(),
  duration_minutes: integer("duration_minutes").notNull(),
  avg_heart_rate: integer("avg_heart_rate"),
  calories_burned: integer("calories_burned"),
  exercise_mode: varchar("exercise_mode", { length: 50 }).notNull(), // Ride, Run, Hike, Swim, HIIT, Custom
  distance_km: numeric("distance_km"), // for cardio modes
  hiit_details: jsonb("hiit_details"), // { rounds, work_seconds, rest_seconds, exercises }
  custom_exercise: text("custom_exercise"), // for Custom mode
  notes: text("notes"),
  challenge_id: uuid("challenge_id").references(() => challenges.id), // optional link to Flaps challenge
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const flapsLogRelations = relations(flapsLog, ({ one }) => ({
  user: one(users, { fields: [flapsLog.user_id], references: [users.id] }),
  challenge: one(challenges, { fields: [flapsLog.challenge_id], references: [challenges.id] }),
}));

// Challenge Entries table
export const challengeEntries = pgTable("challenge_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  challenge_id: uuid("challenge_id").notNull().references(() => challenges.id),
  task_id: uuid("task_id").notNull().references(() => challengeTasks.id),
  user_id: uuid("user_id").notNull().references(() => users.id),
  entry_date: date("entry_date").notNull(),
  value: numeric("value"),
  completed: boolean("completed"),
  note: text("note"),
  log_request_id: uuid("log_request_id"),  // Groups entries from same Quick Log action
  inserted_at: timestamp("inserted_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const challengeEntriesRelations = relations(challengeEntries, ({ one }) => ({
  challenge: one(challenges, { fields: [challengeEntries.challenge_id], references: [challenges.id] }),
  task: one(challengeTasks, { fields: [challengeEntries.task_id], references: [challengeTasks.id] }),
  user: one(users, { fields: [challengeEntries.user_id], references: [users.id] }),
}));

// Gym Exercises master library
export const gymExercises = pgTable("gym_exercises", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  muscle_group: text("muscle_group").notNull(),
  split_category: text("split_category"),
  description: text("description"),
  safety_guide: text("safety_guide"),
  is_custom: boolean("is_custom").default(false),
  created_by_user_id: uuid("created_by_user_id").references(() => users.id),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

// Gym Sessions - a completed workout
export const gymSessions = pgTable("gym_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  session_date: date("session_date").notNull(),
  status: text("status").notNull().default("active"),
  name: text("name"),
  notes: text("notes"),
  started_at: timestamp("started_at", { withTimezone: true }).default(sql`now()`),
  finished_at: timestamp("finished_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const gymSessionsRelations = relations(gymSessions, ({ one, many }) => ({
  user: one(users, { fields: [gymSessions.user_id], references: [users.id] }),
  exercises: many(gymSessionExercises),
}));

// Gym Session Exercises - exercises within a session
export const gymSessionExercises = pgTable("gym_session_exercises", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  session_id: uuid("session_id").notNull().references(() => gymSessions.id, { onDelete: 'cascade' }),
  exercise_id: uuid("exercise_id").notNull().references(() => gymExercises.id),
  sort_order: integer("sort_order").default(0),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const gymSessionExercisesRelations = relations(gymSessionExercises, ({ one, many }) => ({
  session: one(gymSessions, { fields: [gymSessionExercises.session_id], references: [gymSessions.id] }),
  exercise: one(gymExercises, { fields: [gymSessionExercises.exercise_id], references: [gymExercises.id] }),
  sets: many(gymSessionSets),
}));

// Gym Session Sets - individual sets within an exercise
export const gymSessionSets = pgTable("gym_session_sets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  session_exercise_id: uuid("session_exercise_id").notNull().references(() => gymSessionExercises.id, { onDelete: 'cascade' }),
  set_number: integer("set_number").notNull(),
  weight_kg: numeric("weight_kg"),
  reps: integer("reps"),
  is_warmup: boolean("is_warmup").default(false),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const gymSessionSetsRelations = relations(gymSessionSets, ({ one }) => ({
  sessionExercise: one(gymSessionExercises, { fields: [gymSessionSets.session_exercise_id], references: [gymSessionExercises.id] }),
}));

// Gym Routines - saved workout templates
export const gymRoutines = pgTable("gym_routines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

export const gymRoutinesRelations = relations(gymRoutines, ({ one, many }) => ({
  user: one(users, { fields: [gymRoutines.user_id], references: [users.id] }),
  exercises: many(gymRoutineExercises),
}));

// Gym Routine Exercises - exercises in a routine template
export const gymRoutineExercises = pgTable("gym_routine_exercises", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  routine_id: uuid("routine_id").notNull().references(() => gymRoutines.id, { onDelete: 'cascade' }),
  exercise_id: uuid("exercise_id").notNull().references(() => gymExercises.id),
  sort_order: integer("sort_order").default(0),
  default_sets: integer("default_sets").default(3),
  default_reps: integer("default_reps").default(10),
  default_weight_kg: numeric("default_weight_kg"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
});

export const gymRoutineExercisesRelations = relations(gymRoutineExercises, ({ one }) => ({
  routine: one(gymRoutines, { fields: [gymRoutineExercises.routine_id], references: [gymRoutines.id] }),
  exercise: one(gymExercises, { fields: [gymRoutineExercises.exercise_id], references: [gymExercises.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, created_at: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, created_at: true });
export const insertProfileSchema = createInsertSchema(profiles).omit({ updated_at: true });
export const insertWeightSchema = createInsertSchema(weights).omit({ id: true, inserted_at: true });
export const insertBodyFatLogSchema = createInsertSchema(bodyFatLogs).omit({ id: true, inserted_at: true });
export const insertWaistLogSchema = createInsertSchema(waistLogs).omit({ id: true, inserted_at: true });
export const insertBannerSchema = createInsertSchema(banners).omit({ id: true, created_at: true });
export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({ id: true, created_at: true });
export const insertExerciseTypeSchema = createInsertSchema(exerciseTypes).omit({ id: true, created_at: true });
export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, created_at: true });
export const insertChallengeSchema = createInsertSchema(challenges).omit({ id: true, created_at: true, updated_at: true });
export const insertChallengeParticipantSchema = createInsertSchema(challengeParticipants).omit({ id: true, joined_at: true, created_at: true });
export const insertChallengeTaskSchema = createInsertSchema(challengeTasks).omit({ id: true, created_at: true });
export const insertChallengeEntrySchema = createInsertSchema(challengeEntries).omit({ id: true, inserted_at: true });
export const insertFlapsLogSchema = createInsertSchema(flapsLog).omit({ id: true, created_at: true });
export const insertGymExerciseSchema = createInsertSchema(gymExercises).omit({ id: true, created_at: true });
export const insertGymSessionSchema = createInsertSchema(gymSessions).omit({ id: true, created_at: true });
export const insertGymSessionExerciseSchema = createInsertSchema(gymSessionExercises).omit({ id: true, created_at: true });
export const insertGymSessionSetSchema = createInsertSchema(gymSessionSets).omit({ id: true, created_at: true });
export const insertGymRoutineSchema = createInsertSchema(gymRoutines).omit({ id: true, created_at: true, updated_at: true });
export const insertGymRoutineExerciseSchema = createInsertSchema(gymRoutineExercises).omit({ id: true, created_at: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Weight = typeof weights.$inferSelect;
export type InsertWeight = z.infer<typeof insertWeightSchema>;
export type BodyFatLog = typeof bodyFatLogs.$inferSelect;
export type InsertBodyFatLog = z.infer<typeof insertBodyFatLogSchema>;
export type WaistLog = typeof waistLogs.$inferSelect;
export type InsertWaistLog = z.infer<typeof insertWaistLogSchema>;
export type Banner = typeof banners.$inferSelect;
export type InsertBanner = z.infer<typeof insertBannerSchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type ExerciseType = typeof exerciseTypes.$inferSelect;
export type InsertExerciseType = z.infer<typeof insertExerciseTypeSchema>;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type InsertActivityLogEntry = z.infer<typeof insertActivityLogSchema>;
export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;
export type InsertChallengeParticipant = z.infer<typeof insertChallengeParticipantSchema>;
export type ChallengeTask = typeof challengeTasks.$inferSelect;
export type InsertChallengeTask = z.infer<typeof insertChallengeTaskSchema>;
export type ChallengeEntry = typeof challengeEntries.$inferSelect;
export type InsertChallengeEntry = z.infer<typeof insertChallengeEntrySchema>;
export type FlapsLogEntry = typeof flapsLog.$inferSelect;
export type InsertFlapsLogEntry = z.infer<typeof insertFlapsLogSchema>;
export type GymExercise = typeof gymExercises.$inferSelect;
export type InsertGymExercise = z.infer<typeof insertGymExerciseSchema>;
export type GymSession = typeof gymSessions.$inferSelect;
export type InsertGymSession = z.infer<typeof insertGymSessionSchema>;
export type GymSessionExercise = typeof gymSessionExercises.$inferSelect;
export type InsertGymSessionExercise = z.infer<typeof insertGymSessionExerciseSchema>;
export type GymSessionSet = typeof gymSessionSets.$inferSelect;
export type InsertGymSessionSet = z.infer<typeof insertGymSessionSetSchema>;
export type GymRoutine = typeof gymRoutines.$inferSelect;
export type InsertGymRoutine = z.infer<typeof insertGymRoutineSchema>;
export type GymRoutineExercise = typeof gymRoutineExercises.$inferSelect;
export type InsertGymRoutineExercise = z.infer<typeof insertGymRoutineExerciseSchema>;
