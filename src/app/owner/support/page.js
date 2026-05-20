import { redirect } from 'next/navigation';

export default function OwnerSupportPage() {
  redirect('/admin#support-queue');
  return null;
}
