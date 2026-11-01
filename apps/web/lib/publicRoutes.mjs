// Public token forms validate their own link through the API, not an employee session.
const tokenFormPrefixes = ['/customer-form/', '/customer-evaluation/', '/maintenance-feedback/', '/purchase-quote/', '/customer-quote/'];
export const isPublicRoute = (pathname) => pathname === '/login'
  || (typeof pathname === 'string' && tokenFormPrefixes.some((prefix) => pathname.startsWith(prefix)));
