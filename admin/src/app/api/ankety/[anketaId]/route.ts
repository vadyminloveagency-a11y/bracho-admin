import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";

type Ctx = { params: Promise<{ anketaId: string }> };

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
