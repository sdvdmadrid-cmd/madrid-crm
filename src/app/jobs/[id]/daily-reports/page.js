import JobDailyReportsClient from "@/components/jobs/JobDailyReportsClient";

export default async function JobDailyReportsPage({ params }) {
  const { id } = await params;
  return <JobDailyReportsClient jobId={id} />;
}
