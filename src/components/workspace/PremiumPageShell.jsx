"use client";

import ws from "@/styles/workspace-dark.module.css";

/**
 * Standard premium CRM page frame (header + padded content).
 */
export default function PremiumPageShell({
  title,
  subtitle,
  actions,
  children,
  fullBleed = false,
}) {
  return (
    <div className={ws.page}>
      <div className={fullBleed ? ws.pageFullBleed : ws.pageInner}>
        {title || subtitle || actions ? (
          <header className={ws.topBar}>
            <div>
              {title ? <h1 className={ws.title}>{title}</h1> : null}
              {subtitle ? <p className={ws.subtitle}>{subtitle}</p> : null}
            </div>
            {actions ? <div className={ws.actions}>{actions}</div> : null}
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
}
