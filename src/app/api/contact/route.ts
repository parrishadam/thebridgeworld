import { NextRequest, NextResponse } from "next/server";

// ── Email routing ──────────────────────────────────────────────────────────

const RECIPIENT_MAP: Record<string, string> = {
  "Master Solvers' Club Problem Submission": "msc@bridgeworld.com",
  "Challenge the Champs Hand Submission":    "ctc@bridgeworld.com",
  "Technical Issues":                        "support@bridgeworld.com",
};

const DEFAULT_RECIPIENT = "editor@bridgeworld.com";

function getRecipient(subject: string): string {
  return RECIPIENT_MAP[subject] ?? DEFAULT_RECIPIENT;
}

// ── POST /api/contact ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, subject, message } = body as {
    name?: string; email?: string; subject?: string; message?: string;
  };

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: "All fields are required (name, email, subject, message)" },
      { status: 400 },
    );
  }

  const recipient = getRecipient(subject);

  // TODO: Integrate an email service (e.g. Resend, SendGrid, Postmark).
  // Replace the console.log below with an actual send call, e.g.:
  //   await resend.emails.send({
  //     from: "noreply@bridgeworld.com",
  //     to: recipient,
  //     replyTo: email.trim(),
  //     subject: `[Contact] ${subject}`,
  //     text: `From: ${name.trim()} <${email.trim()}>\nSubject: ${subject}\n\n${message.trim()}`,
  //   });
  console.log(
    `[Contact Form] To: ${recipient} | From: ${name.trim()} <${email.trim()}> | Subject: ${subject}\n${message.trim()}`,
  );

  return NextResponse.json({ success: true, recipient });
}
