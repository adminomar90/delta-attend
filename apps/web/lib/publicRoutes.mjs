// Public token pages validate their links through the API.
const tokenPagePrefixes = ['/customer-form/', '/customer-evaluation/', '/maintenance-feedback/', '/purchase-quote/', '/customer-quote/', '/verify-employee/'];
export const isPublicRoute = (pathname) => pathname === '/login'
  || (typeof pathname === 'string' && tokenPagePrefixes.some((prefix) => pathname.startsWith(prefix)));
