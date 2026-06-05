import PayrollRunDetailClient from "@/components/payroll/PayrollRunDetailClient";

export default async function PayrollRunDetailPage({ params }) {
  const { id } = await params;
  return <PayrollRunDetailClient runId={id} />;
}
