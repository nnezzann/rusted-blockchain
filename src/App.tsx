import { useEffect, useState } from "react";
import { Icon, type IconName } from "./components/Icon";
import { Onboarding, type LearningMode, type ThemeChoice } from "./features/Onboarding";
import { listExperiments, type SavedExperiment } from "./services/experiments";
import { closeWindow, controlWindow, errorMessage, getWindowSnapshot } from "./services/nativeRuntime";
import {
  BlockLabScreen,
  ChainLabScreen,
  ExperimentsScreen,
  HashLabScreen,
  MiningScreen,
  SettingsDetails,
  TransactionsScreen,
} from "./features/screens/LearningScreens";
import { PeerNetworkScreen } from "./features/screens/PeerNetworkScreen";
import "./App.css";

export type ScreenId =
  | "home"
  | "hash"
  | "block"
  | "mining"
  | "chain"
  | "transactions"
  | "peers"
  | "experiments"
  | "settings";

type NavigationItem = {
  id: ScreenId;
  label: string;
  icon: IconName;
};

const learnItems: NavigationItem[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "hash", label: "Hash Lab", icon: "hash" },
  { id: "block", label: "Block Lab", icon: "cube" },
  { id: "mining", label: "Mining", icon: "pickaxe" },
  { id: "chain", label: "Chain Lab", icon: "chain" },
  { id: "transactions", label: "Transactions", icon: "arrows" },
  { id: "peers", label: "Peer Network", icon: "network" },
];

const workItems: NavigationItem[] = [
  { id: "experiments", label: "Experiments", icon: "archive" },
];

const screenTitles: Record<ScreenId, { title: string; description: string }> = {
  home: {
    title: "Welcome to Chain-V",
    description: "Explore how Bitcoin works — one small experiment at a time.",
  },
  hash: {
    title: "Hash Lab",
    description: "See how a tiny change reshapes a cryptographic fingerprint.",
  },
  block: {
    title: "Block Lab",
    description: "Inspect a block header and see how its fields affect proof of work.",
  },
  mining: {
    title: "Mining",
    description: "Search for a nonce that meets an intentionally easy learning target.",
  },
  chain: {
    title: "Chain Lab",
    description: "Link blocks together and explore how edits affect later blocks.",
  },
  transactions: {
    title: "Transactions & Rewards",
    description: "Explore outputs, spending, fees, and Merkle commitments.",
  },
  peers: {
    title: "Peer Network",
    description: "Compare independent blockchain copies and explore how forks can diverge.",
  },
  experiments: {
    title: "Your Experiments",
    description: "Save, revisit, and organize your local learning sessions.",
  },
  settings: {
    title: "Settings",
    description: "Make the learning experience work the way you prefer.",
  },
};

