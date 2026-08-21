import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, readSession, requireDirector } from "@/lib/auth";

export async function GET() {
  try {
    const session = await readSession();
    requireDirector(session);

    const operators = await prisma.user.findMany({
      where: { role: "OPERATOR" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        createdAt: true,
        _count: { select: { ankety: true } },
      },
    });

    return NextResponse.json({ operators });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

const createSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const session = await readSession();
    requireDirector(session);

    const data = createSchema.parse(await req.json());
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) {
      return NextResponse.json({ error: "Email already used" }, { status: 409 });
    }

    const operator = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: "OPERATOR",
        passwordHash: await hashPassword(data.password),
        createdById: session!.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ operator }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
