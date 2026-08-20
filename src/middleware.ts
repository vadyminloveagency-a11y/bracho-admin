import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "bracho_session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("no secret");
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    if (payload.role !== "DIRECTOR") {
      return NextResponse.redirect(new URL("/login?error=role", req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