function readPreference(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function readTheme(): ThemeChoice {
  const stored = readPreference("learning-blockchain-theme", "system");
  return stored === "light" || stored === "dark" ? stored : "system";
}

function readMode(): LearningMode {
  return readPreference("learning-blockchain-mode", "guided") === "free" ? "free" : "guided";
}

function App() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(
    () => readPreference("learning-blockchain-onboarding-complete", "false") === "true",
  );
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const [learningMode, setLearningMode] = useState<LearningMode>(readMode);
  const [screen, setScreen] = useState<ScreenId>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [enteredWorkspace, setEnteredWorkspace] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const effectiveTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };

    updateTheme();
    media.addEventListener("change", updateTheme);
    return () => media.removeEventListener("change", updateTheme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("learning-blockchain-theme", theme);
      setPreferenceError("");
    } catch {
      setPreferenceError("Appearance preference could not be saved.");
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("learning-blockchain-mode", learningMode);
      setPreferenceError("");
    } catch {
      setPreferenceError("Learning mode preference could not be saved.");
    }
  }, [learningMode]);

  const finishOnboarding = () => {
    localStorage.setItem("learning-blockchain-onboarding-complete", "true");
    setIsOnboardingComplete(true);
    setEnteredWorkspace(true);
    setScreen("home");
  };

  const openScreen = (nextScreen: ScreenId) => {
    setScreen(nextScreen);
    setSidebarOpen(false);
  };

  if (!isOnboardingComplete) {
    return (
      <div className="app-frame">
        <WindowTitlebar />
        <Onboarding
          theme={theme}
          learningMode={learningMode}
          preferenceError={preferenceError}
          onThemeChange={setTheme}
          onLearningModeChange={setLearningMode}
          onComplete={finishOnboarding}
        />
      </div>
    );
  }

  const currentScreen = screenTitles[screen];
  return (
    <div className="app-frame">
    <WindowTitlebar />
      <div className={`app-shell${enteredWorkspace ? " app-shell--enter" : ""}`}>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="cube" size={18} />
          </span>
          <span className="brand-name">Chain-V</span>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavGroup
            title="Learn"
            items={learnItems}
            activeScreen={screen}
            onNavigate={openScreen}
          />
          <NavGroup
            title="Your work"
            items={workItems}
            activeScreen={screen}
            onNavigate={openScreen}
          />
        </nav>
        <div className="sidebar-spacer" />
        <button
          className={`nav-item${screen === "settings" ? " nav-item--active" : ""}`}
          onClick={() => openScreen("settings")}
        >
          <Icon name="settings" size={17} />
          <span>Settings</span>
        </button>
        <div className="sidebar-status" aria-label="Application status">
          <span className="status-dot" />
          <div>
            <span>Local · Offline</span>
            <span>{learningMode === "guided" ? "Guided learning" : "Explore freely"}</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="mobile-header">
          <button
            className="icon-button mobile-menu-button"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="brand brand--mobile">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="cube" size={18} />
            </span>
            <span className="brand-name">Chain-V</span>
          </div>
          <button
            className="icon-button"
            aria-label="Open settings"
            onClick={() => openScreen("settings")}
          >
            <Icon name="settings" />
          </button>
        </header>
        <div className="page-scroll">
          <div className="page-content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">LEARN BY EXPLORING</p>
                <h1>{currentScreen.title}</h1>
                <p className="page-description">{currentScreen.description}</p>
              </div>
            </div>
            {preferenceError && (
              <div className="notice notice--error preference-error" role="alert">
                <Icon name="info" size={16} />
                <p>{preferenceError} Check local app storage permissions and try again.</p>
              </div>
            )}
            <ScreenContent
              screen={screen}
              theme={theme}
              effectiveTheme={effectiveTheme}
              learningMode={learningMode}
              onNavigate={openScreen}
              onThemeChange={setTheme}
              onLearningModeChange={setLearningMode}
              onReplayOnboarding={() => {
                if (!window.confirm("Replay the first-run setup? Your experiments will not be deleted.")) return;
                try {
                  localStorage.removeItem("learning-blockchain-onboarding-complete");
                  setPreferenceError("");
                  setIsOnboardingComplete(false);
                } catch {
                  setPreferenceError("First-run setup could not be reopened because app storage is unavailable.");
                }
              }}
            />
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}

