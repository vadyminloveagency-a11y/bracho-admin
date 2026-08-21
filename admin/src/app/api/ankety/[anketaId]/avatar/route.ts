import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";
import { decryptSecret } from "@/lib/secret";
import { ensureSchema } from "@/lib/ensure-schema";
import { fetchLadyAvatarUrl } from "@/lib/golden-agency";

type Ctx = { params: Promise<{ anketaId: string }> };

/** Fetch / refresh avatar for one lady from Golden Bride. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const { anketaId } = await ctx.params;
    const anketa = await prisma.anketa.findUnique({
      where: { id: anketaId },
      select: {
        id: true,
        externalId: true,
        passwordEnc: true,
        avatarUrl: true,
      },
    });

    if (!anketa) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!anketa.passwordEnc) {
      return NextResponse.json(
        { error: "No Golden password saved for this lady" },
        { status: 400 },
      );
    }

    const pass = decryptSecret(anketa.passwordEnc);
    const avatarUrl = await fetchLadyAvatarUrl(anketa.externalId, pass);

    const updated = await prisma.anketa.update({
      where: { id: anketa.id },
      data: { avatarUrl },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({ ok: true, anketa: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
