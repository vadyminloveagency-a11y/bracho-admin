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

function parseIdList(raw: unknown): string[] {
  const chunks: string[] = [];
  if (Array.isArray(raw)) {
    for (const row of raw) chunks.push(String(row ?? ""));
  } else if (typeof raw === "string") {
    chunks.push(...raw.split(/[\s,;]+/));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    const id = normalizeId(chunk).replace(/\D/g, "");
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const session = await readSession(req.headers.get("authorization"));
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
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    console.error("[goldman-agency GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const body = await req.json();
    const bulkRaw = body.ids ?? body.text ?? body.list;
    const bulk = bulkRaw !== undefined ? parseIdList(bulkRaw) : null;

    if (bulk && bulk.length > 0) {
      const invalid = bulk.filter((id) => !/^\d{1,32}$/.test(id));
      if (invalid.length) {
        return NextResponse.json(
          { error: `Некорректные ID: ${invalid.slice(0, 5).join(", ")}` },
          { status: 400 },
        );
      }

      const existing = await prisma.goldmanManId.findMany({
        where: { externalId: { in: bulk } },
        select: { externalId: true },
      });
      const have = new Set(existing.map((e) => e.externalId));
      const toCreate = bulk.filter((id) => !have.has(id));

      if (toCreate.length) {
        await prisma.goldmanManId.createMany({
          data: toCreate.map((externalId) => ({ externalId })),
          skipDuplicates: true,
        });
      }

      const items = await prisma.goldmanManId.findMany({
        where: { externalId: { in: bulk } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          externalId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({
        ok: true,
        added: toCreate.length,
        skipped: bulk.length - toCreate.length,
        items,
      });
    }

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
