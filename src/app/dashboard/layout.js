import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Host-madrid_session'
    : 'madrid_session';

export default async function DashboardLayout({ children }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || '';
  const session = verifySessionToken(token);

  // Redirect super_admin to Owner Command Center
  if (session && String(session.role || '').toLowerCase() === 'super_admin') {
    redirect('/owner/overview');
  }

  return <>{children}</>;
}
