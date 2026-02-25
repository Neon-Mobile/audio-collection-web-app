const DAILY_API_URL = "https://api.daily.co/v1";
const DAILY_API_KEY = process.env.DAILY_API_KEY || "";

const DEFAULT_ROOM_EXPIRY_HOURS = 5;

export function sanitizeRoomName(name: string): string {
  return name
    .replace(/[^A-Za-z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateRoomName(customName?: string): string {
  if (customName && customName.trim()) {
    return sanitizeRoomName(customName.trim());
  }
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `room-${timestamp}-${random}`;
}

export async function createDailyRoom(customName?: string): Promise<{
  url: string;
  name: string;
  dailyRoomId: string;
  expiresAt: Date;
}> {
  const name = generateRoomName(customName);
  const expiresAt = new Date(Date.now() + DEFAULT_ROOM_EXPIRY_HOURS * 60 * 60 * 1000);
  const exp = Math.floor(expiresAt.getTime() / 1000);

  const response = await fetch(`${DAILY_API_URL}/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      name,
      privacy: "public",
      properties: {
        enable_recording: "raw-tracks",
        exp,
        sfu_switchover: 0.5,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Daily.co room creation failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return {
    url: data.url,
    name: data.name,
    dailyRoomId: data.id,
    expiresAt,
  };
}

export async function createMeetingToken(
  roomName: string,
  expiresAt: Date
): Promise<string> {
  const exp = Math.floor(expiresAt.getTime() / 1000);

  const response = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        exp,
        eject_at_token_exp: true,
        enable_screenshare: false,
        start_video_off: true,
        start_audio_off: false,
        enable_recording: "raw-tracks",
        start_cloud_recording: true,
        start_cloud_recording_opts: {
          audioBitrate: 320,
          layout: { preset: "raw-tracks-audio-only" },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Daily.co token creation failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.token;
}
