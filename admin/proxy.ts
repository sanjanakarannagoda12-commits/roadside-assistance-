// Quick check before any page renders: no admin cookie → go to the login page.
// This is only a convenience redirect. The real check happens in the Ridzo API on every request.
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (!request.cookies.has('ridzo_admin')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login page, Next.js internals and static files.
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
};
