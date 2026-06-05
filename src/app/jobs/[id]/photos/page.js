import JobPhotosClient from "@/components/jobs/JobPhotosClient";

export default async function JobPhotosPage({ params }) {
  const { id } = await params;
  return <JobPhotosClient jobId={id} />;
}
