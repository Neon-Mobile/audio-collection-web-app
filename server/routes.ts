import type { Express } from "express";
import type { Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { requireAuth, requireApproved, requireAdmin, hashPassword } from "./auth";
import { loginSchema, onboardingSchema, createRoomSchema, inviteToRoomSchema, createTaskSessionSchema, inviteTaskPartnerSchema, TASK_TYPES } from "@shared/schema";
import { createDailyRoom, createMeetingToken } from "./daily";
import { generateUploadUrl, generateDownloadUrl } from "./s3";
import { processRecording, processOnboardingSample } from "./process-recording";
import { sendRoomInvitationEmail, sendTaskPartnerInvitationEmail } from "./email";

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

      // Handle referral code if provided
      const { referralCode } = req.body;
      if (referralCode) {
        const referral = await storage.getReferralCodeByCode(referralCode);
        if (referral) {
          await storage.updateUser(user.id, { referredBy: referral.userId });
          await storage.createNotification({
            userId: referral.userId,
            type: "referral_registered",
            title: "Your friend registered!",
            message: `${parsed.data.username} signed up using your referral link.`,
            data: { referredUserId: user.id },
          });
        }
      }

      // Update any task sessions waiting for this email as a partner
      const pendingTaskSessions = await storage.getTaskSessionsByPartnerEmail(parsed.data.username);
      for (const session of pendingTaskSessions) {
        await storage.updateTaskSession(session.id, {
          partnerId: user.id,
          partnerStatus: "registered",
          status: "waiting_approval",
        });
        await storage.createNotification({
          userId: session.userId,
          type: "partner_registered",
          title: "Partner Registered!",
          message: `${parsed.data.username} has signed up! They are now waiting for admin approval.`,
          data: { taskSessionId: session.id },
        });
      }

      req.login(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          approved: user.approved,
          onboardingData: user.onboardingData,
          onboardingCompletedAt: user.onboardingCompletedAt,
          samplesCompletedAt: user.samplesCompletedAt,
          referredBy: user.referredBy,
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

  app.get("/api/rooms/:id/task-session", requireAuth, async (req, res) => {
    try {
      const sessions = await storage.getTaskSessionsByRoom(req.params.id as string);
      res.json(sessions[0] || null);
    } catch (error) {
      console.error("Fetch room task session error:", error);
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
      const { roomId, fileName, duration, fileSize, format, sampleRate, channels, recordingType, speakerId } = req.body;

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
        speakerId: speakerId || null,
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
      const { folderNumber } = req.body || {};
      const recording = await processRecording(req.params.id as string, folderNumber);
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

  // ── Referral Routes ─────────────────────────────────────────

  app.post("/api/referrals/code", requireApproved, async (req, res) => {
    try {
      let code = await storage.getReferralCodeByUser(req.user!.id);
      if (!code) {
        code = await storage.createReferralCode(req.user!.id);
      }
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      res.json({ code: code.code, link: `${appUrl}/invite/${code.code}` });
    } catch (error) {
      console.error("Referral code error:", error);
      res.status(500).json({ error: "Failed to generate referral code" });
    }
  });

  app.get("/api/referrals/validate/:code", async (req, res) => {
    try {
      const referral = await storage.getReferralCodeByCode(req.params.code as string);
      if (!referral) {
        return res.status(404).json({ error: "Invalid referral code" });
      }
      const referrer = await storage.getUserById(referral.userId);
      const firstName = (referrer?.onboardingData as any)?.firstName || "Someone";
      res.json({ valid: true, referrerName: firstName });
    } catch (error) {
      console.error("Validate referral error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Invitation Routes ──────────────────────────────────────

  app.post("/api/rooms/:id/invite", requireApproved, async (req, res) => {
    try {
      const parsed = inviteToRoomSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const room = await storage.getRoomById(req.params.id as string);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      if (room.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Only the room creator can invite users" });
      }

      const invitedUser = await storage.getUserByUsername(parsed.data.email);
      if (!invitedUser) {
        return res.status(404).json({ error: "No user found with that email. They need to register first." });
      }
      if (!invitedUser.approved) {
        return res.status(400).json({ error: "That user hasn't been approved yet." });
      }
      if (invitedUser.id === req.user!.id) {
        return res.status(400).json({ error: "You can't invite yourself." });
      }

      const invitation = await storage.createRoomInvitation({
        roomId: room.id,
        invitedBy: req.user!.id,
        invitedUserId: invitedUser.id,
      });

      const inviterName = (req.user!.onboardingData as any)?.firstName || req.user!.username;
      await storage.createNotification({
        userId: invitedUser.id,
        type: "room_invitation",
        title: "Room Invitation",
        message: `${inviterName} invited you to join "${room.name}"`,
        data: { roomId: room.id, invitationId: invitation.id },
      });

      // Send email (fire and forget)
      sendRoomInvitationEmail({
        to: invitedUser.username,
        inviterName,
        roomName: room.name,
        roomId: room.id,
      });

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Room invitation error:", error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  app.get("/api/invitations/pending", requireApproved, async (req, res) => {
    try {
      const invitations = await storage.getPendingInvitationsForUser(req.user!.id);
      res.json(invitations);
    } catch (error) {
      console.error("Fetch invitations error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/invitations/:id", requireApproved, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !["accepted", "declined"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const invitation = await storage.updateRoomInvitation(req.params.id as string, { status });

      // If accepted, update any linked task sessions
      if (status === "accepted") {
        const sessions = await storage.getTaskSessionsByRoom(invitation.roomId);
        for (const session of sessions) {
          if (session.partnerId === req.user!.id) {
            await storage.updateTaskSession(session.id, {
              partnerStatus: "ready",
              status: "in_progress",
            });
          }
        }
      }

      res.json(invitation);
    } catch (error) {
      console.error("Update invitation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Notification Routes ────────────────────────────────────

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.user!.id);
      res.json(notifs);
    } catch (error) {
      console.error("Fetch notifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error("Unread count error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id as string);
      res.json({ ok: true });
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.user!.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("Mark all read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Task Session Routes ──────────────────────────────────────

  app.get("/api/task-types", requireAuth, (_req, res) => {
    res.json(TASK_TYPES);
  });

  app.post("/api/task-sessions", requireApproved, async (req, res) => {
    try {
      const parsed = createTaskSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const taskType = TASK_TYPES.find((t) => t.id === parsed.data.taskType);
      if (!taskType) {
        return res.status(400).json({ error: "Invalid task type" });
      }

      // Return existing active session if one exists
      const existing = await storage.getActiveTaskSessionByUserAndType(req.user!.id, parsed.data.taskType);
      if (existing) {
        return res.json(existing);
      }

      const session = await storage.createTaskSession({
        taskType: parsed.data.taskType,
        userId: req.user!.id,
        partnerEmail: parsed.data.partnerEmail,
        partnerStatus: parsed.data.partnerEmail ? "invited" : "none",
        status: "inviting_partner",
      });

      res.status(201).json(session);
    } catch (error) {
      console.error("Create task session error:", error);
      res.status(500).json({ error: "Failed to create task session" });
    }
  });

  app.get("/api/task-sessions", requireApproved, async (req, res) => {
    try {
      const sessions = await storage.getTaskSessionsByUser(req.user!.id);
      res.json(sessions);
    } catch (error) {
      console.error("Fetch task sessions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/task-sessions/:id", requireApproved, async (req, res) => {
    try {
      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session) {
        return res.status(404).json({ error: "Task session not found" });
      }
      if (session.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Dynamically recompute partner status
      let updatedSession = session;
      if (session.partnerEmail && !session.partnerId) {
        const partner = await storage.getUserByUsername(session.partnerEmail);
        if (partner) {
          const partnerStatus = partner.approved ? "approved" : "registered";
          const status = partner.approved ? "ready_to_record" : "waiting_approval";
          updatedSession = await storage.updateTaskSession(session.id, { partnerId: partner.id, partnerStatus, status });
        }
      } else if (session.partnerId && session.partnerStatus !== "ready") {
        const partner = await storage.getUserById(session.partnerId);
        if (partner && partner.approved && session.partnerStatus !== "approved") {
          updatedSession = await storage.updateTaskSession(session.id, { partnerStatus: "approved", status: "ready_to_record" });
        }
      }

      res.json(updatedSession);
    } catch (error) {
      console.error("Fetch task session error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/task-sessions/:id/invite-partner", requireApproved, async (req, res) => {
    try {
      const parsed = inviteTaskPartnerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session || session.userId !== req.user!.id) {
        return res.status(404).json({ error: "Task session not found" });
      }

      const existingUser = await storage.getUserByUsername(parsed.data.email);

      if (existingUser) {
        const partnerStatus = existingUser.approved ? "approved" : "registered";
        const status = existingUser.approved ? "ready_to_record" : "waiting_approval";
        const updated = await storage.updateTaskSession(session.id, {
          partnerEmail: parsed.data.email,
          partnerId: existingUser.id,
          partnerStatus,
          status,
        });
        return res.json(updated);
      }

      // Partner not registered — send referral invitation email
      let referralCode = await storage.getReferralCodeByUser(req.user!.id);
      if (!referralCode) {
        referralCode = await storage.createReferralCode(req.user!.id);
      }

      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const inviteLink = `${appUrl}/invite/${referralCode.code}`;
      const taskDef = TASK_TYPES.find((t) => t.id === session.taskType);

      sendTaskPartnerInvitationEmail({
        to: parsed.data.email,
        inviterName: (req.user!.onboardingData as any)?.firstName || req.user!.username,
        taskName: taskDef?.name || session.taskType,
        inviteLink,
      });

      const updated = await storage.updateTaskSession(session.id, {
        partnerEmail: parsed.data.email,
        partnerStatus: "invited",
        status: "inviting_partner",
      });
      res.json(updated);
    } catch (error) {
      console.error("Invite partner error:", error);
      res.status(500).json({ error: "Failed to invite partner" });
    }
  });

  app.post("/api/task-sessions/:id/create-room", requireApproved, async (req, res) => {
    try {
      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session || session.userId !== req.user!.id) {
        return res.status(404).json({ error: "Task session not found" });
      }

      if (!session.partnerId) {
        return res.status(400).json({ error: "No partner assigned to this task session" });
      }

      const partner = await storage.getUserById(session.partnerId);
      if (!partner || !partner.approved) {
        return res.status(400).json({ error: "Partner is not yet approved" });
      }

      // If room already exists, return the session
      if (session.roomId) {
        return res.json(session);
      }

      const taskDef = TASK_TYPES.find((t) => t.id === session.taskType);
      const dailyRoom = await createDailyRoom(taskDef?.name?.slice(0, 40));

      const room = await storage.createRoom({
        name: dailyRoom.name,
        dailyRoomUrl: dailyRoom.url,
        dailyRoomName: dailyRoom.name,
        createdBy: req.user!.id,
        expiresAt: dailyRoom.expiresAt,
      });

      const updated = await storage.updateTaskSession(session.id, {
        roomId: room.id,
        status: "room_created",
      });

      // Create room invitation for partner
      const invitation = await storage.createRoomInvitation({
        roomId: room.id,
        invitedBy: req.user!.id,
        invitedUserId: session.partnerId,
      });

      const inviterName = (req.user!.onboardingData as any)?.firstName || req.user!.username;
      await storage.createNotification({
        userId: session.partnerId,
        type: "task_room_invitation",
        title: "Ready to Record!",
        message: `${inviterName} has created a room for "${taskDef?.name}". Join now to start recording.`,
        data: { roomId: room.id, invitationId: invitation.id, taskSessionId: session.id },
      });

      sendRoomInvitationEmail({
        to: partner.username,
        inviterName,
        roomName: room.name,
        roomId: room.id,
      });

      res.status(201).json(updated);
    } catch (error) {
      console.error("Create task room error:", error);
      res.status(500).json({ error: "Failed to create room for task" });
    }
  });

  app.patch("/api/task-sessions/:id/complete", requireApproved, async (req, res) => {
    try {
      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session || (session.userId !== req.user!.id && session.partnerId !== req.user!.id)) {
        return res.status(404).json({ error: "Task session not found" });
      }
      const updated = await storage.updateTaskSession(session.id, { status: "pending_review" });
      res.json(updated);
    } catch (error) {
      console.error("Complete task session error:", error);
      res.status(500).json({ error: "Failed to complete task session" });
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

      // Update any task sessions where this user is the partner
      await storage.updateTaskSessionsForApprovedPartner(user.id);
      const sessionsAsPartner = await storage.getTaskSessionsByPartner(user.id);
      for (const session of sessionsAsPartner) {
        const taskType = TASK_TYPES.find((t) => t.id === session.taskType);
        await storage.createNotification({
          userId: session.userId,
          type: "partner_approved",
          title: "Partner Approved!",
          message: `Your partner for "${taskType?.name}" has been approved. You can now create a room.`,
          data: { taskSessionId: session.id },
        });
      }

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

  app.get("/api/admin/task-sessions", requireAdmin, async (_req, res) => {
    try {
      const sessions = await storage.getAllTaskSessionsWithUsers();
      res.json(sessions);
    } catch (error) {
      console.error("Admin fetch task sessions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/task-sessions/:id/paid", requireAdmin, async (req, res) => {
    try {
      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session) {
        return res.status(404).json({ error: "Task session not found" });
      }
      const { paid } = req.body;
      if (typeof paid !== "boolean") {
        return res.status(400).json({ error: "paid must be a boolean" });
      }
      const updated = await storage.updateTaskSession(session.id, { paid });
      res.json(updated);
    } catch (error) {
      console.error("Admin toggle paid error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/task-sessions/:id/reviewer-status", requireAdmin, async (req, res) => {
    try {
      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session) {
        return res.status(404).json({ error: "Task session not found" });
      }
      const { reviewerStatus } = req.body;
      if (reviewerStatus !== null && !["approved", "rejected", "unsure"].includes(reviewerStatus)) {
        return res.status(400).json({ error: "reviewerStatus must be approved, rejected, unsure, or null" });
      }
      const updated = await storage.updateTaskSession(session.id, { reviewerStatus });
      res.json(updated);
    } catch (error) {
      console.error("Admin set reviewer status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/task-sessions/:id/approve", requireAdmin, async (req, res) => {
    try {
      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session) {
        return res.status(404).json({ error: "Task session not found" });
      }
      if (session.status !== "pending_review") {
        return res.status(400).json({ error: "Session is not pending review" });
      }
      const updated = await storage.updateTaskSession(session.id, { status: "completed" });

      const taskDef = TASK_TYPES.find((t) => t.id === session.taskType);
      await storage.createNotification({
        userId: session.userId,
        type: "recording_approved",
        title: "Recording Approved!",
        message: `Your recording for "${taskDef?.name || session.taskType}" has been approved.`,
        data: { taskSessionId: session.id },
      });

      res.json(updated);
    } catch (error) {
      console.error("Admin approve task session error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/admin/task-sessions/:id/reject", requireAdmin, async (req, res) => {
    try {
      const session = await storage.getTaskSessionById(req.params.id as string);
      if (!session) {
        return res.status(404).json({ error: "Task session not found" });
      }
      if (session.status !== "pending_review") {
        return res.status(400).json({ error: "Session is not pending review" });
      }
      const updated = await storage.updateTaskSession(session.id, { status: "room_created" });

      const taskDef = TASK_TYPES.find((t) => t.id === session.taskType);
      await storage.createNotification({
        userId: session.userId,
        type: "recording_rejected",
        title: "Recording Needs Redo",
        message: `Your recording for "${taskDef?.name || session.taskType}" was not approved. Please record again.`,
        data: { taskSessionId: session.id },
      });

      res.json(updated);
    } catch (error) {
      console.error("Admin reject task session error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
