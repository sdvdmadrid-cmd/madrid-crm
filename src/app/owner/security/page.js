import { redirect } from 'next/navigation';

export default function OwnerSecurityPage() {
  redirect('/admin#security-watch');
  return null;
}
