"use client";

import styles from "./website-builder.module.css";

const STEPS = [
  { id: 1, key: "setup", label: "Setup" },
  { id: 2, key: "generate", label: "Draft" },
  { id: 3, key: "customize", label: "Edit" },
  { id: 4, key: "preview", label: "Preview" },
  { id: 5, key: "publish", label: "Publish" },
];

export default function BuilderWorkflowStepper({ activeStep = 1, onStepClick }) {
  return (
    <nav className={styles.workflowStepper} aria-label="Website builder steps">
      {STEPS.map((step) => {
        const isActive = step.id === activeStep;
        const isDone = step.id < activeStep;
        return (
          <button
            key={step.key}
            type="button"
            className={`${styles.workflowStep} ${isActive ? styles.workflowStepActive : ""} ${isDone ? styles.workflowStepDone : ""}`}
            onClick={() => onStepClick?.(step.id, step.key)}
            aria-current={isActive ? "step" : undefined}
          >
            <span className={styles.workflowStepNum}>{step.id}</span>
            <span className={styles.workflowStepLabel}>{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export { STEPS as BUILDER_WORKFLOW_STEPS };
