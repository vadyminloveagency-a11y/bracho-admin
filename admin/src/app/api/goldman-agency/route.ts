import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";
import { ensureSchema } from "@/lib/ensure-schema";

function normalizeId(raw: string) {
  return String(raw || "").trim();
}

const idSchema = z
  .string()
  .trim()
  .min(1, "Введите ID")
  .max(32)
  .regex(/^\d+$/, "ID должен содержать только цифры");

export async function GET() {
  try {
    const session = await readSession();
    if (!session || (session.role !== "DIRECTOR" && session.role !== "OPERATOR")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await ensureSchema();

    const items = await prisma.goldmanManId.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        externalId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      items,
      ids: items.map((i) => i.externalId),
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const body = await req.json();
    const externalId = idSchema.parse(normalizeId(body.externalId ?? body.id ?? ""));

    const exists = await prisma.goldmanManId.findUnique({
      where: { externalId },
    });
    if (exists) {
      return NextResponse.json({ error: "Такой ID уже есть в списке" }, { status: 409 });
    }

    const item = await prisma.goldmanManId.create({
      data: { externalId },
      select: {
        id: true,
        externalId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
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
