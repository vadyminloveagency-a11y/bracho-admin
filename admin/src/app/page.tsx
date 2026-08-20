import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await readSession();
  if (session?.role === "DIRECTOR") redirect("/admin");
  redirect("/login");
}
