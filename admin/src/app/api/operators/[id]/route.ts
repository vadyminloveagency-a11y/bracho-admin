import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, readSession, requireDirector } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    const { id } = await ctx.params;

    const operator = await prisma.user.findFirst({
      where: { id, role: "OPERATOR" },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        createdAt: true,
        ankety: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            externalId: true,
            displayName: true,
            site: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!operator) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ operator });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

const patchSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().min(2).max(80).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).max(100).optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    const { id } = await ctx.params;
    const data = patchSchema.parse(await req.json());

    const existing = await prisma.user.findFirst({
      where: { id, role: "OPERATOR" },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (data.email) {
      const clash = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: "Email already used" }, { status: 409 });
      }
    }

    const operator = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.password
          ? { passwordHash: await hashPassword(data.password) }
          : {}),
      },
      select: { id: true, email: true, name: true, active: true },
    });

    return NextResponse.json({ operator });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    const { id } = await ctx.params;

    const existing = await prisma.user.findFirst({
      where: { id, role: "OPERATOR" },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.anketa.updateMany({
      where: { operatorId: id },
      data: { operatorId: null },
    });
    await prisma.anketaPresence.deleteMany({ where: { operatorId: id } });
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
