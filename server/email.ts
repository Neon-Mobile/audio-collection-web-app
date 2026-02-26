import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || "noreply@neon.audio";
const APP_URL = process.env.APP_URL || "https://neon.audio";

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const command = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [params.to] },
    Message: {
      Subject: { Data: params.subject },
      Body: {
        Html: { Data: params.html },
        Text: { Data: params.text },
      },
    },
  });

  try {
    await sesClient.send(command);
    console.log(`Email sent to ${params.to}: ${params.subject}`);
  } catch (error) {
    console.error("SES send error:", error);
  }
}

export async function sendTaskPartnerInvitationEmail(params: {
  to: string;
  inviterName: string;
  taskName: string;
  inviteLink: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `${params.inviterName} invited you to record on Voice Atlas`,
    html: `
      <h2>You've been invited to participate in a recording task</h2>
      <p><strong>${params.inviterName}</strong> wants you to join them for a <strong>"${params.taskName}"</strong> recording on Voice Atlas.</p>
      <p>To get started, create your account using the link below:</p>
      <p><a href="${params.inviteLink}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">Sign Up &amp; Join</a></p>
      <p style="color:#666;font-size:14px;">Or copy this link: ${params.inviteLink}</p>
    `,
    text: `${params.inviterName} invited you to join them for a "${params.taskName}" recording on Voice Atlas. Sign up here: ${params.inviteLink}`,
  });
}

export async function sendRoomInvitationEmail(params: {
  to: string;
  inviterName: string;
  roomName: string;
  roomId: string;
}): Promise<void> {
  const joinUrl = `${APP_URL}/room/${params.roomId}`;

  await sendEmail({
    to: params.to,
    subject: `${params.inviterName} invited you to a conversation on Voice Atlas`,
    html: `
      <h2>You've been invited to a conversation</h2>
      <p><strong>${params.inviterName}</strong> has invited you to join the room <strong>"${params.roomName}"</strong>.</p>
      <p><a href="${joinUrl}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">Join Room</a></p>
      <p style="color:#666;font-size:14px;">Or copy this link: ${joinUrl}</p>
    `,
    text: `${params.inviterName} invited you to join "${params.roomName}". Join here: ${joinUrl}`,
  });
}