function WindowTitlebar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [controlError, setControlError] = useState("");

  useEffect(() => {
    let active = true;
    void getWindowSnapshot()
      .then((snapshot) => {
        if (active) setIsMaximized(snapshot.isMaximized);
      })
      .catch((error: unknown) => {
        if (active) setControlError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const runWindowAction = async (action: "minimize" | "toggle_maximize") => {
    setControlError("");
    try {
      const snapshot = await controlWindow(action);
      setIsMaximized(snapshot.isMaximized);
    } catch (error) {
      setControlError(errorMessage(error));
    }
  };

  const close = async () => {
    setControlError("");
    try {
      await closeWindow();
    } catch (error) {
      setControlError(errorMessage(error));
    }
  };

  return (
    <header className="window-titlebar" data-tauri-drag-region="deep">
      <div className="window-titlebar-brand" data-tauri-drag-region>
        <span className="window-titlebar-mark" data-tauri-drag-region aria-hidden="true">
          <Icon name="cube" size={13} />
        </span>
      </div>
      <span className="window-titlebar-title" role={controlError ? "status" : undefined} title={controlError || undefined}>
        {controlError || "Chain-V"}
      </span>
      <div className="window-titlebar-controls">
        <button className="window-control" aria-label="Minimize window" title="Minimize" onClick={() => void runWindowAction("minimize")}>
          <Icon name="minimize" size={15} />
        </button>
        <button className="window-control" aria-label={isMaximized ? "Restore window" : "Maximize window"} title={isMaximized ? "Restore" : "Maximize"} onClick={() => void runWindowAction("toggle_maximize")}>
          <Icon name="maximize" size={13} />
        </button>
        <button className="window-control window-control--close" aria-label="Close window" title="Close" onClick={() => void close()}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </header>
  );
}

function NavGroup({
  title,
  items,
  activeScreen,
  onNavigate,
}: {
  title: string;
  items: NavigationItem[];
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
}) {
  return (
    <div className="nav-group">
      <p className="nav-group-title">{title}</p>
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav-item${activeScreen === item.id ? " nav-item--active" : ""}`}
          aria-current={activeScreen === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <Icon name={item.icon} size={17} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function ScreenContent({
  screen,
  theme,
  effectiveTheme,
  learningMode,
  onNavigate,
  onThemeChange,
  onLearningModeChange,
  onReplayOnboarding,
}: {
  screen: ScreenId;
  theme: ThemeChoice;
  effectiveTheme: "light" | "dark";
  learningMode: LearningMode;
  onNavigate: (screen: ScreenId) => void;
  onThemeChange: (theme: ThemeChoice) => void;
  onLearningModeChange: (mode: LearningMode) => void;
  onReplayOnboarding: () => void;
}) {
  switch (screen) {
    case "home":
      return <HomeScreen onNavigate={onNavigate} />;
    case "settings":
      return (
        <SettingsDetails
          theme={theme}
          effectiveTheme={effectiveTheme}
          learningMode={learningMode}
          onThemeChange={onThemeChange}
          onLearningModeChange={onLearningModeChange}
          onReplayOnboarding={onReplayOnboarding}
        />
      );
    case "hash":
      return <HashLabScreen learningMode={learningMode} />;
    case "block":
      return <BlockLabScreen onNavigate={onNavigate} learningMode={learningMode} />;
    case "mining":
      return <MiningScreen onNavigate={onNavigate} learningMode={learningMode} />;
    case "chain":
      return <ChainLabScreen onNavigate={onNavigate} learningMode={learningMode} />;
    case "transactions":
      return <TransactionsScreen learningMode={learningMode} />;
    case "peers":
      return <PeerNetworkScreen />;
    case "experiments":
      return <ExperimentsScreen />;
    default:
      return <HomeScreen onNavigate={onNavigate} />;
  }
}

function HomeScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const [recentExperiments, setRecentExperiments] = useState<SavedExperiment[]>([]);
  const [experimentsError, setExperimentsError] = useState("");
  const [experimentsLoading, setExperimentsLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void listExperiments()
      .then((saved) => {
        if (active) setRecentExperiments(saved.slice(0, 3));
      })
      .catch((reason: unknown) => {
        if (active) setExperimentsError(`Saved experiments are unavailable: ${errorMessage(reason)}`);
      })
      .finally(() => {
        if (active) setExperimentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const quickStarts: { screen: ScreenId; icon: IconName; title: string; copy: string }[] = [
    { screen: "hash", icon: "hash", title: "Hash Lab", copy: "See how small changes create completely new hashes." },
    { screen: "block", icon: "cube", title: "Block Lab", copy: "Build and inspect a block header and check its validity." },
    { screen: "mining", icon: "pickaxe", title: "Mining", copy: "Find a nonce that meets the target (low difficulty)." },
    { screen: "chain", icon: "chain", title: "Chain Lab", copy: "Link blocks and see how changes break the chain." },
    { screen: "transactions", icon: "arrows", title: "Transactions", copy: "Work with UTXOs, validate rules, and build a Merkle tree." },
    { screen: "peers", icon: "network", title: "Peer Network", copy: "Compare independent sample chains and see where their tips diverge." },
    { screen: "experiments", icon: "archive", title: "Experiments", copy: "Save your work and explore at your own pace." },
  ];

  return (
    <div className="home-screen">
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="welcome-kicker"><span className="status-dot" /> LOCAL LEARNING MODE</span>
          <h2>Small steps.<br /><span>Big concepts.</span></h2>
          <p>
            Build an intuition for Bitcoin by changing data, inspecting blocks, and
            discovering the rules that connect them.
          </p>
          <button className="button button--primary" onClick={() => onNavigate("hash")}>
            <Icon name="play" size={15} />
            Start Learning
            <Icon name="arrow-right" size={15} />
          </button>
        </div>
        <BlockIllustration />
      </section>

      <div className="section-heading">
        <div>
          <h2>Quick Start</h2>
          <p>Choose a lab and learn by doing.</p>
        </div>
        <button className="text-button" onClick={() => onNavigate("experiments")}>
          Your experiments <Icon name="arrow-right" size={14} />
        </button>
      </div>
      <div className="quick-grid">
        {quickStarts.map((item, index) => (
          <button
            className="quick-card"
            key={item.screen}
            onClick={() => onNavigate(item.screen)}
          >
            <span className={`quick-icon quick-icon--${index % 6}`}>
              <Icon name={item.icon} size={18} />
            </span>
            <span className="quick-card-title">{item.title}</span>
            <span className="quick-card-copy">{item.copy}</span>
            <span className="quick-card-arrow" aria-hidden="true"><Icon name="arrow-right" size={15} /></span>
          </button>
        ))}
      </div>
      <section className="recent-section">
        <div className="section-heading">
          <div><h2>Recent experiments</h2><p>Pick up where you left off.</p></div>
          <button className="text-button" onClick={() => onNavigate("experiments")}>View all <Icon name="arrow-right" size={14} /></button>
        </div>
        {experimentsError && <div className="notice notice--error" role="alert"><Icon name="info" size={16} /><p>{experimentsError}</p></div>}
        {recentExperiments.length > 0 ? (
          <div className="recent-list">
            {recentExperiments.map((experiment) => (
              <div className="recent-experiment" key={experiment.id}>
                <span className="experiment-icon"><Icon name="cube" size={17} /></span>
                <span className="recent-experiment-copy"><strong>{experiment.name}</strong><small>{experiment.kind}</small></span>
                <span className="recent-experiment-date">{new Date(experiment.updatedAt).toLocaleDateString()}</span>
                <button className="icon-button" aria-label={`Open ${experiment.name} in experiments`} onClick={() => onNavigate("experiments")}><Icon name="arrow-right" size={15} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <span className="recent-empty-icon"><Icon name="archive" size={18} /></span>
            <span><strong>{experimentsLoading ? "Loading saved experiments…" : "No experiments yet"}</strong><small>Create one to save your learning progress locally.</small></span>
            <button className="button button--secondary" onClick={() => onNavigate("experiments")}>Create an experiment</button>
          </div>
        )}
      </section>
      <div className="notice notice--info">
        <Icon name="info" size={17} />
        <p><strong>Learning model.</strong> This app runs locally and uses intentionally simplified rules. It is not connected to Bitcoin or suitable for real funds.</p>
      </div>
    </div>
  );
}

function BlockIllustration() {
  return (
    <svg className="block-illustration" viewBox="0 0 300 230" role="img" aria-label="An illustration of connected blocks">
      <defs>
        <filter id="block-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <linearGradient id="block-face" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--illustration-top)" />
          <stop offset="1" stopColor="var(--illustration-bottom)" />
        </linearGradient>
      </defs>
      <path d="M146 62 85 105M154 67 196 104M148 78v66M85 121l48 34M197 119l-44 37" stroke="var(--illustration-line)" strokeWidth="2" strokeDasharray="4 6" />
      <circle cx="149" cy="152" r="45" fill="var(--accent)" opacity=".16" filter="url(#block-glow)" />
      <g transform="translate(119 22)">
        <path d="m30 0 30 17-30 17L0 17Z" fill="#6D7785" />
        <path d="M0 17 30 34v34L0 51Z" fill="#37404B" />
        <path d="m60 17-30 17v34l30-17Z" fill="#252C35" />
        <text x="30" y="43" textAnchor="middle" fill="#D9DEE5" fontSize="16" fontWeight="700">#</text>
      </g>
      <g transform="translate(34 93)">
        <path d="m30 0 30 17-30 17L0 17Z" fill="#7E8998" />
        <path d="M0 17 30 34v34L0 51Z" fill="#434D5A" />
        <path d="m60 17-30 17v34l30-17Z" fill="#2D3540" />
        <text x="30" y="47" textAnchor="middle" fill="#D9DEE5" fontSize="17">↗</text>
      </g>
      <g transform="translate(186 93)">
        <path d="m30 0 30 17-30 17L0 17Z" fill="#7E8998" />
        <path d="M0 17 30 34v34L0 51Z" fill="#434D5A" />
        <path d="m60 17-30 17v34l30-17Z" fill="#2D3540" />
        <text x="30" y="47" textAnchor="middle" fill="#D9DEE5" fontSize="18">≋</text>
      </g>
      <g transform="translate(119 132)">
        <path d="m30 0 30 17-30 17L0 17Z" fill="#F9C879" />
        <path d="M0 17 30 34v34L0 51Z" fill="#D98B2B" />
        <path d="m60 17-30 17v34l30-17Z" fill="#B86B18" />
        <text x="30" y="47" textAnchor="middle" fill="#FFF1DA" fontSize="23" fontWeight="700">₿</text>
      </g>
    </svg>
  );
}

export default App;
