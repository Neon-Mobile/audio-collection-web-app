import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Onboarding sample prompts — shared between client + server
export const ONBOARDING_PROMPTS = [
  { type: "speak" as const, text: 'Speak: "The quick brown fox jumps over the lazy dog near the bank of the river."', duration: 6 },
  { type: "silence" as const, text: "Be quiet", duration: 3 },
  { type: "speak" as const, text: 'Speak: "The quick brown fox jumps over the lazy dog near the bank of the river."', duration: 6 },
];

// Task type definitions — shared between client + server
export const TASK_TYPES = [
  {
    id: "whispered-conversation",
    name: "Soft Spoken / Whispered Conversation",
    description: "Have a quiet, whispered conversation with your partner.",
    hourlyRate: 20,
    availableUntil: "2026-04-01",
    requiresPartner: true,
    instructions: [
      "Find a quiet room with minimal background noise.",
      "Speak softly or in a whisper throughout the entire conversation.",
      "Discuss any topic you like — the content does not matter, only the vocal style.",
      "Aim for at least 5 minutes of natural conversation.",
    ],
  },
  {
    id: "emotional-conversation",
    name: "Highly Emotional Conversation",
    description: "Have an emotionally expressive conversation with your partner.",
    hourlyRate: 25,
    availableUntil: "2026-04-01",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out strong emotions — excitement, surprise, frustration, joy.",
      "You can discuss real topics or role-play a scenario together.",
      "Aim for at least 5 minutes of natural conversation.",
    ],
  },
] as const;

export type TaskTypeId = (typeof TASK_TYPES)[number]["id"];

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  approved: boolean("approved").notNull().default(false),
  onboardingData: jsonb("onboarding_data"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  samplesCompletedAt: timestamp("samples_completed_at"),
  referredBy: varchar("referred_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rooms table
export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  dailyRoomUrl: text("daily_room_url").notNull(),
  dailyRoomName: text("daily_room_name").notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Onboarding samples table
export const onboardingSamples = pgTable("onboarding_samples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  promptIndex: integer("prompt_index").notNull(),
  promptText: text("prompt_text").notNull(),
  s3Key: text("s3_key").notNull(),
  s3Bucket: text("s3_bucket").notNull(),
  fileName: text("file_name").notNull(),
  duration: integer("duration"),
  fileSize: integer("file_size"),
  format: text("format").notNull().default("webm"),
  sampleRate: integer("sample_rate").notNull().default(48000),
  channels: integer("channels").notNull().default(1),
  processedFolder: text("processed_folder"),
  wavS3Key: text("wav_s3_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Recordings table
export const recordings = pgTable("recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => rooms.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  s3Key: text("s3_key").notNull(),
  s3Bucket: text("s3_bucket").notNull(),
  fileName: text("file_name").notNull(),
  duration: integer("duration"),
  fileSize: integer("file_size"),
  format: text("format").notNull().default("webm"),
  sampleRate: integer("sample_rate").notNull().default(48000),
  channels: integer("channels").notNull().default(1),
  recordingType: text("recording_type").notNull(),
  speakerId: text("speaker_id"),
  processedFolder: text("processed_folder"),
  wavS3Key: text("wav_s3_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Referral codes table
export const referralCodes = pgTable("referral_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 12 }).notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Room invitations table
export const roomInvitations = pgTable("room_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => rooms.id),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  invitedUserId: varchar("invited_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Task sessions table
export const taskSessions = pgTable("task_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskType: text("task_type").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  partnerId: varchar("partner_id").references(() => users.id),
  partnerEmail: text("partner_email"),
  partnerStatus: text("partner_status").notNull().default("none"),
  roomId: varchar("room_id").references(() => rooms.id),
  status: text("status").notNull().default("inviting_partner"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const loginSchema = z.object({
  username: z.string().email("Please enter a valid email address"),
  password: z.string().min(6).max(100),
});

export const onboardingSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(["male", "female", "non-binary", "prefer-not-to-say"]),
  age: z.number().int().min(13).max(120),
  primaryLanguage: z.string().min(1),
  countryOfEducation: z.string().min(1),
  countryOfResidence: z.string().min(1),
  occupation: z.string().min(1),
  referralSource: z.string().optional(),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const inviteToRoomSchema = z.object({
  email: z.string().email(),
});

export const createTaskSessionSchema = z.object({
  taskType: z.string().min(1),
  partnerEmail: z.string().email().optional(),
});

export const inviteTaskPartnerSchema = z.object({
  email: z.string().email(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Room = typeof rooms.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type OnboardingSample = typeof onboardingSamples.$inferSelect;
export type ReferralCode = typeof referralCodes.$inferSelect;
export type RoomInvitation = typeof roomInvitations.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type TaskSession = typeof taskSessions.$inferSelect;
