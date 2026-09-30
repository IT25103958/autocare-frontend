import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rolePermissions: Record<string, string[]> = {
  // /customers itself is the CRO's customer directory; the customer's own
  // portal lives under the sub-routes (most specific route wins below).
  '/customers':  ['CUSTOMER_RELATIONS_OFFICER'],
  '/customers/dashboard': ['CUSTOMER'],
  '/customers/book':      ['CUSTOMER'],
  '/customers/profile':   ['CUSTOMER'],
  '/membership': ['CUSTOMER_RELATIONS_OFFICER'],
  '/bookings':   ['TECHNICIAN', 'SERVICE_CENTER_MANAGER'],
  '/tanks':      ['FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER'],
  // FIXED: Added FUEL_ATTENDANT to /fuel
  '/fuel':       ['FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER', 'FUEL_ATTENDANT'],
  // Suppliers dispatch their bowsers from this page; supervisors order/receive.
  // Finance reads it too: open fuel orders are future liabilities.
  '/fuel-deliveries': ['FUEL_STATION_SUPERVISOR', 'SUPPLIER', 'ACCOUNTS_FINANCE_OFFICER'],
  // Supplier master: fuel supervisor onboards fuel suppliers, inventory
  // manager parts suppliers, Finance manages payment details and balances.
  '/suppliers':  ['ACCOUNTS_FINANCE_OFFICER', 'FUEL_STATION_SUPERVISOR', 'INVENTORY_MANAGER'],
  '/payables':   ['ACCOUNTS_FINANCE_OFFICER'],
  // FIXED: Added FUEL_ATTENDANT to /salary/my-payslips
  '/salary/my-payslips': ['TECHNICIAN', 'SERVICE_CENTER_MANAGER', 'FUEL_STATION_SUPERVISOR', 'ACCOUNTS_FINANCE_OFFICER', 'INVENTORY_MANAGER', 'CUSTOMER_RELATIONS_OFFICER', 'FUEL_ATTENDANT'],
  '/salary':     ['ACCOUNTS_FINANCE_OFFICER'],
  '/deliveries': ['SUPPLIER', 'INVENTORY_MANAGER'],
  '/parts':      ['SUPPLIER', 'INVENTORY_MANAGER'],
  '/rma':        ['SUPPLIER', 'ACCOUNTS_FINANCE_OFFICER', 'INVENTORY_MANAGER'],
  // Customer portal only: staff log tickets for a customer from the CRM desk.
  '/support':    ['CUSTOMER'],
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

  // Match on whole path segments and pick the most specific route, so
  // '/fuel' doesn't swallow '/fuel-deliveries' and '/salary/my-payslips'
  // wins over '/salary'.
  const matchedRoute = Object.keys(rolePermissions)
    .filter(route => path === route || path.startsWith(route + '/'))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedRoute) {
    if (!token || !role) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', path);
      return NextResponse.redirect(loginUrl);
    }

    // UI guard only: the role cookie is set by the browser, so the backend's
    // own authorization remains the real check.
    const allowedRoles = rolePermissions[matchedRoute];
    const hasAccess = allowedRoles.includes(role) || role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'EXECUTIVE_OWNER';

    if (!hasAccess) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/bookings/:path*', '/tanks/:path*', '/fuel/:path*', '/fuel-deliveries/:path*', '/suppliers/:path*', '/payables/:path*',
    '/salary/:path*', '/complaints/:path*', '/customers/:path*', '/deliveries/:path*',
    '/parts/:path*', '/rma/:path*', '/support/:path*', '/roster/:path*', '/users/:path*',
    '/pos/:path*', '/audit/:path*', '/membership/:path*'
  ],
};