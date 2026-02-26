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
    hourlyRate: 30,
    availableUntil: "2026-04-01",
    requiresPartner: true,
    instructions: [
      "Find a quiet room with minimal background noise.",
      "Have a normal phone conversation but whispering or in a soft voice throughout the call.",
      "Discuss any topic you like — the content does not matter, only the vocal style.",
      "Aim for at least 20 minutes of natural conversation.",
    ],
  },
  {
    id: "general-emotional",
    name: "General Emotional Conversation",
    description: "Have a natural, emotionally expressive conversation with your partner.",
    hourlyRate: 50,
    availableUntil: "2026-03-06",
    requiresPartner: true,
    archived: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a natural 10–20 minute phone conversation with your partner.",
      "Talk naturally with your friend, but slightly exaggerate your emotions — maybe you go on an angry rant about something at one point, or get really excited about something coming up, or share something that made you sad.",
      "Don't force it — just have a real conversation and let the emotion come through. When you feel something, lean into it a bit more than usual.",
      "When you're done, press Stop Recording.",
    ],
  },
  {
    id: "emotion-joy",
    name: "Emotional Conversation - Joy",
    description: "Have a joyful, happy conversation with your partner.",
    hourlyRate: 20,
    payType: "fixed" as const,
    availableUntil: "2026-03-07",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out joyful and happy emotions.",
      "Discuss things that make you genuinely happy — good memories, exciting news, things you're grateful for.",
      "Example call breakdown: ~2 min catching up with your friend, ~3 min excitedly sharing something great that happened to you recently, ~1 min winding down the conversation, then press Stop Recording.",
    ],
  },
  {
    id: "emotion-surprise",
    name: "Emotional Conversation - Surprise",
    description: "Have a surprised, shocked conversation with your partner.",
    hourlyRate: 20,
    payType: "fixed" as const,
    availableUntil: "2026-03-07",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out surprise and shock.",
      "Share unexpected stories, surprising facts, or role-play revealing shocking news to each other.",
      "Example call breakdown: ~2 min catching up with your friend, ~3 min revealing something unexpected or reacting to surprising news from each other, ~1 min winding down the conversation, then press Stop Recording.",
    ],
  },
  {
    id: "emotion-fear",
    name: "Emotional Conversation - Fear",
    description: "Have a fearful, scared conversation with your partner.",
    hourlyRate: 20,
    payType: "fixed" as const,
    availableUntil: "2026-03-07",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out fear and being scared.",
      "Discuss scary experiences, fears, or creepy stories together.",
      "Example call breakdown: ~2 min catching up with your friend, ~3 min telling each other about something that genuinely scared you or a creepy experience, ~1 min winding down the conversation, then press Stop Recording.",
    ],
  },
  {
    id: "emotion-anger",
    name: "Emotional Conversation - Anger",
    description: "Have an angry, frustrated conversation with your partner.",
    hourlyRate: 20,
    payType: "fixed" as const,
    availableUntil: "2026-03-07",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out anger and frustration.",
      "Discuss things that frustrate you, vent about annoyances, or role-play a heated debate.",
      "Example call breakdown: ~2 min catching up with your friend, ~3 min going on an angry rant about something that really pissed you off last week, ~1 min winding down the conversation, then press Stop Recording.",
    ],
  },
  {
    id: "emotion-sadness",
    name: "Emotional Conversation - Sadness",
    description: "Have a sad, upset conversation with your partner.",
    hourlyRate: 20,
    payType: "fixed" as const,
    availableUntil: "2026-03-07",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out sadness and being upset.",
      "Discuss bittersweet memories, disappointments, or role-play comforting each other through tough times.",
      "Example call breakdown: ~2 min catching up with your friend, ~3 min talking about something that made you feel sad or a difficult time you went through, ~1 min winding down the conversation, then press Stop Recording.",
    ],
  },
  {
    id: "emotion-confusion",
    name: "Emotional Conversation - Confusion",
    description: "Have a confused, puzzled conversation with your partner.",
    hourlyRate: 20,
    payType: "fixed" as const,
    availableUntil: "2026-03-07",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out confusion and puzzlement.",
      "Discuss confusing topics, try to figure out something tricky together, or role-play being baffled by something.",
      "Example call breakdown: ~2 min catching up with your friend, ~3 min trying to work through something confusing together or reacting to a baffling situation, ~1 min winding down the conversation, then press Stop Recording.",
    ],
  },
  {
    id: "emotion-pride",
    name: "Emotional Conversation - Pride",
    description: "Have a proud, triumphant conversation with your partner.",
    hourlyRate: 20,
    payType: "fixed" as const,
    availableUntil: "2026-03-07",
    requiresPartner: true,
    instructions: [
      "Find a comfortable, private space.",
      "Have a conversation that naturally brings out pride and triumph.",
      "Share accomplishments, celebrate wins, or role-play achieving something great together.",
      "Example call breakdown: ~2 min catching up with your friend, ~3 min proudly telling them about something you accomplished or a big win you had, ~1 min winding down the conversation, then press Stop Recording.",
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
  shortKey: varchar("short_key", { length: 8 }).unique(),
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
  paid: boolean("paid").notNull().default(false),
  reviewerStatus: text("reviewer_status"),
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
  phoneNumber: z.string().min(1),
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
