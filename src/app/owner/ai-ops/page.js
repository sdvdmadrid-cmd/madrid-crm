import AdminAiAssistantClient from '@/components/admin/AdminAiAssistantClient';
import AdminAiMonitoringClient from '@/components/admin/AdminAiMonitoringClient';

export default function OwnerAIOpsPage() {
  return (
    <section className="space-y-6">
      <AdminAiAssistantClient />
      <AdminAiMonitoringClient />
    </section>
  );
}
