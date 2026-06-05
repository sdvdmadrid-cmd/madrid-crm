import JobFinancialDashboardClient from "@/components/jobs/JobFinancialDashboardClient";

export default async function JobFinancialPage({ params }) {
  const { id } = await params;
  return <JobFinancialDashboardClient jobId={id} />;
}
