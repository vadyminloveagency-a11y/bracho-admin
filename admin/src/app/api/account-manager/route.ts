import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";
import { encryptSecret } from "@/lib/secret";
import { ensureSchema } from "@/lib/ensure-schema";

const ONLINE_MS = 90_000;

const createSchema = z.object({
  externalId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  site: z.string().min(1).max(64).optional(),
  notes: z.string().max(500).optional(),
  operatorId: z.string().min(1).optional().nullable(),
});

export async function GET() {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const since = new Date(Date.now() - ONLINE_MS);
    const [accounts, operators, online] = await Promise.all([
      prisma.anketa.findMany({
        where: { operatorId: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          externalId: true,
          displayName: true,
          site: true,
          notes: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: { role: "OPERATOR" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          active: true,
          createdAt: true,
          ankety: {
            orderBy: { displayName: "asc" },
            select: {
              id: true,
              externalId: true,
              displayName: true,
              site: true,
              notes: true,
            },
          },
        },
      }),
      prisma.anketaPresence.findMany({
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
      }),
    ]);

    const ladiesInWork = operators.reduce((n, op) => n + op.ankety.length, 0);

    return NextResponse.json({
      accounts,
      operators,
      online,
      stats: {
        accounts: accounts.length,
        operators: operators.length,
        ladiesInWork,
        online: online.length,
      },
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await readSession();
    requireDirector(session);

    const parsed = createSchema.parse(await req.json());
    const operatorId: string | null =
      parsed.operatorId === undefined ? null : parsed.operatorId;

    if (operatorId) {
      const op = await prisma.user.findFirst({
        where: { id: operatorId, role: "OPERATOR" },
      });
      if (!op) {
        return NextResponse.json({ error: "Operator not found" }, { status: 404 });
      }
    }

    const anketa = await prisma.anketa.create({
      data: {
        operatorId,
        externalId: parsed.externalId.trim(),
        displayName: parsed.displayName.trim(),
        passwordEnc: encryptSecret(parsed.password),
        site: parsed.site || "goldenbride",
        notes: parsed.notes?.trim() || null,
      },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        site: true,
        notes: true,
        operatorId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ anketa }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "This questionnaire ID already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
