import { type User, type Room, type Recording, type OnboardingSample, type ReferralCode, type RoomInvitation, type Notification, type TaskSession, users, rooms, recordings, onboardingSamples, referralCodes, roomInvitations, notifications, taskSessions } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, isNotNull, inArray, sql } from "drizzle-orm";
import * as crypto from "node:crypto";

export interface IStorage {
  // Users
  createUser(data: { username: string; password: string }): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<Omit<User, "id">>): Promise<User>;
  approveUser(id: string): Promise<User>;

  // Rooms
  createRoom(data: {
    name: string;
    dailyRoomUrl: string;
    dailyRoomName: string;
    createdBy: string;
    expiresAt: Date;
  }): Promise<Room>;
  getRoomById(id: string): Promise<Room | undefined>;
  getRoomByName(name: string): Promise<Room | undefined>;
  getRooms(): Promise<Room[]>;
  getRoomsByUser(userId: string): Promise<Room[]>;

  // Recordings
  createRecording(data: Omit<Recording, "id" | "createdAt" | "processedFolder" | "wavS3Key" | "speakerId"> & { speakerId?: string | null }): Promise<Recording>;
  getRecordingsByRoom(roomId: string): Promise<Recording[]>;
  getRecordingsByUser(userId: string): Promise<Recording[]>;
  getRecordings(): Promise<Recording[]>;
  getRecordingById(id: string): Promise<Recording | undefined>;
  updateRecording(id: string, data: Partial<Omit<Recording, "id" | "createdAt">>): Promise<Recording>;
  getMaxProcessedFolderNumber(): Promise<number>;

  // Onboarding Samples
  createOnboardingSample(data: Omit<OnboardingSample, "id" | "createdAt" | "processedFolder" | "wavS3Key">): Promise<OnboardingSample>;
  getOnboardingSampleById(id: string): Promise<OnboardingSample | undefined>;
  getOnboardingSamplesByUser(userId: string): Promise<OnboardingSample[]>;
  updateOnboardingSample(id: string, data: Partial<Omit<OnboardingSample, "id" | "createdAt">>): Promise<OnboardingSample>;
  getTotalProcessedCount(): Promise<number>;

  // Referral Codes
  createReferralCode(userId: string): Promise<ReferralCode>;
  getReferralCodeByUser(userId: string): Promise<ReferralCode | undefined>;
  getReferralCodeByCode(code: string): Promise<ReferralCode | undefined>;

  // Room Invitations
  createRoomInvitation(data: { roomId: string; invitedBy: string; invitedUserId: string }): Promise<RoomInvitation>;
  getPendingInvitationsForUser(userId: string): Promise<(RoomInvitation & { roomName: string; inviterEmail: string })[]>;
  updateRoomInvitation(id: string, data: Partial<Omit<RoomInvitation, "id" | "createdAt">>): Promise<RoomInvitation>;

  // Notifications
  createNotification(data: { userId: string; type: string; title: string; message: string; data?: unknown }): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Task Sessions
  createTaskSession(data: { taskType: string; userId: string; partnerEmail?: string; partnerStatus?: string; status?: string }): Promise<TaskSession>;
  getTaskSessionById(id: string): Promise<TaskSession | undefined>;
  getTaskSessionsByUser(userId: string): Promise<TaskSession[]>;
  getActiveTaskSessionByUserAndType(userId: string, taskType: string): Promise<TaskSession | undefined>;
  updateTaskSession(id: string, data: Partial<Omit<TaskSession, "id" | "createdAt">>): Promise<TaskSession>;
  getTaskSessionsByRoom(roomId: string): Promise<TaskSession[]>;
  getTaskSessionsByPartner(partnerId: string): Promise<TaskSession[]>;
  getTaskSessionsByPartnerEmail(email: string): Promise<TaskSession[]>;
  updateTaskSessionsForApprovedPartner(partnerId: string): Promise<void>;
  getAllTaskSessionsWithUsers(): Promise<(TaskSession & { userEmail: string; recordings: Recording[] })[]>;
  getRecordingsByRoomIds(roomIds: string[]): Promise<Recording[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async createUser(data: { username: string; password: string }): Promise<User> {
    const [result] = await db.insert(users).values(data).returning();
    return result;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.username, username));
    return result;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, data: Partial<Omit<User, "id">>): Promise<User> {
    const [result] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result;
  }

  async approveUser(id: string): Promise<User> {
    return this.updateUser(id, { approved: true });
  }

  // Rooms
  async createRoom(data: {
    name: string;
    dailyRoomUrl: string;
    dailyRoomName: string;
    createdBy: string;
    expiresAt: Date;
  }): Promise<Room> {
    const [result] = await db.insert(rooms).values(data).returning();
    return result;
  }

  async getRoomById(id: string): Promise<Room | undefined> {
    const [result] = await db.select().from(rooms).where(eq(rooms.id, id));
    return result;
  }

  async getRoomByName(name: string): Promise<Room | undefined> {
    const [result] = await db.select().from(rooms).where(eq(rooms.name, name));
    return result;
  }

  async getRooms(): Promise<Room[]> {
    return db.select().from(rooms).orderBy(desc(rooms.createdAt));
  }

  async getRoomsByUser(userId: string): Promise<Room[]> {
    return db
      .select()
      .from(rooms)
      .where(eq(rooms.createdBy, userId))
      .orderBy(desc(rooms.createdAt));
  }

  // Recordings
  async createRecording(data: Omit<Recording, "id" | "createdAt" | "processedFolder" | "wavS3Key" | "speakerId"> & { speakerId?: string | null }): Promise<Recording> {
    const [result] = await db.insert(recordings).values(data).returning();
    return result;
  }

  async getRecordingsByRoom(roomId: string): Promise<Recording[]> {
    return db
      .select()
      .from(recordings)
      .where(eq(recordings.roomId, roomId))
      .orderBy(desc(recordings.createdAt));
  }

  async getRecordingsByUser(userId: string): Promise<Recording[]> {
    return db
      .select()
      .from(recordings)
      .where(eq(recordings.userId, userId))
      .orderBy(desc(recordings.createdAt));
  }

  async getRecordings(): Promise<Recording[]> {
    return db.select().from(recordings).orderBy(desc(recordings.createdAt));
  }

  async getRecordingById(id: string): Promise<Recording | undefined> {
    const [result] = await db.select().from(recordings).where(eq(recordings.id, id));
    return result;
  }

  async updateRecording(id: string, data: Partial<Omit<Recording, "id" | "createdAt">>): Promise<Recording> {
    const [result] = await db.update(recordings).set(data).where(eq(recordings.id, id)).returning();
    return result;
  }

  async getMaxProcessedFolderNumber(): Promise<number> {
    const result = await db.execute(sql`
      SELECT COALESCE(MAX(val), 0)::int AS max_folder FROM (
        SELECT processed_folder::int AS val FROM recordings WHERE processed_folder IS NOT NULL
        UNION ALL
        SELECT processed_folder::int AS val FROM onboarding_samples WHERE processed_folder IS NOT NULL
      ) t
    `);
    return (result.rows[0] as any).max_folder;
  }

  // Onboarding Samples
  async createOnboardingSample(data: Omit<OnboardingSample, "id" | "createdAt" | "processedFolder" | "wavS3Key">): Promise<OnboardingSample> {
    const [result] = await db.insert(onboardingSamples).values(data).returning();
    return result;
  }

  async getOnboardingSampleById(id: string): Promise<OnboardingSample | undefined> {
    const [result] = await db.select().from(onboardingSamples).where(eq(onboardingSamples.id, id));
    return result;
  }

  async getOnboardingSamplesByUser(userId: string): Promise<OnboardingSample[]> {
    return db
      .select()
      .from(onboardingSamples)
      .where(eq(onboardingSamples.userId, userId))
      .orderBy(onboardingSamples.promptIndex);
  }

  async updateOnboardingSample(id: string, data: Partial<Omit<OnboardingSample, "id" | "createdAt">>): Promise<OnboardingSample> {
    const [result] = await db.update(onboardingSamples).set(data).where(eq(onboardingSamples.id, id)).returning();
    return result;
  }

  async getTotalProcessedCount(): Promise<number> {
    const result = await db.execute(sql`
      SELECT (
        (SELECT count(*) FROM recordings WHERE processed_folder IS NOT NULL) +
        (SELECT count(*) FROM onboarding_samples WHERE processed_folder IS NOT NULL)
      )::int AS count
    `);
    return (result.rows[0] as any).count;
  }

  // Referral Codes
  async createReferralCode(userId: string): Promise<ReferralCode> {
    const code = crypto.randomBytes(6).toString("base64url").slice(0, 8);
    const [result] = await db.insert(referralCodes).values({ code, userId }).returning();
    return result;
  }

  async getReferralCodeByUser(userId: string): Promise<ReferralCode | undefined> {
    const [result] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
    return result;
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
    const [result] = await db.select().from(referralCodes).where(eq(referralCodes.code, code));
    return result;
  }

  // Room Invitations
  async createRoomInvitation(data: { roomId: string; invitedBy: string; invitedUserId: string }): Promise<RoomInvitation> {
    const [result] = await db.insert(roomInvitations).values(data).returning();
    return result;
  }

  async getPendingInvitationsForUser(userId: string): Promise<(RoomInvitation & { roomName: string; inviterEmail: string })[]> {
    const rows = await db
      .select({
        id: roomInvitations.id,
        roomId: roomInvitations.roomId,
        invitedBy: roomInvitations.invitedBy,
        invitedUserId: roomInvitations.invitedUserId,
        status: roomInvitations.status,
        createdAt: roomInvitations.createdAt,
        roomName: rooms.name,
        inviterEmail: users.username,
      })
      .from(roomInvitations)
      .innerJoin(rooms, eq(roomInvitations.roomId, rooms.id))
      .innerJoin(users, eq(roomInvitations.invitedBy, users.id))
      .where(
        and(
          eq(roomInvitations.invitedUserId, userId),
          eq(roomInvitations.status, "pending")
        )
      )
      .orderBy(desc(roomInvitations.createdAt));
    return rows;
  }

  async updateRoomInvitation(id: string, data: Partial<Omit<RoomInvitation, "id" | "createdAt">>): Promise<RoomInvitation> {
    const [result] = await db.update(roomInvitations).set(data).where(eq(roomInvitations.id, id)).returning();
    return result;
  }

  // Notifications
  async createNotification(data: { userId: string; type: string; title: string; message: string; data?: unknown }): Promise<Notification> {
    const [result] = await db.insert(notifications).values(data).returning();
    return result;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result.count;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }

  // Task Sessions
  async createTaskSession(data: { taskType: string; userId: string; partnerEmail?: string; partnerStatus?: string; status?: string }): Promise<TaskSession> {
    const [result] = await db.insert(taskSessions).values(data).returning();
    return result;
  }

  async getTaskSessionById(id: string): Promise<TaskSession | undefined> {
    const [result] = await db.select().from(taskSessions).where(eq(taskSessions.id, id));
    return result;
  }

  async getTaskSessionsByUser(userId: string): Promise<TaskSession[]> {
    return db.select().from(taskSessions).where(eq(taskSessions.userId, userId)).orderBy(desc(taskSessions.createdAt));
  }

  async getActiveTaskSessionByUserAndType(userId: string, taskType: string): Promise<TaskSession | undefined> {
    const [result] = await db
      .select()
      .from(taskSessions)
      .where(and(eq(taskSessions.userId, userId), eq(taskSessions.taskType, taskType), sql`${taskSessions.status} != 'completed'`))
      .orderBy(desc(taskSessions.createdAt))
      .limit(1);
    return result;
  }

  async updateTaskSession(id: string, data: Partial<Omit<TaskSession, "id" | "createdAt">>): Promise<TaskSession> {
    const [result] = await db.update(taskSessions).set({ ...data, updatedAt: new Date() }).where(eq(taskSessions.id, id)).returning();
    return result;
  }

  async getTaskSessionsByRoom(roomId: string): Promise<TaskSession[]> {
    return db.select().from(taskSessions).where(eq(taskSessions.roomId, roomId));
  }

  async getTaskSessionsByPartner(partnerId: string): Promise<TaskSession[]> {
    return db.select().from(taskSessions).where(eq(taskSessions.partnerId, partnerId));
  }

  async getTaskSessionsByPartnerEmail(email: string): Promise<TaskSession[]> {
    return db.select().from(taskSessions).where(and(eq(taskSessions.partnerEmail, email), eq(taskSessions.partnerStatus, "invited")));
  }

  async updateTaskSessionsForApprovedPartner(partnerId: string): Promise<void> {
    await db
      .update(taskSessions)
      .set({ partnerStatus: "approved", status: "ready_to_record", updatedAt: new Date() })
      .where(and(eq(taskSessions.partnerId, partnerId), eq(taskSessions.partnerStatus, "registered")));
  }

  async getAllTaskSessionsWithUsers(): Promise<(TaskSession & { userEmail: string; recordings: Recording[] })[]> {
    const rows = await db
      .select({
        id: taskSessions.id,
        taskType: taskSessions.taskType,
        userId: taskSessions.userId,
        partnerId: taskSessions.partnerId,
        partnerEmail: taskSessions.partnerEmail,
        partnerStatus: taskSessions.partnerStatus,
        roomId: taskSessions.roomId,
        status: taskSessions.status,
        paid: taskSessions.paid,
        reviewerStatus: taskSessions.reviewerStatus,
        createdAt: taskSessions.createdAt,
        updatedAt: taskSessions.updatedAt,
        userEmail: users.username,
      })
      .from(taskSessions)
      .innerJoin(users, eq(taskSessions.userId, users.id))
      .orderBy(desc(taskSessions.updatedAt));

    // Bulk-fetch recordings for all sessions that have a roomId
    const roomIds = rows.map((r) => r.roomId).filter((id): id is string => !!id);
    const allRecordings = roomIds.length > 0 ? await this.getRecordingsByRoomIds(roomIds) : [];

    // Group recordings by roomId
    const recordingsByRoom = new Map<string, Recording[]>();
    for (const rec of allRecordings) {
      const arr = recordingsByRoom.get(rec.roomId) || [];
      arr.push(rec);
      recordingsByRoom.set(rec.roomId, arr);
    }

    return rows.map((row) => ({
      ...row,
      recordings: row.roomId ? recordingsByRoom.get(row.roomId) || [] : [],
    }));
  }

  async getRecordingsByRoomIds(roomIds: string[]): Promise<Recording[]> {
    if (roomIds.length === 0) return [];
    return db
      .select()
      .from(recordings)
      .where(inArray(recordings.roomId, roomIds))
      .orderBy(desc(recordings.createdAt));
  }
}

export const storage = new DatabaseStorage();
