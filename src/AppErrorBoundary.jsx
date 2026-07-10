import React from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { APP_RUNTIME_INFO } from "./appRuntime.js";
import { OrbIcon, SoftPanel } from "./ui/coreUi.jsx";
import { ReleaseInfo } from "./ui/ReleaseInfo.jsx";

export function AppErrorFallback({ info = APP_RUNTIME_INFO, onReload, onOpenHome }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[#dce2f4] bg-white/52 px-5 py-10 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <SoftPanel className="w-full max-w-xl p-6 sm:p-8" role="alert" aria-live="assertive">
          <div className="flex items-start gap-3">
            <OrbIcon icon={AlertTriangle} className="bg-amber-50 text-amber-700" />
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Unerwarteter Fehler</p>
              <h1 className="mt-1 text-2xl font-semibold text-[#17214f] sm:text-3xl">CoRe konnte nicht geladen werden</h1>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-[#66709a]">
            Lade die Seite neu oder öffne die Startseite. Nicht synchronisierte Änderungen seit dem letzten erfolgreichen Speichern können verloren gehen.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onReload} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white">
              <RefreshCw size={17} aria-hidden="true" />
              Seite neu laden
            </button>
            <button type="button" onClick={onOpenHome} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/76 px-4 text-sm font-semibold text-[#4f5eb1]">
              <Home size={17} aria-hidden="true" />
              Startseite öffnen
            </button>
          </div>
          <ReleaseInfo info={info} className="mt-6 border-t border-[#e3e7f5] pt-4" />
        </SoftPanel>
      </div>
    </main>
  );
}

export class AppErrorBoundary extends React.Component {
  constructor(props) {
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
