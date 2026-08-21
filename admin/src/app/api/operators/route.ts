import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, readSession, requireDirector } from "@/lib/auth";
import { encryptSecret } from "@/lib/secret";
import { ensureSchema } from "@/lib/ensure-schema";

export async function GET() {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const operators = await prisma.user.findMany({
      where: { role: "OPERATOR" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        createdAt: true,
        globalSyncLogin: true,
        globalSyncPasswordEnc: true,
        _count: { select: { ankety: true } },
      },
    });

    return NextResponse.json({
      operators: operators.map(({ globalSyncPasswordEnc, ...op }) => ({
        ...op,
        globalSyncLogin: op.globalSyncLogin || "",
        hasGlobalSyncPassword: Boolean(globalSyncPasswordEnc),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

const createSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  globalSyncLogin: z.string().max(120).optional(),
  globalSyncPassword: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const data = createSchema.parse(await req.json());
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) {
      return NextResponse.json({ error: "Email already used" }, { status: 409 });
    }

    const gsLogin = String(data.globalSyncLogin || "").trim();
    const gsPass = String(data.globalSyncPassword || "").trim();

    const operator = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: "OPERATOR",
        passwordHash: await hashPassword(data.password),
        createdById: session!.id,
        globalSyncLogin: gsLogin,
        ...(gsPass ? { globalSyncPasswordEnc: encryptSecret(gsPass) } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        createdAt: true,
        globalSyncLogin: true,
        globalSyncPasswordEnc: true,
      },
    });

    return NextResponse.json(
      {
        operator: {
          id: operator.id,
          email: operator.email,
          name: operator.name,
          active: operator.active,
          createdAt: operator.createdAt,
          globalSyncLogin: operator.globalSyncLogin || "",
          hasGlobalSyncPassword: Boolean(operator.globalSyncPasswordEnc),
        },
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
