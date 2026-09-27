import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rolePermissions: Record<string, string[]> = {
  '/customers':  ['CUSTOMER'],
  '/bookings':   ['TECHNICIAN', 'SERVICE_CENTER_MANAGER'],
  '/tanks':      ['FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER'],
  // FIXED: Added FUEL_ATTENDANT to /fuel
  '/fuel':       ['FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER', 'FUEL_ATTENDANT'],
  '/payables':   ['ACCOUNTS_FINANCE_OFFICER'],
  // FIXED: Added FUEL_ATTENDANT to /salary/my-payslips
  '/salary/my-payslips': ['TECHNICIAN', 'SERVICE_CENTER_MANAGER', 'FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER', 'INVENTORY_MANAGER', 'CUSTOMER_RELATIONS_OFFICER', 'FUEL_ATTENDANT'],
  '/salary':     ['ACCOUNTS_FINANCE_OFFICER'],
  '/deliveries': ['SUPPLIER', 'INVENTORY_MANAGER'],
  '/parts':      ['SUPPLIER', 'INVENTORY_MANAGER'],
  '/rma':        ['SUPPLIER', 'ACCOUNTS_FINANCE_OFFICER', 'INVENTORY_MANAGER'],
  '/support':    ['CUSTOMER', 'TECHNICIAN', 'FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER', 'SUPPLIER'],
  '/complaints': ['CUSTOMER_RELATIONS_OFFICER', 'ACCOUNTS_FINANCE_OFFICER', 'SERVICE_CENTER_MANAGER', 'FUEL_STATION_SUPERVISOR'],
  '/roster':     ['TECHNICIAN', 'FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER', 'INVENTORY_MANAGER', 'CUSTOMER_RELATIONS_OFFICER', 'SERVICE_CENTER_MANAGER'],
  '/users':      [],
  '/pos':        ['INVENTORY_MANAGER'],
  '/audit':      []
};

export function middleware(request: NextRequest) {
  const token = request.cookies.get('jwtToken')?.value;
  const role = request.cookies.get('userRole')?.value;
  const path = request.nextUrl.pathname;

  const isProtectedRoute = Object.keys(rolePermissions).some(route => path.startsWith(route));

  if (isProtectedRoute) {
    if (!token || !role) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', path);
      return NextResponse.redirect(loginUrl);
    }

    let hasAccess = false;
    for (const [route, allowedRoles] of Object.entries(rolePermissions)) {
      if (path === route || (route !== '/salary' && path.startsWith(route))) {
        if (allowedRoles.includes(role) || role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'EXECUTIVE_OWNER') {
          hasAccess = true;
        }
        break;
      }
      if (path.startsWith('/salary') && route === '/salary') {
        if (allowedRoles.includes(role) || role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'EXECUTIVE_OWNER') {
          hasAccess = true;
        }
        break;
      }
    }

    if (!hasAccess) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/bookings/:path*', '/tanks/:path*', '/fuel/:path*', '/payables/:path*',
    '/salary/:path*', '/complaints/:path*', '/customers/:path*', '/deliveries/:path*',
    '/parts/:path*', '/rma/:path*', '/support/:path*', '/roster/:path*', '/users/:path*',
    '/pos/:path*', '/audit/:path*'
  ],
};