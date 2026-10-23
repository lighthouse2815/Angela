"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Button from "@/shared/components/Button";
import GatewayOrbit from "@/shared/components/gateway-orbit";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import useProviderStore from "@/store/providerStore";

const subscribeToOrigin = () => () => {};

const shortcuts = [
  { href: "/dashboard/providers", icon: "add_link", title: "Connect a provider", description: "Bring your accounts into Angela.", number: "01" },
  { href: "/dashboard/combos", icon: "alt_route", title: "Shape your model routes", description: "Choose models and fallback paths.", number: "02" },
  { href: "/dashboard/cli-tools", icon: "terminal", title: "Make it your workspace", description: "Connect the tools you use every day.", number: "03" },
];

export default function Overview() {
  const providers = useProviderStore((state) => state.providers);
  const providersLoading = useProviderStore((state) => state.loading);
  const providersError = useProviderStore((state) => state.error);
  const fetchProviders = useProviderStore((state) => state.fetchProviders);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const endpoint = useSyncExternalStore(subscribeToOrigin, () => `${window.location.origin}/v1`, () => "");
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    fetchProviders({ force: refresh > 0 });
    const controller = new AbortController();

    async function loadUsage() {
      try {
        const response = await fetch("/api/usage/stats?period=today", { signal: controller.signal });
        if (!response.ok) throw new Error("Usage request failed");
        const data = await response.json();
        if (!controller.signal.aborted) setStats(data);
      } catch {
        if (!controller.signal.aborted) setStatsError(true);
      } finally {
        if (!controller.signal.aborted) setStatsLoading(false);
      }
    }

    loadUsage();
    return () => controller.abort();
  }, [fetchProviders, refresh]);

  const refreshWorkspace = () => {
    setStatsLoading(true);
    setStatsError(false);
    setRefresh((value) => value + 1);
  };

  const enabled = providers.filter((provider) => provider.isActive !== false);
  const providerCount = new Set(providers.map((provider) => provider.provider)).size;
  const formatNumber = (value) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const metrics = [
    { label: "Enabled accounts", value: providersError || providersLoading ? "—" : enabled.length, icon: "link", detail: "Managed in your workspace" },
    { label: "Provider types", value: providersError || providersLoading ? "—" : providerCount, icon: "hub", detail: "Your connected AI ecosystem" },
    { label: "Requests today", value: statsError || statsLoading ? "—" : formatNumber(stats.totalRequests), icon: "swap_vert", detail: "Since the start of today" },
    { label: "Tokens today", value: statsError || statsLoading ? "—" : formatNumber(stats.totalPromptTokens + stats.totalCompletionTokens), icon: "token", detail: "Input and output combined" },
  ];

  return (
    <div className="angela-overview">
      <section className="angela-intro">
        <div className="angela-intro-copy">
          <p className="angela-eyebrow"><span className="angela-small-star" aria-hidden="true">✳</span> THE ANGELA WORKSPACE</p>
          <h1>Your models.<br /><span>One orbit.</span></h1>
          <p className="angela-intro-description">A little less complexity. A lot more possibility.<br className="hidden sm:block" /> Bring your AI together and make room to create.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/dashboard/providers" className="angela-primary-link">Connect a provider <span aria-hidden="true">↗</span></Link>
            <Link href="/dashboard/endpoint" className="angela-text-link">Explore your endpoint <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <GatewayOrbit />
      </section>

      <section aria-label="Workspace statistics" className="angela-metrics" aria-busy={statsLoading || providersLoading}>
        {metrics.map((metric) => (
          <div key={metric.label} className="angela-metric">
            <div className="flex items-center justify-between gap-2"><span>{metric.label}</span><span className="material-symbols-outlined" aria-hidden="true">{metric.icon}</span></div>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </div>
        ))}
      </section>

      {statsError && (
        <p role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-danger">Usage is unavailable. Refresh to try again.<Button variant="outline" size="sm" onClick={refreshWorkspace}>Retry</Button></p>
      )}

      <div className="angela-overview-panels">
        <section className="angela-connections">
          <div className="angela-section-heading">
            <div><p className="angela-eyebrow">YOUR ECOSYSTEM</p><h2>Good company.</h2></div>
            <Button variant="ghost" size="sm" icon="refresh" aria-label="Refresh workspace" loading={statsLoading || providersLoading} onClick={refreshWorkspace} />
          </div>
          {providersError ? (
            <div className="angela-empty-state" role="alert"><span className="material-symbols-outlined text-danger" aria-hidden="true">cloud_off</span><h3>Accounts are unavailable</h3><p>Refresh to load your provider accounts.</p><Button variant="outline" size="sm" onClick={refreshWorkspace}>Retry</Button></div>
          ) : providersLoading && providers.length === 0 ? (
            <div className="angela-empty-state" role="status"><span className="material-symbols-outlined animate-spin" aria-hidden="true">progress_activity</span><p>Loading your accounts…</p></div>
          ) : providers.length === 0 ? (
            <div className="angela-empty-state"><span className="angela-empty-icon material-symbols-outlined" aria-hidden="true">group_work</span><h3>Every connection starts somewhere.</h3><p>Add your first provider. Your models will feel right at home.</p><Link href="/dashboard/providers" className="angela-text-link">Find your first connection <span aria-hidden="true">↗</span></Link></div>
          ) : (
            <div className="angela-account-list">
              {providers.slice(0, 4).map((provider) => (
                <Link key={provider.id} href={`/dashboard/providers/${provider.provider}`} className="angela-account-row">
                  <span className="angela-account-icon"><ProviderIcon src={getProviderIconSrc(provider.provider)} size={24} alt="" fallbackText={(AI_PROVIDERS[provider.provider]?.name || provider.provider).slice(0, 2)} /></span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{provider.name || AI_PROVIDERS[provider.provider]?.name || provider.provider}</p><p className="mt-1 truncate text-xs text-text-muted">{AI_PROVIDERS[provider.provider]?.name || provider.provider}</p></div>
                  <span className={`angela-account-state ${provider.isActive === false ? "" : "angela-account-enabled"}`}>{provider.isActive === false ? "Paused" : "Enabled"}</span>
                  <span aria-hidden="true" className="text-text-muted">↗</span>
                </Link>
              ))}
            </div>
          )}
          <Link href="/dashboard/providers" className="angela-panel-footer">All providers <span aria-hidden="true">→</span></Link>
        </section>

        <section className="angela-shortcuts">
          <div className="angela-section-heading"><div><p className="angela-eyebrow">MAKE YOURSELF AT HOME</p><h2>Where to next?</h2></div><span className="angela-small-star" aria-hidden="true">✳</span></div>
          {shortcuts.map((shortcut) => (
            <Link key={shortcut.href} href={shortcut.href} className="angela-shortcut">
              <span className="angela-shortcut-number">{shortcut.number}</span>
              <div className="min-w-0 flex-1"><h3>{shortcut.title}</h3><p>{shortcut.description}</p></div>
              <span className="material-symbols-outlined" aria-hidden="true">{shortcut.icon}</span>
            </Link>
          ))}
        </section>
      </div>

      <section className="angela-endpoint-strip" aria-label="API endpoint">
        <span className="angela-endpoint-icon material-symbols-outlined" aria-hidden="true">code</span>
        <div className="min-w-0 flex-1"><p className="text-xs text-text-muted">One endpoint. All your possibilities.</p><code className="mt-1 block truncate text-sm" data-i18n-skip>{endpoint || "…"}</code></div>
        <Button variant="outline" size="sm" icon={copied ? "check" : "content_copy"} disabled={!endpoint} onClick={() => copy(endpoint)}>{copied ? "Copied" : "Copy endpoint"}</Button>
        <Link href="/dashboard/endpoint" className="angela-text-link text-sm">Manage keys <span aria-hidden="true">↗</span></Link>
        <span className="sr-only" role="status">{copied ? "Endpoint copied" : ""}</span>
      </section>
      <footer className="angela-workspace-footer"><span>Made for your kind of intelligence.</span><span>ANGELA GATEWAY <span aria-hidden="true">✳</span></span></footer>
    </div>
  );
}
