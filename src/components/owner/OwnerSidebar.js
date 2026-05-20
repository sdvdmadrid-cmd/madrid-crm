"use client";
import Link from 'next/link';
const NAV = [
  { label: 'Overview', href: '/owner/overview' },
  { label: 'Tenants', href: '/owner/tenants' },
  { label: 'Revenue', href: '/owner/revenue' },
  { label: 'AI Ops', href: '/owner/ai-ops' },
  { label: 'Activity', href: '/owner/activity' },
  { label: 'Support', href: '/owner/support' },
  { label: 'Security', href: '/owner/security' },
  { label: 'Emails', href: '/owner/emails' },
  { label: 'Feature Flags', href: '/owner/feature-flags' },
  { label: 'Monitoring', href: '/owner/monitoring' },
  { label: 'Settings', href: '/owner/settings' },
];

import { usePathname } from 'next/navigation';
import styles from './OwnerShell.module.css';

export default function OwnerSidebar() {
  const pathname = usePathname();
  return (
    <aside className={styles['owner-sidebar']}>
      <nav>
        <ul>
          {NAV.map((item) => {
            const isActive = pathname && pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={isActive ? 'active' : ''}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
