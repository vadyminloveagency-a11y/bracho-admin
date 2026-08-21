import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession, requireOperator } from "@/lib/auth";
import { decryptSecret } from "@/lib/secret";

export async function GET(req: NextRequest) {
  try {
    const session = await readSession(req.headers.get("authorization"));
    requireOperator(session);

    const operator = await prisma.user.findUnique({
      where: { id: session!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        ankety: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            externalId: true,
            displayName: true,
            site: true,
            avatarUrl: true,
            passwordEnc: true,
          },
        },
      },
    });

    if (!operator || !operator.active) {
      return NextResponse.json({ error: "Operator not found" }, { status: 404 });
    }

    const ankety = operator.ankety.map((a) => {
      let password = "";
      try {
        password = a.passwordEnc ? decryptSecret(a.passwordEnc) : "";
      } catch {
        password = "";
      }
      return {
        id: a.id,
        externalId: a.externalId,
        displayName: a.displayName,
        site: a.site,
        avatarUrl: a.avatarUrl || null,
        password,
      };
    });

    return NextResponse.json({
      operator: {
        id: operator.id,
        email: operator.email,
        name: operator.name,
        role: operator.role,
      },
      ankety,
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
