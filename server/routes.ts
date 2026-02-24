import express, { type Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertApplicationSchema } from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerObjectStorageRoutes(app);

  app.get("/api/network-test/ping", (_req, res) => {
    res.json({ ts: Date.now() });
  });

  const downloadChunks = new Map<number, Buffer>();
  function getDownloadChunk(sizeMB: number): Buffer {
    if (!downloadChunks.has(sizeMB)) {
      downloadChunks.set(sizeMB, crypto.randomBytes(sizeMB * 1024 * 1024));
    }
    return downloadChunks.get(sizeMB)!;
  }

  app.get("/api/network-test/download", (req, res) => {
    const sizeMB = Math.min(Math.max(Number(req.query.size) || 5, 1), 10);
    const chunk = getDownloadChunk(sizeMB);
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(chunk.length),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    });
    res.send(chunk);
  });

  app.post("/api/network-test/upload", express.raw({ type: "application/octet-stream", limit: "10mb" }), (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body.length : 0;
    res.json({ received: bytes });
  });

  app.post("/api/applications", async (req, res) => {
    try {
      const parsed = insertApplicationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const application = await storage.createApplication(parsed.data);
      res.status(201).json(application);
    } catch (error) {
      console.error("Failed to create application:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/applications", async (_req, res) => {
    try {
      const apps = await storage.getApplications();
      res.json(apps);
    } catch (error) {
      console.error("Failed to fetch applications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/applications/:id", async (req, res) => {
    try {
      const application = await storage.getApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }
      res.json(application);
    } catch (error) {
      console.error("Failed to fetch application:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
