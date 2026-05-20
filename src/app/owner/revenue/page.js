import { AdminFinancialDashboardClient } from '@/components/admin/AdminFinancialDashboardClient';
import { AdminPlatformFeeDashboardClient } from '@/components/admin/AdminPlatformFeeDashboardClient';

export default function OwnerRevenuePage() {
  return (
    <section className="space-y-6">
      <AdminFinancialDashboardClient />
      <AdminPlatformFeeDashboardClient />
    </section>
  );
}
