import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession, requireDirector, requireOperator } from "@/lib/auth";

const ONLINE_MS = 90_000;

const beatSchema = z.object({
  anketaId: z.string().min(1),
});

/** Director: list currently online questionnaires. */
export async function GET() {
  try {
    const session = await readSession();
    requireDirector(session);

    const since = new Date(Date.now() - ONLINE_MS);
    const online = await prisma.anketaPresence.findMany({
      where: { lastSeenAt: { gte: since } },
      orderBy: { lastSeenAt: "desc" },
      select: {
        anketaId: true,
        operatorId: true,
        externalId: true,
        displayName: true,
        lastSeenAt: true,
        operator: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ online });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

/** Operator: heartbeat — questionnaire is open in Bracho. */
export async function POST(req: NextRequest) {
  try {
    const session = await readSession(req.headers.get("authorization"));
    requireOperator(session);

    const { anketaId } = beatSchema.parse(await req.json());
    const anketa = await prisma.anketa.findFirst({
      where: { id: anketaId, operatorId: session!.id },
      select: { id: true, externalId: true, displayName: true },
    });
    if (!anketa) {
      return NextResponse.json({ error: "Questionnaire not found" }, { status: 404 });
    }

    const presence = await prisma.anketaPresence.upsert({
      where: { anketaId: anketa.id },
      create: {
        anketaId: anketa.id,
        operatorId: session!.id,
        externalId: anketa.externalId,
        displayName: anketa.displayName,
        lastSeenAt: new Date(),
      },
      update: {
        operatorId: session!.id,
        externalId: anketa.externalId,
        displayName: anketa.displayName,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, presence });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Clear presence: director (force offline) or operator (own anketa). */
export async function DELETE(req: NextRequest) {
  try {
    const session = await readSession(req.headers.get("authorization"));
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const anketaId = url.searchParams.get("anketaId");

    if (session.role === "DIRECTOR") {
      if (!anketaId) {
        return NextResponse.json({ error: "anketaId required" }, { status: 400 });
      }
      await prisma.anketaPresence.deleteMany({ where: { anketaId } });
      return NextResponse.json({ ok: true });
    }

    requireOperator(session);

    if (anketaId) {
      await prisma.anketaPresence.deleteMany({
        where: { anketaId, operatorId: session.id },
      });
    } else {
      await prisma.anketaPresence.deleteMany({
        where: { operatorId: session.id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
