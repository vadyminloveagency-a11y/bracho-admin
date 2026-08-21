import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";
import { encryptSecret } from "@/lib/secret";

type Ctx = { params: Promise<{ anketaId: string }> };

const patchSchema = z.object({
  operatorId: z.string().min(1).nullable().optional(),
  displayName: z.string().min(1).max(120).optional(),
  externalId: z.string().min(1).max(64).optional(),
  password: z.string().min(1).max(200).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    const { anketaId } = await ctx.params;
    const parsed = patchSchema.parse(await req.json());

    const existing = await prisma.anketa.findUnique({ where: { id: anketaId } });
    if (!existing) {
      return NextResponse.json({ error: "Questionnaire not found" }, { status: 404 });
    }

    if (parsed.operatorId) {
      const op = await prisma.user.findFirst({
        where: { id: parsed.operatorId, role: "OPERATOR" },
      });
      if (!op) {
        return NextResponse.json({ error: "Operator not found" }, { status: 404 });
      }
    }

    if (parsed.externalId) {
      const nextId = parsed.externalId.trim();
      const clash = await prisma.anketa.findFirst({
        where: {
          site: existing.site,
          externalId: nextId,
          NOT: { id: anketaId },
        },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: "This Golden ID already exists" },
          { status: 409 },
        );
      }
    }

    const data: {
      operatorId?: string | null;
      displayName?: string;
      externalId?: string;
      passwordEnc?: string;
      notes?: string | null;
    } = {};

    if (Object.prototype.hasOwnProperty.call(parsed, "operatorId")) {
      data.operatorId = parsed.operatorId ?? null;
    }
    if (parsed.displayName) data.displayName = parsed.displayName.trim();
    if (parsed.externalId) data.externalId = parsed.externalId.trim();
    if (parsed.password) data.passwordEnc = encryptSecret(parsed.password);
    if (Object.prototype.hasOwnProperty.call(parsed, "notes")) {
      data.notes = parsed.notes?.trim() || null;
    }

    const anketa = await prisma.anketa.update({
      where: { id: anketaId },
      data,
      select: {
        id: true,
        externalId: true,
        displayName: true,
        avatarUrl: true,
        site: true,
        notes: true,
        operatorId: true,
      },
    });

    return NextResponse.json({ anketa });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "This Golden ID already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    const { anketaId } = await ctx.params;

    await prisma.anketa.delete({ where: { id: anketaId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
