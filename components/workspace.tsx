"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import CallWizard from "./call-wizard";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Globe2,
  Heart,
  Home,
  Languages,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import { copy, errors, statuses } from "@/lib/i18n";
import {
  terminal,
  type Call,
  type Locale,
  type Profile,
  type Readiness,
} from "@/lib/types";
type State = { calls: Call[]; profile: Profile; readiness: Readiness };
type T = typeof copy.en;
const languageNames = {
  en: { ja: "Japanese", en: "English", es: "Spanish" },
  es: { ja: "Japonés", en: "Inglés", es: "Español" },
};
async function api(path: string, method = "GET", body?: unknown, key?: string) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "UNKNOWN");
  return data;
}
function errorText(code: string, l: Locale) {
  return errors[code]?.[l === "en" ? 0 : 1] || copy[l].error;
}
function Wave({
  large = false,
  active = false,
}: {
  large?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`wave ${large ? "large" : ""} ${active ? "animated" : ""}`}
      aria-hidden="true"
    >
      {[
        12, 21, 34, 22, 45, 58, 38, 68, 85, 62, 100, 72, 92, 58, 74, 48, 62, 31,
        46, 24, 35, 16, 10,
      ].map((h, i) => (
        <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 63}ms` }} />
      ))}
    </div>
  );
}
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <AudioLines size={25} strokeWidth={2.6} />
      </span>
      <span>
        callori<span className="brand-period">.</span>
      </span>
    </div>
  );
}
function Badge({ call, l }: { call: Call; l: Locale }) {
  return (
    <span className={`badge ${call.status}`}>
      <span />
      {statuses[l][call.status]}
    </span>
  );
}
function Duration({ call }: { call: Call }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const seconds = Math.max(
    0,
    Math.floor(
      ((call.endedAt
        ? Date.parse(call.endedAt)
        : now || Date.parse(call.createdAt)) -
        Date.parse(call.createdAt)) /
        1000,
    ),
  );
  return (
    <>
      {Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0")}
      :{(seconds % 60).toString().padStart(2, "0")}
    </>
  );
}
export default function Workspace() {
  const [state, setState] = useState<State>();
  const [loadError, setLoadError] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const path = usePathname();
  const router = useRouter();
  const t = copy[locale];
  const refresh = async () => {
    try {
      const data = await api("state");
      setState(data);
      setLocale(data.profile.uiLanguage);
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const data = await api("state");
        if (alive) {
          setState(data);
          setLocale(data.profile.uiLanguage);
          setLoadError("");
        }
      } catch (e) {
        if (alive) setLoadError((e as Error).message);
      }
      if (alive) timer = setTimeout(poll, 1200);
    };
    let timer: ReturnType<typeof setTimeout>;
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const active = state?.calls.find((c) => !terminal(c.status));
  const isNew = path === "/calls/new";
  const isSettings = path === "/settings";
  const isHistory = path === "/calls";
  const call = state?.calls.find((c) => path === `/calls/${c.id}`);
  const isHome = path === "/";
  async function switchLocale() {
    if (!state) return;
    try {
      const next = locale === "en" ? "es" : "en";
      await api("profile", "PUT", { ...state.profile, uiLanguage: next });
      setLocale(next);
      await refresh();
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {locale === "es" ? "Saltar al contenido" : "Skip to content"}
      </a>
      <aside className="sidebar" aria-label={t.workspace}>
        <Link href="/" aria-label="Callori">
          <Logo />
        </Link>
        <p className="brand-tagline">{t.tagline}</p>
        <Link href="/calls/new" className="button sidebar-new">
          <Plus size={18} />
          {t.newCall}
        </Link>
        <div className="nav-label">{t.workspace}</div>
        <nav aria-label={t.workspace}>
          {[
            { href: "/", label: t.home, icon: Home },
            { href: "/calls", label: t.calls, icon: Phone },
            { href: "/settings", label: t.settings, icon: Settings2 },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={
                (
                  href === "/"
                    ? isHome
                    : href === "/settings"
                      ? isSettings
                      : !isHome && !isSettings
                )
                  ? "page"
                  : undefined
              }
              className={`nav-item ${(href === "/" ? isHome : href === "/settings" ? isSettings : !isHome && !isSettings) ? "selected" : ""}`}
            >
              <Icon size={19} />
              {label}
              {href === "/calls" && !!state?.calls.length && (
                <span className="nav-count">{state.calls.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="control-note">
            <ShieldCheck size={22} />
            <h3>{t.helpTitle}</h3>
            <p>{t.help}</p>
          </div>
          <Link href="/settings" className="profile-link">
            <span className="avatar">
              {state?.profile.preferredName?.[0] ||
                state?.profile.firstName?.[0] || <UserRound size={18} />}
            </span>
            <span>
              <strong>
                {state?.profile.preferredName ||
                  state?.profile.firstName ||
                  "My Callori"}
              </strong>
              <small>{t.local}</small>
            </span>
            <MoreHorizontal size={18} />
          </Link>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Callori</span>
            <ChevronRight size={14} />
            <strong>
              {isSettings
                ? t.settings
                : isNew
                  ? t.newCall
                  : call
                    ? t.calls
                    : isHistory
                      ? t.calls
                      : t.home}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="local-label">
              <span />
              {t.local}
            </span>
            <button
              className="language-button"
              onClick={switchLocale}
              aria-label={
                locale === "en" ? "Switch to Spanish" : "Cambiar a inglés"
              }
            >
              <Globe2 size={16} />
              {locale.toUpperCase()}
            </button>
            <Link
              href="/settings"
              className="top-avatar"
              aria-label={t.settings}
            >
              {state?.profile.preferredName?.[0] ||
                state?.profile.firstName?.[0] || <UserRound size={17} />}
            </Link>
          </div>
        </header>
        <main
          id="main"
          className={`main-content ${call ? "call-content" : ""}`}
        >
          {loadError && (
            <div className="alert error" role="alert">
              {errorText(loadError, locale)}
              <button onClick={refresh}>{t.retry}</button>
            </div>
          )}
          {!state ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              {t.loading}
            </div>
          ) : (
            <>
              {active && !call && (
                <Link href={`/calls/${active.id}`} className="active-banner">
                  <AudioLines size={19} />
                  <span>
                    {statuses[locale][active.status]} · {active.phone}
                  </span>
                  <span>
                    {locale === "es" ? "Volver a la llamada" : "Return to call"}{" "}
                    <ArrowRight size={16} />
                  </span>
                </Link>
              )}
              {isHome && <Overview state={state} t={t} l={locale} />}
              {isNew && (
                <CallWizard
                  state={state}
                  l={locale}
                  onCreated={async (c) => {
                    await refresh();
                    router.push(`/calls/${c.id}`);
                  }}
                />
              )}
              {isHistory && <History calls={state.calls} t={t} l={locale} />}
              {isSettings && (
                <ProfilePage state={state} t={t} l={locale} onSaved={refresh} />
              )}
              {call && (
                <CallPage call={call} t={t} l={locale} onChange={refresh} />
              )}
              {!isHome && !isNew && !isHistory && !isSettings && !call && (
                <div className="empty-state">
                  <CircleHelp />
                  <h2>
                    {locale === "es"
                      ? "No encontramos esta página"
                      : "We couldn’t find this page"}
                  </h2>
                  <Link href="/" className="button primary">
                    {t.back}
                  </Link>
                </div>
              )}
            </>
          )}
        </main>
        <footer className="footer">
          <span>
            <AudioLines size={14} /> Callori
          </span>
          <span>{t.neverGuess}</span>
          <Heart size={13} />
        </footer>
      </div>
    </div>
  );
}
const templates = [
  { key: "appointment", icon: Stethoscope, color: "purple" },
  { key: "restaurant", icon: Utensils, color: "orange" },
  { key: "inquiry", icon: MessageCircle, color: "blue" },
  { key: "followup", icon: Clock3, color: "purple" },
] as const;
function Overview({ state, t, l }: { state: State; t: T; l: Locale }) {
  return (
    <>
      <div className="page-heading home-heading">
        <div className="eyebrow">
          <span />{" "}
          {l === "es"
            ? "UN POCO MÁS FÁCIL, CADA DÍA"
            : "EVERYDAY LIFE, A LITTLE EASIER"}
        </div>
        <h1>
          {t.greeting}
          <br />
          <span>{t.headline}</span>
        </h1>
        <p>{t.intro}</p>
      </div>
      <div className="overview-grid">
        <div className="overview-primary">
          <section className="start-section">
            <div className="section-heading">
              <div>
                <h2>{t.start}</h2>
                <p>{t.startSub}</p>
              </div>
              <Sparkles size={21} />
            </div>
            <div className="template-grid">
              {templates.map(({ key, icon: Icon, color }) => (
                <Link
                  href={`/calls/new?template=${key}`}
                  className="template-card"
                  key={key}
                >
                  <div className={`template-icon ${color}`}>
                    <Icon size={23} />
                  </div>
                  <h3>{t[key]}</h3>
                  <p>{t[`${key}Sub`]}</p>
                  <ArrowUpRight className="template-arrow" size={18} />
                </Link>
              ))}
            </div>
            <div className="custom-call">
              <span>{t.custom}</span>
              <Link href="/calls/new?template=custom">
                {t.customLink}
                <ArrowRight size={16} />
              </Link>
            </div>
          </section>
          <section className="recent-section">
            <div className="section-heading">
              <h2>{t.recent}</h2>
              <Link href="/calls">
                {t.viewAll}
                <ArrowRight size={16} />
              </Link>
            </div>
            {state.calls.length ? (
              <div className="call-list">
                {state.calls.slice(0, 3).map((call) => (
                  <CallRow call={call} key={call.id} l={l} />
                ))}
              </div>
            ) : (
              <div className="empty-calls">
                <div className="empty-call-icon">
                  <Phone size={25} />
                  <span>
                    <Plus size={12} />
                  </span>
                </div>
                <h3>{t.empty}</h3>
                <p>{t.emptySub}</p>
                <Link href="/calls/new">
                  {t.emptyCta}
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </section>
        </div>
        <aside className="overview-aside" aria-label={t.companion}>
          <div className="companion-card">
            <div className="companion-label">
              <span className="mini-logo">
                <AudioLines size={16} />
              </span>
              {t.companion}
            </div>
            <h2>
              {t.companionTitle.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </h2>
            <div className="voice-orbit">
              <div className="orbit-ring one" />
              <div className="orbit-ring two" />
              <div className="voice-core">
                <Wave large />
              </div>
              <span className="language-chip jp">こんにちは</span>
              <span className="language-chip en">Hello, there.</span>
              <span className="orbit-star">✦</span>
            </div>
            <p>{t.companionSub}</p>
            <div className="companion-footer">
              <ShieldCheck size={16} />
              {t.neverGuess}
            </div>
          </div>
          <div className="how-card">
            <h3>{t.how}</h3>
            {[1, 2, 3].map((n) => (
              <div className="how-step" key={n}>
                <span>{String(n).padStart(2, "0")}</span>
                <div>
                  <h4>{t[`step${n}` as keyof T]}</h4>
                  <p>{t[`step${n}Sub` as keyof T]}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
function CallRow({ call, l }: { call: Call; l: Locale }) {
  const Icon = templates.find((x) => x.key === call.scenario)?.icon || Phone;
  return (
    <Link href={`/calls/${call.id}`} className="call-row">
      <span className="row-icon">
        <Icon size={20} />
      </span>
      <div className="call-row-title">
        <strong>{call.objective}</strong>
        <span>
          {call.phone}
          <i>·</i>
          {languageNames[l][call.language]}
          <i>·</i>
          {new Date(call.createdAt).toLocaleDateString(l, {
            month: "short",
            day: "numeric",
          })}
          {call.mode === "demo" && (
            <em>{l === "es" ? "Práctica" : "Practice"}</em>
          )}
        </span>
      </div>
      <Badge call={call} l={l} />
      <ChevronRight size={17} />
    </Link>
  );
}
function History({ calls, t, l }: { calls: Call[]; t: T; l: Locale }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = calls.filter(
    (c) =>
      (filter === "all" ||
        (filter === "active" ? !terminal(c.status) : terminal(c.status))) &&
      `${c.objective} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading split">
        <div>
          <div className="eyebrow">{t.workspace}</div>
          <h1>{t.allCalls}</h1>
          <p>{t.allSub}</p>
        </div>
        <Link href="/calls/new" className="button primary">
          <Plus size={18} />
          {t.newCall}
        </Link>
      </div>
      <div className="history-stats">
        <div>
          <Phone size={20} />
          <strong>{calls.length}</strong>
          <span>{t.callCount}</span>
        </div>
        <div>
          <CheckCheck size={20} />
          <strong>
            {
              calls.filter((c) => c.status === "completed" && c.mode === "live")
                .length
            }
          </strong>
          <span>{t.completedCount}</span>
        </div>
        <div>
          <Clock3 size={20} />
          <strong>{calls.filter((c) => !terminal(c.status)).length}</strong>
          <span>{t.active}</span>
        </div>
      </div>
      <div className="history-panel">
        <div className="history-toolbar">
          <div className="filter-tabs" role="group" aria-label={t.status}>
            {["all", "active", "finished"].map((f) => (
              <button
                key={f}
                className={filter === f ? "selected" : ""}
                onClick={() => setFilter(f)}
              >
                {t[f as keyof T]}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={17} />
            <input
              aria-label={t.search}
              placeholder={t.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {filtered.length ? (
          filtered.map((call) => <CallRow key={call.id} call={call} l={l} />)
        ) : (
          <div className="empty-state">
            <Phone size={29} />
            <h3>{calls.length ? t.noResults : t.empty}</h3>
            <p>{t.emptySub}</p>
            <Link href="/calls/new" className="button primary">
              <Plus size={17} />
              {t.newCall}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
function Field({
  label,
  optional,
  children,
  help,
}: {
  label: string;
  optional?: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {optional && <small>{optional}</small>}
      </span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}
function CallPage({
  call,
  t,
  l,
  onChange,
}: {
  call: Call;
  t: T;
  l: Locale;
  onChange: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [original, setOriginal] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const done = terminal(call.status);
  const pending = call.question && !call.question.answered && !done;
  useEffect(() => {
    const el = scroll.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 350)
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [call.transcript.length]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || !call.question) return;
    setBusy(true);
    setError("");
    try {
      await api(`calls/${call.id}/answer`, "POST", {
        questionId: call.question.id,
        answer,
      });
      setAnswer("");
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      await api(`calls/${call.id}/cancel`, "POST", {});
      dialog.current?.close();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const lines = [
      `Callori — ${call.mode === "demo" ? t.practice : t.live}`,
      call.objective,
      call.phone,
      "",
      ...call.transcript.map(
        (x) =>
          `${new Date(x.at).toLocaleTimeString(l)} · ${x.role === "agent" ? t.agent : x.role === "recipient" ? t.recipient : x.role === "user" ? t.you : t.system}\n${x.translations[l] || x.original}${x.interrupted ? " [" + t.interrupted + "]" : ""}`,
      ),
      "",
      call.result?.summary || "",
      ...(call.result?.details || []),
    ];
    const blob = new Blob([lines.join("\n\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `callori-${call.id.slice(0, 8)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <Link href="/calls" className="back-link">
        <ArrowLeft size={16} />
        {t.allCalls}
      </Link>
      <div className="call-heading">
        <div>
          <div className="eyebrow">
            {call.mode === "demo"
              ? t.practiceBadge
              : languageNames[l][call.language]}
          </div>
          <h1>{call.objective}</h1>
          <p>
            <Phone size={15} />
            {call.phone}
            <span>·</span>
            <Globe2 size={15} />
            {languageNames[l][call.language]}
          </p>
        </div>
        <div className="call-heading-actions">
          <Badge call={call} l={l} />
          <span className="duration">
            <Clock3 size={16} />
            <Duration call={call} />
          </span>
          {!done && (
            <button
              className="button danger"
              onClick={() => dialog.current?.showModal()}
            >
              <PhoneOff size={17} />
              {t.endCall}
            </button>
          )}
        </div>
      </div>
      {call.error && (
        <div role="alert" className="alert error">
          {errorText(call.error, l)}
        </div>
      )}
      {done && call.result && (
        <section
          className={`result-card ${call.result.outcome === "success" ? "success" : ""}`}
        >
          <span className="result-icon">
            {call.mode === "demo" ? (
              <Sparkles size={29} />
            ) : call.result.outcome === "success" ? (
              <CheckCheck size={29} />
            ) : (
              <MessageCircle size={29} />
            )}
          </span>
          <div>
            <div className="eyebrow">
              {call.mode === "demo" ? t.practice : t.resultSub}
            </div>
            <h2>
              {call.mode === "demo"
                ? t.resultDemo
                : call.result.outcome === "success"
                  ? t.resultTitle
                  : t.resultIncomplete}
            </h2>
            <p>{call.result.summary}</p>
            {call.result.details.length > 0 && (
              <ul>
                {call.result.details.map((detail, i) => (
                  <li key={i}>
                    <Check size={15} />
                    {detail}
                  </li>
                ))}
              </ul>
            )}
            <div className="result-actions">
              <Link href="/calls/new" className="button primary">
                <Plus size={16} />
                {t.nextCall}
              </Link>
              <button className="button secondary" onClick={download}>
                <ArrowDownToLine size={16} />
                {t.download}
              </button>
            </div>
          </div>
        </section>
      )}
      <div className="live-layout">
        <section className="conversation-panel">
          <header>
            <div>
              <span className="conversation-icon">
                <AudioLines size={20} />
              </span>
              <h2>{done ? t.transcript : t.conversation}</h2>
            </div>
            <span className="translation-label">
              <Languages size={15} />
              {t.translated}
            </span>
          </header>
          <div className="conversation-toolbar">
            <span>
              <span className={`connection-dot ${done ? "ended" : ""}`} />
              {done || call.status === "dialing"
                ? statuses[l][call.status]
                : t.connectedLabel}
            </span>
            <button onClick={() => setOriginal(!original)}>
              {original ? t.hideOriginal : t.original}
            </button>
          </div>
          <div
            className="transcript-scroll"
            tabIndex={0}
            ref={scroll}
            role="log"
            aria-label={t.transcript}
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!call.transcript.length ? (
              <div className="waiting-transcript">
                <div className="small-wave">
                  <Wave active />
                </div>
                <h3>{t.awaiting}</h3>
                <p>{t.awaitingSub}</p>
              </div>
            ) : (
              call.transcript.map((line) => (
                <div className={`message ${line.role}`} key={line.id}>
                  <span className="message-avatar">
                    {line.role === "agent" ? (
                      <AudioLines size={17} />
                    ) : line.role === "recipient" ? (
                      <Phone size={15} />
                    ) : line.role === "user" ? (
                      <UserRound size={16} />
                    ) : (
                      <CircleHelp size={16} />
                    )}
                  </span>
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>
                        {line.role === "agent"
                          ? t.agent
                          : line.role === "recipient"
                            ? t.recipient
                            : line.role === "user"
                              ? t.you
                              : t.system}
                      </strong>
                      <time>
                        {new Date(line.at).toLocaleTimeString(l, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      {line.role === "agent" && <span>AI</span>}
                    </div>
                    <p>{line.translations[l] || line.original}</p>
                    {!line.translations[l] && line.role !== "user" && (
                      <small className="translation-notice">
                        {t.translationUnavailable}
                      </small>
                    )}
                    {original &&
                      line.translations[l] &&
                      line.original !== line.translations[l] && (
                        <p className="original-text" lang={call.language}>
                          {line.original}
                        </p>
                      )}
                    {line.interrupted && <small>{t.interrupted}</small>}
                    {line.role === "user" && (
                      <small>
                        <ShieldCheck size={12} />
                        {t.privateAnswer}
                      </small>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {!done && (
            <div className="conversation-bottom">
              <Wave active={call.status === "connected"} />
              <span>{statuses[l][call.status]}</span>
              <span className="elapsed">
                <Duration call={call} />
              </span>
            </div>
          )}
        </section>
        <aside className="live-aside" aria-label={t.callBrief}>
          {pending && (
            <section className="question-card" aria-live="polite">
              <span className="question-symbol">
                <MessageCircle size={24} />
              </span>
              <div className="eyebrow">
                {call.question!.kind === "approval"
                  ? t.questionType
                  : t.infoType}
              </div>
              <h2>{t.waitingTitle}</h2>
              <p className="question-text">{call.question!.text}</p>
              <p className="question-help">{t.waitingHelp}</p>
              <form onSubmit={send}>
                <label className="sr-only" htmlFor="answer">
                  {t.yourAnswer}
                </label>
                <textarea
                  id="answer"
                  rows={3}
                  placeholder={t.answerPlaceholder}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  required
                  maxLength={2000}
                />
                <button
                  className="button primary"
                  disabled={busy || !answer.trim()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}{" "}
                  {busy ? t.sending : t.sendAnswer}
                </button>
              </form>
            </section>
          )}
          {error && (
            <div className="alert error" role="alert">
              {errorText(error, l)}
            </div>
          )}
          <section className="brief-card">
            <h3>
              <PhoneCall size={18} />
              {t.callBrief}
            </h3>
            <dl>
              <dt>{t.yourObjective}</dt>
              <dd>{call.objective}</dd>
              {call.context && (
                <>
                  <dt>{t.contextLabel}</dt>
                  <dd>{call.context}</dd>
                </>
              )}
              {call.constraints && (
                <>
                  <dt>{t.constraintsLabel}</dt>
                  <dd>{call.constraints}</dd>
                </>
              )}
              <dt>{t.callLanguage}</dt>
              <dd>
                <Globe2 size={15} />
                {languageNames[l][call.language]}
              </dd>
            </dl>
          </section>
          <div className="reassurance">
            <ShieldCheck size={22} />
            <h3>{t.neverGuess}</h3>
            <p>{t.neverGuessSub}</p>
          </div>
        </aside>
      </div>
      <dialog ref={dialog} className="confirm-dialog">
        <button
          className="dialog-close"
          onClick={() => dialog.current?.close()}
          aria-label={t.keepCall}
        >
          <X size={20} />
        </button>
        <span className="end-icon">
          <PhoneOff size={25} />
        </span>
        <h2>{t.confirmEnd}</h2>
        <p>{t.confirmEndSub}</p>
        <div className="dialog-actions">
          <button
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            {t.keepCall}
          </button>
          <button className="button danger" disabled={busy} onClick={cancel}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <PhoneOff size={16} />
            )}{" "}
            {t.endCall}
          </button>
        </div>
      </dialog>
    </>
  );
}
const connectionLabels: Record<string, string> = {
  OPENAI_API_KEY: "OpenAI",
  TELNYX_API_KEY: "Telnyx",
  TELNYX_CONNECTION_ID: "Telnyx connection",
  TELNYX_FROM_NUMBER: "Outbound number",
  TELNYX_PUBLIC_KEY: "Webhook signature verification",
  PUBLIC_BASE_URL: "Public callback URL",
  ALLOWED_PHONE_NUMBERS: "Allowed destinations",
  LIVE_CALLS_ENABLED: "Real calling enabled",
  HTTPS_CALLBACK: "Secure HTTPS callback",
  CALL_RECOVERY: "Previous calls closed",
};
const connectionLabelsEs: Record<string, string> = {
  OPENAI_API_KEY: "OpenAI",
  TELNYX_API_KEY: "Telnyx",
  TELNYX_CONNECTION_ID: "Conexión de Telnyx",
  TELNYX_FROM_NUMBER: "Número de salida",
  TELNYX_PUBLIC_KEY: "Verificación de firma",
  PUBLIC_BASE_URL: "URL de notificaciones",
  ALLOWED_PHONE_NUMBERS: "Destinos autorizados",
  LIVE_CALLS_ENABLED: "Llamadas reales habilitadas",
  HTTPS_CALLBACK: "Notificaciones HTTPS",
  CALL_RECOVERY: "Llamadas anteriores cerradas",
};
function ProfilePage({
  state,
  t,
  l,
  onSaved,
}: {
  state: State;
  t: T;
  l: Locale;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(state.profile);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const change = (key: keyof Profile, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("profile", "PUT", form);
      await onSaved();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">{t.settings}</div>
        <h1>{t.profileTitle}</h1>
        <p>{t.profileSub}</p>
      </div>
      <div className="form-layout settings-layout">
        <form className="form-card" onSubmit={submit}>
          <div className="profile-form-heading">
            <span className="profile-large-avatar">
              {form.preferredName[0] || form.firstName[0] || (
                <UserRound size={29} />
              )}
            </span>
            <div>
              <h2>{t.profile}</h2>
              <p>{t.profileNote}</p>
            </div>
          </div>
          <div className="field-row">
            <Field
              label={t.firstName}
              help={
                l === "es"
                  ? "Todos tus nombres, tal como deben figurar en la cita."
                  : "All given names, exactly as they should appear on the booking."
              }
            >
              <input
                autoComplete="given-name"
                maxLength={100}
                value={form.firstName}
                onChange={(e) => change("firstName", e.target.value)}
              />
            </Field>
            <Field label={t.lastName}>
              <input
                autoComplete="family-name"
                maxLength={100}
                value={form.lastName}
                onChange={(e) => change("lastName", e.target.value)}
              />
            </Field>
          </div>
          <Field
            label={t.preferredName}
            help={
              l === "es"
                ? "Solo para el trato informal. No sustituye tu nombre completo."
                : "For informal address only. This never replaces your full name."
            }
          >
            <input
              autoComplete="nickname"
              maxLength={100}
              value={form.preferredName}
              onChange={(e) => change("preferredName", e.target.value)}
            />
          </Field>
          <div className="field-row">
            <Field label={t.age}>
              <input
                type="number"
                min={0}
                max={120}
                value={form.age}
                onChange={(e) => change("age", e.target.value)}
              />
            </Field>
            <Field label={t.sex}>
              <select
                value={form.sex}
                onChange={(e) => change("sex", e.target.value)}
              >
                <option value="">{t.choose}</option>
                <option value="female">{t.female}</option>
                <option value="male">{t.male}</option>
                <option value="intersex">{t.intersex}</option>
                <option value="prefer-not-to-say">{t.preferNot}</option>
              </select>
            </Field>
          </div>
          <Field label={t.nationality}>
            <input
              autoComplete="off"
              maxLength={100}
              value={form.nationality}
              onChange={(e) => change("nationality", e.target.value)}
            />
          </Field>
          <Field label={t.uiLanguage}>
            <select
              value={form.uiLanguage}
              onChange={(e) => change("uiLanguage", e.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </Field>
          {error && (
            <div className="alert error" role="alert">
              {errorText(error, l)}
            </div>
          )}
          <div className="form-footer">
            <span className="saved-message" role="status">
              {saved && (
                <>
                  <Check size={16} />
                  {t.saved}
                </>
              )}
            </span>
            <button className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}{" "}
              {t.save}
            </button>
          </div>
        </form>
        <aside className="form-aside" aria-label={t.review}>
          <section className="connections-card">
            <h2>
              <span className="connection-icon">
                <AudioLines size={19} />
              </span>
              {t.connections}
            </h2>
            <p>{t.connectionsSub}</p>
            <span
              className={`readiness ${state.readiness.ready ? "ready" : ""}`}
            >
              <span />
              {state.readiness.ready ? t.ready : t.setupRequired}
            </span>
            <div className="connection-list">
              {state.readiness.checks.map((c) => (
                <div key={c.name}>
                  <span>
                    {(l === "es" ? connectionLabelsEs : connectionLabels)[
                      c.name
                    ] || c.name}
                  </span>
                  {c.configured ? (
                    <Check
                      size={16}
                      className="configured"
                      aria-label={t.configured}
                    />
                  ) : (
                    <span className="missing" role="img" aria-label={t.missing}>
                      —
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="setup-help">{t.settingsHelp}</p>
          </section>
          <div className="reassurance">
            <ShieldCheck size={24} />
            <h3>{t.privacyTitle}</h3>
            <p>{t.privacyText}</p>
          </div>
        </aside>
      </div>
    </>
  );
}
