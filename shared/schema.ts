import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  primaryLanguage: text("primary_language").notNull(),
  otherLanguages: text("other_languages").array().notNull().default(sql`'{}'::text[]`),
  referralSource: text("referral_source").notNull(),
  ethnicity: text("ethnicity").notNull(),
  gender: text("gender").notNull(),
  occupation: text("occupation").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  educationLevel: text("education_level").notNull(),
  educationInLanguage: text("education_in_language").notNull(),
  accentDescription: text("accent_description").notNull(),
  accentOrigin: text("accent_origin").notNull(),
  locale: text("locale").notNull(),
  birthplace: text("birthplace").notNull(),
  birthplaceYears: text("birthplace_years").notNull(),
  currentAddress: text("current_address").notNull(),
  currentAddressLine2: text("current_address_line2"),
  currentAddressYears: text("current_address_years").notNull(),
  sampleAudioPath: text("sample_audio_path"),
  languageAudioPath: text("language_audio_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true,
});

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
