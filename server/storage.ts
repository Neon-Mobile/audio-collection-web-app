import { type Application, type InsertApplication, applications } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createApplication(app: InsertApplication): Promise<Application>;
  getApplications(): Promise<Application[]>;
  getApplication(id: string): Promise<Application | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createApplication(app: InsertApplication): Promise<Application> {
    const [result] = await db.insert(applications).values(app).returning();
    return result;
  }

  async getApplications(): Promise<Application[]> {
    return db.select().from(applications).orderBy(desc(applications.createdAt));
  }

  async getApplication(id: string): Promise<Application | undefined> {
    const [result] = await db.select().from(applications).where(eq(applications.id, id));
    return result;
  }
}

export const storage = new DatabaseStorage();
