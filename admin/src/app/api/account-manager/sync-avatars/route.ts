import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSession, requireDirector } from "@/lib/auth";
import { decryptSecret } from "@/lib/secret";
import { ensureSchema } from "@/lib/ensure-schema";
import {
  fetchAgencyLadiesPhotos,
  fetchLadyAvatarUrl,
} from "@/lib/golden-agency";

/**
 * Refresh questionnaire avatars from Golden Bride.
 * Prefers agency getLadies when GOLDEN_AGENCY_* env is set;
 * otherwise logs in as each lady and calls getLady.
 */
export async function POST() {
  try {
    const session = await readSession();
    requireDirector(session);
    await ensureSchema();

    const ankety = await prisma.anketa.findMany({
      select: {
        id: true,
        externalId: true,
        passwordEnc: true,
        avatarUrl: true,
      },
    });

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    // Fast path: one agency session for all ladies
    try {
      const photos = await fetchAgencyLadiesPhotos();
      for (const a of ankety) {
        const url = photos.get(String(a.externalId).trim());
        if (!url) continue;
        if (a.avatarUrl === url) continue;
        await prisma.anketa.update({
          where: { id: a.id },
          data: { avatarUrl: url },
        });
        updated += 1;
      }
      return NextResponse.json({
        ok: true,
        mode: "agency",
        updated,
        checked: ankety.length,
        failed: 0,
      });
    } catch {
      // fall through to per-lady login
    }

    for (const a of ankety) {
      if (!a.passwordEnc) {
        failed += 1;
        errors.push(`${a.externalId}: no password`);
        continue;
      }
      try {
        const pass = decryptSecret(a.passwordEnc);
        const url = await fetchLadyAvatarUrl(a.externalId, pass);
        if (a.avatarUrl !== url) {
          await prisma.anketa.update({
            where: { id: a.id },
            data: { avatarUrl: url },
          });
          updated += 1;
        }
      } catch (e) {
        failed += 1;
        errors.push(
          `${a.externalId}: ${e instanceof Error ? e.message : "failed"}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "lady",
      updated,
      checked: ankety.length,
      failed,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
