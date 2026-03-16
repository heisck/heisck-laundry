import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRIVATE_ACCESS_COOKIE_NAME = "heisck_private_access";
const PRIVATE_ACCESS_COOKIE_PATH = "/";

function isPrivateRoute(pathname: string): boolean {
  return pathname === "/admin/private" || pathname.startsWith("/admin/private/");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!isPrivateRoute(request.nextUrl.pathname)) {
    response.cookies.set(PRIVATE_ACCESS_COOKIE_NAME, "", {
      httpOnly: true,
      maxAge: 0,
      path: PRIVATE_ACCESS_COOKIE_PATH,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
