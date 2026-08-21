import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";
import { ensureSchema } from "@/lib/ensure-schema";

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z
  .string()
  .trim()
  .min(1, "Введите ID")
  .max(32)
  .regex(/^\d+$/, "ID должен содержать только цифры");

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const { id } = await ctx.params;
    const body = await req.json();
    const externalId = idSchema.parse(String(body.externalId ?? body.id ?? "").trim());

    const current = await prisma.goldmanManId.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const clash = await prisma.goldmanManId.findFirst({
      where: { externalId, NOT: { id } },
    });
    if (clash) {
      return NextResponse.json({ error: "Такой ID уже есть в списке" }, { status: 409 });
    }

    const item = await prisma.goldmanManId.update({
      where: { id },
      data: { externalId },
      select: {
        id: true,
        externalId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (e && typeof e === "object" && "issues" in e) {
      const issues = (e as { issues?: Array<{ message?: string }> }).issues;
      return NextResponse.json(
        { error: issues?.[0]?.message || "Некорректный ID" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const { id } = await ctx.params;
    const current = await prisma.goldmanManId.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    await prisma.goldmanManId.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
