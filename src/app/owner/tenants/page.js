import { redirect } from 'next/navigation';

export default function OwnerTenantsPage() {
  redirect('/admin#tenant-command-center');
  return null;
}
