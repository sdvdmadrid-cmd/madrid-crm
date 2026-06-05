"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import jobStyles from "@/app/jobs/jobs.module.css";

export default function JobWorkspaceNav({ jobId, active = "financial" }) {
  const { t } = useTranslation();

  const tabs = [
    { id: "financial", href: `/jobs/${jobId}/financial`, label: t("jobs.workspace.financial") },
    { id: "photos", href: `/jobs/${jobId}/photos`, label: t("jobs.workspace.photos") },
    {
      id: "daily-reports",
      href: `/jobs/${jobId}/daily-reports`,
      label: t("jobs.workspace.dailyReports"),
    },
  ];

  return (
    <nav className={jobStyles.jobWorkspaceNav} aria-label={t("jobs.workspace.aria")}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={
            active === tab.id
              ? `${jobStyles.jobWorkspaceTab} ${jobStyles.jobWorkspaceTabActive}`
              : jobStyles.jobWorkspaceTab
          }
          data-testid={`job-workspace-tab-${tab.id}`}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
