import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  approved: boolean("approved").notNull().default(false),
  onboardingData: jsonb("onboarding_data"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
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
  processedFolder: text("processed_folder"),
  wavS3Key: text("wav_s3_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  primaryLanguage: z.string().min(1),
  referralSource: z.string().optional(),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Room = typeof rooms.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
