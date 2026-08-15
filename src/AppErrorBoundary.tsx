import React from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { APP_RUNTIME_INFO } from "./appRuntime.ts";
import { ActionButton } from "./ui/actionUi.tsx";
import { OrbIcon, SoftPanel } from "./ui/coreUi.tsx";
import { ReleaseInfo } from "./ui/ReleaseInfo.tsx";
import type { AppRuntimeInfo } from "./appRuntime.ts";

interface AppErrorBoundaryProps { children?: React.ReactNode; info?: AppRuntimeInfo }
interface AppErrorBoundaryState { hasError: boolean }

export function AppErrorFallback({ info = APP_RUNTIME_INFO, onReload, onOpenHome }: any) {
  return (
    <main className="core-centered-viewport grid min-h-dvh min-w-0 place-items-center bg-core-surface px-5 py-10 text-core-text">
      <SoftPanel className="w-full max-w-xl p-6 sm:p-8" role="alert" aria-live="assertive">
        <div className="flex items-start gap-3">
          <OrbIcon icon={AlertTriangle} className="bg-core-danger-soft text-core-text" />
          <div className="min-w-0">
            <p className="core-control-label uppercase tracking-wide text-core-text">Unerwarteter Fehler</p>
            <h1 className="core-heading-1 mt-1 text-core-text">CoRe konnte nicht geladen werden</h1>
          </div>
        </div>
        <p className="core-body mt-5 text-core-muted">
          Lade die Seite neu oder öffne die Startseite. Nicht synchronisierte Änderungen seit dem letzten erfolgreichen Speichern können verloren gehen.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ActionButton type="button" variant="primary" icon={RefreshCw} onClick={onReload}>Seite neu laden</ActionButton>
          <ActionButton type="button" variant="secondary" icon={Home} onClick={onOpenHome}>Startseite öffnen</ActionButton>
        </div>
        <ReleaseInfo info={info} className="mt-6 border-t border-core-border pt-4" />
      </SoftPanel>
    </main>
  );
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  reloadPage = () => {
    window.location.reload();
  };

  openHome = () => {
    window.location.replace("/");
  };

  render() {
    if (this.state.hasError) {
      return <AppErrorFallback info={this.props.info} onReload={this.reloadPage} onOpenHome={this.openHome} />;
    }

    return this.props.children;
  }
}
