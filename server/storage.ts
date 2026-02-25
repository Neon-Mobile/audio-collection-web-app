import { type User, type Room, type Recording, users, rooms, recordings } from "@shared/schema";
import { db } from "./db";
import { eq, desc, isNotNull, sql } from "drizzle-orm";

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
  createRecording(data: Omit<Recording, "id" | "createdAt" | "processedFolder" | "wavS3Key">): Promise<Recording>;
  getRecordingsByRoom(roomId: string): Promise<Recording[]>;
  getRecordingsByUser(userId: string): Promise<Recording[]>;
  getRecordings(): Promise<Recording[]>;
  getRecordingById(id: string): Promise<Recording | undefined>;
  updateRecording(id: string, data: Partial<Omit<Recording, "id" | "createdAt">>): Promise<Recording>;
  getProcessedRecordingCount(): Promise<number>;
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
  async createRecording(data: Omit<Recording, "id" | "createdAt" | "processedFolder" | "wavS3Key">): Promise<Recording> {
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

  async getProcessedRecordingCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recordings)
      .where(isNotNull(recordings.processedFolder));
    return result.count;
  }
}

export const storage = new DatabaseStorage();
