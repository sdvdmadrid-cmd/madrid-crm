import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import OwnerShell from '@/components/owner/OwnerShell';
import { verifySessionToken } from '@/lib/auth';
import { buildLoginRedirectPath } from '@/lib/auth-redirect';

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Host-madrid_session'
    : 'madrid_session';

export default async function OwnerLayout({ children }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || '';
  const session = verifySessionToken(token);

  if (!session) {
    redirect(buildLoginRedirectPath('/owner/overview'));
  }

  if (String(session.role || '').toLowerCase() !== 'super_admin') {
    redirect('/dashboard');
  }

  return <OwnerShell>{children}</OwnerShell>;
}
