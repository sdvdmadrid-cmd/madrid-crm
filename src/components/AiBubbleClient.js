"use client";

import { Component } from "react";
import WorkspaceAgentBubble from "@/components/WorkspaceAgentBubble";

class WorkspaceAgentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("[WorkspaceAgentBubble]", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function AiBubbleClient(props) {
  return (
    <WorkspaceAgentErrorBoundary>
      <WorkspaceAgentBubble {...props} />
    </WorkspaceAgentErrorBoundary>
  );
}
