import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  externalId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(120),
  site: z.string().min(1).max(64).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    const { id: operatorId } = await ctx.params;

    const op = await prisma.user.findFirst({
      where: { id: operatorId, role: "OPERATOR" },
    });
    if (!op) {
      return NextResponse.json({ error: "Operator not found" }, { status: 404 });
    }

    const parsed = createSchema.parse(await req.json());

    const anketa = await prisma.anketa.create({
      data: {
        operatorId,
        externalId: parsed.externalId.trim(),
        displayName: parsed.displayName.trim(),
        site: parsed.site || "goldenbride",
        notes: parsed.notes?.trim() || null,
      },
    });

    return NextResponse.json({ anketa }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "This anketa is already bound on this site" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
