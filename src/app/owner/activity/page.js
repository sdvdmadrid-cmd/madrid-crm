import { redirect } from 'next/navigation';

export default function OwnerActivityPage() {
  redirect('/admin');
  return null;
}
