import { redirect } from 'next/navigation';

export default function OwnerSettingsPage() {
  redirect('/admin/settings');
  return null;
}
