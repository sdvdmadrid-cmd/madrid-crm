"use client";

import { Component } from "react";
import styles from "@/app/subscribe/subscribe.module.css";

export default class SubscribeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[subscribe] render error:", error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className={styles.subscribePage} data-testid="subscribe-error-boundary">
          <div className={styles.card}>
            <h1 className={styles.title}>Unable to load subscription page</h1>
            <p className={styles.message}>
              Please refresh or contact support if this continues.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => window.location.reload()}
              >
                Refresh
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
