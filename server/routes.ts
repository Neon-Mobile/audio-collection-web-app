import type { Express } from "express";
import type { Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { requireAuth, requireApproved, requireAdmin, hashPassword } from "./auth";
import { loginSchema, onboardingSchema, createRoomSchema } from "@shared/schema";
import { createDailyRoom, createMeetingToken } from "./daily";
import { generateUploadUrl, generateDownloadUrl } from "./s3";
import { processRecording, processOnboardingSample } from "./process-recording";

const S3_BUCKET = process.env.AWS_S3_BUCKET || "web-app-call-recordings";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Auth Routes ──────────────────────────────────────────────

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const existing = await storage.getUserByUsername(parsed.data.username);
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }

      const hashedPassword = await hashPassword(parsed.data.password);
      const user = await storage.createUser({
        username: parsed.data.username,
        password: hashedPassword,
      });

      req.login(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          approved: user.approved,
          onboardingData: user.onboardingData,
          onboardingCompletedAt: user.onboardingCompletedAt,
          samplesCompletedAt: user.samplesCompletedAt,
          createdAt: user.createdAt,
        },
        (err) => {
          if (err) {
            return res.status(500).json({ error: "Login failed after registration" });
          }
          res.status(201).json({
            id: user.id,
            username: user.username,
            role: user.role,
            approved: user.approved,
            onboardingData: user.onboardingData,
            onboardingCompletedAt: user.onboardingCompletedAt,
            samplesCompletedAt: user.samplesCompletedAt,
          });
        }
      );
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });

      req.login(user, (err) => {
        if (err) return next(err);
        res.json({
          id: user.id,
          username: user.username,
          role: user.role,
          approved: user.approved,
          onboardingData: user.onboardingData,
          onboardingCompletedAt: user.onboardingCompletedAt,
          samplesCompletedAt: user.samplesCompletedAt,
        });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json({
      id: req.user!.id,
      username: req.user!.username,
      role: req.user!.role,
      approved: req.user!.approved,
      onboardingData: req.user!.onboardingData,
      onboardingCompletedAt: req.user!.onboardingCompletedAt,
      samplesCompletedAt: req.user!.samplesCompletedAt,
    });
  });

  app.post("/api/auth/onboarding", requireAuth, async (req, res) => {
    try {
      const parsed = onboardingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const user = await storage.updateUser(req.user!.id, {
        onboardingData: parsed.data,
        onboardingCompletedAt: new Date(),
      });

      // Update the session
      req.user!.onboardingData = user.onboardingData;
      req.user!.onboardingCompletedAt = user.onboardingCompletedAt;

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        approved: user.approved,
        onboardingData: user.onboardingData,
        onboardingCompletedAt: user.onboardingCompletedAt,
        samplesCompletedAt: user.samplesCompletedAt,
      });
    } catch (error) {
      console.error("Onboarding error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Onboarding Sample Routes ────────────────────────────────

  app.post("/api/onboarding/sample-upload-url", requireAuth, async (req, res) => {
    try {
      const { promptIndex, promptText, fileName, duration, fileSize } = req.body;

      if (promptIndex === undefined || !promptText || !fileName) {
        return res.status(400).json({ error: "Missing required fields: promptIndex, promptText, fileName" });
      }

      const s3Key = `onboarding-samples/${req.user!.id}/${promptIndex}.webm`;

      const uploadUrl = await generateUploadUrl({
        key: s3Key,
        contentType: "audio/webm",
        metadata: {
          "sample-rate": "48000",
          channels: "1",
          format: "webm",
          duration: String(duration || 0),
          "file-size": String(fileSize || 0),
          "recorded-at": new Date().toISOString(),
          "user-id": req.user!.id,
          "prompt-index": String(promptIndex),
        },
      });

      const sample = await storage.createOnboardingSample({
        userId: req.user!.id,
        promptIndex,
        promptText,
        s3Key,
        s3Bucket: S3_BUCKET,
        fileName,
        duration: duration || null,
        fileSize: fileSize || null,
        format: "webm",
        sampleRate: 48000,
        channels: 1,
      });

      res.json({ uploadUrl, sampleId: sample.id, s3Key });
    } catch (error) {
      console.error("Sample upload URL error:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.post("/api/onboarding/samples/:id/process", requireAuth, async (req, res) => {
    try {
      const sample = await processOnboardingSample(req.params.id as string);
      res.json({
        processedFolder: sample.processedFolder,
        wavS3Key: sample.wavS3Key,
      });
    } catch (error: any) {
      console.error("Process onboarding sample error:", error);
      res.status(500).json({ error: error.message || "Failed to process sample" });
    }
  });

  app.post("/api/onboarding/samples-complete", requireAuth, async (req, res) => {
    try {
      const user = await storage.updateUser(req.user!.id, {
        samplesCompletedAt: new Date(),
      });

      // Update session
      req.user!.samplesCompletedAt = user.samplesCompletedAt;

      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        approved: user.approved,
        onboardingData: user.onboardingData,
        onboardingCompletedAt: user.onboardingCompletedAt,
        samplesCompletedAt: user.samplesCompletedAt,
      });
    } catch (error) {
      console.error("Samples complete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Room Routes ──────────────────────────────────────────────

  app.post("/api/rooms", requireApproved, async (req, res) => {
    try {
      const parsed = createRoomSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const dailyRoom = await createDailyRoom(parsed.data.name);

      const room = await storage.createRoom({
        name: dailyRoom.name,
        dailyRoomUrl: dailyRoom.url,
        dailyRoomName: dailyRoom.name,
        createdBy: req.user!.id,
        expiresAt: dailyRoom.expiresAt,
      });

      res.status(201).json(room);
    } catch (error) {
      console.error("Room creation error:", error);
      res.status(500).json({ error: "Failed to create room" });
    }
  });

  app.get("/api/rooms", requireAuth, async (req, res) => {
    try {
      const userRooms = await storage.getRoomsByUser(req.user!.id);
      res.json(userRooms);
    } catch (error) {
      console.error("Fetch rooms error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/rooms/:id", requireAuth, async (req, res) => {
    try {
      const room = await storage.getRoomById(req.params.id as string);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      console.error("Fetch room error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/rooms/:id/token", requireApproved, async (req, res) => {
    try {
      const room = await storage.getRoomById(req.params.id as string);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      const token = await createMeetingToken(room.dailyRoomName, room.expiresAt);
      res.json({ token, roomUrl: room.dailyRoomUrl });
    } catch (error) {
      console.error("Token generation error:", error);
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  // ── Recording Routes ─────────────────────────────────────────

  app.post("/api/recordings/upload-url", requireApproved, async (req, res) => {
    try {
      const { roomId, fileName, duration, fileSize, format, sampleRate, channels, recordingType } = req.body;

      if (!roomId || !fileName || !recordingType) {
        return res.status(400).json({ error: "Missing required fields: roomId, fileName, recordingType" });
      }

      const room = await storage.getRoomById(roomId);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const s3Key = `recordings/${roomId}/${req.user!.id}/${timestamp}-${fileName}`;

      const uploadUrl = await generateUploadUrl({
        key: s3Key,
        contentType: format === "wav" ? "audio/wav" : "audio/webm",
        metadata: {
          "sample-rate": String(sampleRate || 48000),
          channels: String(channels || 1),
          format: format || "webm",
          duration: String(duration || 0),
          "file-size": String(fileSize || 0),
          "recorded-at": new Date().toISOString(),
          "room-id": roomId,
          "user-id": req.user!.id,
        },
      });

      const recording = await storage.createRecording({
        roomId,
        userId: req.user!.id,
        s3Key,
        s3Bucket: S3_BUCKET,
        fileName,
        duration: duration || null,
        fileSize: fileSize || null,
        format: format || "webm",
        sampleRate: sampleRate || 48000,
        channels: channels || 1,
        recordingType,
      });

      res.json({ uploadUrl, recordingId: recording.id, s3Key });
    } catch (error) {
      console.error("Upload URL error:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.get("/api/recordings", requireAuth, async (req, res) => {
    try {
      const userRecordings = await storage.getRecordingsByUser(req.user!.id);
      res.json(userRecordings);
    } catch (error) {
      console.error("Fetch recordings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/recordings/room/:roomId", requireAuth, async (req, res) => {
    try {
      const roomRecordings = await storage.getRecordingsByRoom(req.params.roomId as string);
      res.json(roomRecordings);
    } catch (error) {
      console.error("Fetch room recordings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/recordings/:id/download", requireAuth, async (req, res) => {
    try {
      const recording = await storage.getRecordingById(req.params.id as string);
      if (!recording) {
        return res.status(404).json({ error: "Recording not found" });
      }

      const downloadUrl = await generateDownloadUrl(recording.s3Key);
      res.json({ downloadUrl });
    } catch (error) {
      console.error("Download URL error:", error);
      res.status(500).json({ error: "Failed to generate download URL" });
    }
  });

  app.post("/api/recordings/:id/process", requireApproved, async (req, res) => {
    try {
      const recording = await processRecording(req.params.id as string);
      res.json({
        processedFolder: recording.processedFolder,
        wavS3Key: recording.wavS3Key,
      });
    } catch (error: any) {
      console.error("Process recording error:", error);
      res.status(500).json({ error: error.message || "Failed to process recording" });
    }
  });

  app.get("/api/recordings/:id/download-wav", requireAuth, async (req, res) => {
    try {
      const recording = await storage.getRecordingById(req.params.id as string);
      if (!recording) {
        return res.status(404).json({ error: "Recording not found" });
      }
      if (!recording.wavS3Key) {
        return res.status(404).json({ error: "WAV not available — recording not yet processed" });
      }

      const downloadUrl = await generateDownloadUrl(recording.wavS3Key);
      res.json({ downloadUrl });
    } catch (error) {
      console.error("Download WAV error:", error);
      res.status(500).json({ error: "Failed to generate download URL" });
    }
  });

  // ── Admin Routes ─────────────────────────────────────────────

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getUsers();
      res.json(
        allUsers.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          approved: u.approved,
          onboardingData: u.onboardingData,
          onboardingCompletedAt: u.onboardingCompletedAt,
          samplesCompletedAt: u.samplesCompletedAt,
          createdAt: u.createdAt,
        }))
      );
    } catch (error) {
      console.error("Admin fetch users error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
    try {
      const user = await storage.approveUser(req.params.id as string);
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        approved: user.approved,
      });
    } catch (error) {
      console.error("Admin approve user error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !["admin", "user"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      const user = await storage.updateUser(req.params.id as string, { role });
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        approved: user.approved,
      });
    } catch (error) {
      console.error("Admin change role error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/rooms", requireAdmin, async (_req, res) => {
    try {
      const allRooms = await storage.getRooms();
      res.json(allRooms);
    } catch (error) {
      console.error("Admin fetch rooms error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/recordings", requireAdmin, async (_req, res) => {
    try {
      const allRecordings = await storage.getRecordings();
      res.json(allRecordings);
    } catch (error) {
      console.error("Admin fetch recordings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
