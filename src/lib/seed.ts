import { prisma } from "./db";
import { hashPassword } from "./auth";

export async function ensureDirector() {
  const email = process.env.DIRECTOR_EMAIL || "director@bracho.local";
  const password = process.env.DIRECTOR_PASSWORD || "BrachoDirector1!";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email,
      name: "Director",
      role: "DIRECTOR",
      passwordHash: await hashPassword(password),
    },
  });
}
