import { useState } from "react";
import { Icon, type IconName } from "../components/Icon";

export type ThemeChoice = "system" | "light" | "dark";
export type LearningMode = "guided" | "free";

type OnboardingProps = {
  theme: ThemeChoice;
  learningMode: LearningMode;
  preferenceError: string;
  onThemeChange: (theme: ThemeChoice) => void;
  onLearningModeChange: (mode: LearningMode) => void;
  onComplete: () => void;
};

const steps = ["Welcome", "Choose Mode", "Appearance", "Ready!"];

const benefits: { icon: IconName; tone: string; title: string; copy: string }[] = [
  {
    icon: "book",
    tone: "blue",
    title: "Learn by Doing",
    copy: "Interactive labs and visual explanations build real understanding.",
  },
  {
    icon: "shield",
    tone: "amber",
    title: "Real Bitcoin Concepts",
    copy: "Hashing, blocks, Merkle trees, UTXOs and proof-of-work — made simple.",
  },
  {
    icon: "chain",
    tone: "amber",
    title: "Safe & Local",
    copy: "Everything runs on your machine. No network. No real money.",
  },
  {
    icon: "settings",
    tone: "green",
    title: "Your Pace",
    copy: "Choose your theme and learning style, then explore at your own pace.",
  },
];

export function Onboarding({
  theme,
  learningMode,
  preferenceError,
  onThemeChange,
  onLearningModeChange,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [saveError, setSaveError] = useState("");

  const next = () => {
    setSaveError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };
  const back = () => {
    setSaveError("");
    setStep((current) => Math.max(current - 1, 0));
  };
  const complete = () => {
    try {
      onComplete();
    } catch {
      setSaveError("Your setup could not be saved. Check local app storage and try again.");
    }
  };

  return (
    <main className="onboarding">
      <aside className="onboarding-rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="cube" size={19} /></span>
          <span className="brand-name">Learning<br />Blockchain</span>
        </div>
        <nav className="wizard-steps" aria-label="Setup progress">
          {steps.map((label, index) => (
            <div
              className={`wizard-step${step === index ? " wizard-step--active" : ""}${step > index ? " wizard-step--done" : ""}`}
              key={label}
              aria-current={step === index ? "step" : undefined}
            >
              <span className="wizard-step-number">
                {step > index ? <Icon name="check" size={15} strokeWidth={2.4} /> : index + 1}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </nav>
        <div className="onboarding-tagline">
          <Icon name="cube" size={24} />
          <span>Small steps.<br />Big concepts.</span>
        </div>
      </aside>

      <section className="wizard-content" aria-live="polite">
        <div className="wizard-content-inner" key={step}>
          {step === 0 && <WelcomeStep />}
          {step === 1 && (
            <ModeStep mode={learningMode} onChange={onLearningModeChange} />
          )}
          {step === 2 && (
            <AppearanceStep theme={theme} onChange={onThemeChange} />
          )}
          {step === 3 && <ReadyStep theme={theme} learningMode={learningMode} />}

          {saveError && (
            <div className="notice notice--error" role="alert">
              <Icon name="info" size={17} />
              <p>{saveError}</p>
            </div>
          )}
          {preferenceError && (
            <div className="notice notice--error" role="alert">
              <Icon name="info" size={17} />
              <p>{preferenceError} Check local app storage permissions and try again.</p>
            </div>
          )}

          <div className={`wizard-footer${step === 0 ? " wizard-footer--first" : ""}`}>
            {step > 0 ? (
              <button className="button button--secondary" onClick={back}>
                <Icon name="chevron-left" size={16} />
                Back
              </button>
            ) : <span />}
            <div className="wizard-footer-right">
              <span className="wizard-progress-label">STEP {step + 1} OF {steps.length}</span>
              {step < steps.length - 1 ? (
                <button className="button button--primary" onClick={next}>
                  {step === 0 ? "Get Started" : "Continue"}
                  <Icon name="arrow-right" size={16} />
                </button>
              ) : (
                <button className="button button--primary" onClick={complete}>
                  Start Learning
                  <Icon name="arrow-right" size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function WelcomeStep() {
  return (
    <div className="welcome-step">
      <div className="welcome-hero">
        <div className="welcome-hero-copy">
          <p className="eyebrow">WELCOME TO</p>
          <h1><span>Chain-V</span></h1>
          <p className="welcome-description">
            A hands-on, visual way to explore how Bitcoin works — from hashing and
            blocks to transactions and proof-of-work. Built for curious minds,
            designed for real understanding.
          </p>
        </div>
        <WelcomeIllustration />
      </div>
      <div className="benefit-grid">
        {benefits.map((benefit) => (
          <article className="benefit-card" key={benefit.title}>
            <span className={`benefit-icon benefit-icon--${benefit.tone}`}>
              <Icon name={benefit.icon} size={19} />
            </span>
            <div>
              <h2>{benefit.title}</h2>
              <p>{benefit.copy}</p>
            </div>
          </article>
        ))}
      </div>
      <blockquote className="welcome-quote">
        <p>“The best way to understand Bitcoin is to build it.”</p>
        <cite>— Inspired by Anders Brownworth</cite>
      </blockquote>
    </div>
  );
}

function WelcomeIllustration() {
  return (
    <svg className="welcome-illustration" viewBox="0 0 330 270" role="img" aria-label="Connected blocks form a small learning blockchain">
      <defs>
        <filter id="welcome-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>
      <path d="m163 85-68 62m70-55 70 51m-70-40v89m-70-41 68 57m73-54-71 58" stroke="var(--illustration-line)" strokeWidth="2" strokeDasharray="5 7" />
      <circle cx="165" cy="190" r="55" fill="var(--accent)" opacity=".18" filter="url(#welcome-glow)" />
      <Cube x={127} y={27} symbol="#" />
      <Cube x={33} y={104} symbol="↗" muted />
      <Cube x={222} y={104} symbol="≋" muted />
      <Cube x={127} y={158} symbol="₿" highlighted />
    </svg>
  );
}

function Cube({
  x,
  y,
  symbol,
  muted = false,
  highlighted = false,
}: {
  x: number;
  y: number;
  symbol: string;
  muted?: boolean;
  highlighted?: boolean;
}) {
  const top = highlighted ? "#F9C879" : muted ? "#9AA4B1" : "#7B8796";
  const left = highlighted ? "#D98B2B" : muted ? "#535E6B" : "#414B58";
  const right = highlighted ? "#B86B18" : muted ? "#37404B" : "#2D3540";
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="m38 0 38 22-38 22L0 22Z" fill={top} />
      <path d="M0 22 38 44v43L0 65Z" fill={left} />
      <path d="m76 22-38 22v43l38-22Z" fill={right} />
      <text x="38" y="57" textAnchor="middle" fill={highlighted ? "#FFF1DA" : "#E2E7ED"} fontSize={highlighted ? 24 : 20} fontWeight="700">
        {symbol}
      </text>
    </g>
  );
}

function ModeStep({
  mode,
  onChange,
}: {
  mode: LearningMode;
  onChange: (mode: LearningMode) => void;
}) {
  return (
    <div className="setup-step">
      <p className="eyebrow">MAKE IT YOURS · 01</p>
      <h1>How do you like to learn?</h1>
      <p className="setup-intro">
        Choose how much guidance you want while exploring. You can change this
        any time in Settings.
      </p>
      <fieldset className="mode-card-list">
        <legend className="sr-only">Choose learning mode</legend>
        <label className={`mode-card${mode === "guided" ? " mode-card--selected" : ""}`}>
          <input
            type="radio"
            name="learning-mode"
            value="guided"
            checked={mode === "guided"}
            onChange={() => onChange("guided")}
          />
          <span className="mode-card-icon mode-card-icon--amber"><Icon name="book" size={21} /></span>
          <span className="mode-card-content">
            <strong>Guided learning <span className="recommended-tag">RECOMMENDED</span></strong>
            <small>Inline explanations, hints, and short prompts help you understand each concept as you go.</small>
          </span>
          <span className="radio-indicator" aria-hidden="true" />
        </label>
        <label className={`mode-card${mode === "free" ? " mode-card--selected" : ""}`}>
          <input
            type="radio"
            name="learning-mode"
            value="free"
            checked={mode === "free"}
            onChange={() => onChange("free")}
          />
          <span className="mode-card-icon mode-card-icon--blue"><Icon name="pickaxe" size={21} /></span>
          <span className="mode-card-content">
            <strong>Explore freely</strong>
            <small>A concise workspace with fewer prompts. Every explanation stays available whenever you need it.</small>
          </span>
          <span className="radio-indicator" aria-hidden="true" />
        </label>
      </fieldset>
      <div className="notice notice--info setup-notice">
        <Icon name="info" size={17} />
        <p>This only changes how explanations are shown. It never changes the rules or results of an experiment.</p>
      </div>
    </div>
  );
}

function AppearanceStep({
  theme,
  onChange,
}: {
  theme: ThemeChoice;
  onChange: (theme: ThemeChoice) => void;
}) {
  const choices: { id: ThemeChoice; icon: IconName; title: string; copy: string }[] = [
    { id: "system", icon: "monitor", title: "System", copy: "Follows Fedora appearance" },
    { id: "light", icon: "sun", title: "Light", copy: "Bright and clear" },
    { id: "dark", icon: "moon", title: "Dark", copy: "Easy on the eyes" },
  ];
  return (
    <div className="setup-step">
      <p className="eyebrow">MAKE IT YOURS · 02</p>
      <h1>Choose your appearance</h1>
      <p className="setup-intro">
        Pick a theme that feels comfortable. System mode follows your Fedora
        desktop preference and updates when it changes.
      </p>
      <fieldset className="appearance-options">
        <legend className="sr-only">Choose appearance</legend>
        {choices.map((choice) => (
          <label
            className={`appearance-option${theme === choice.id ? " appearance-option--selected" : ""}`}
            key={choice.id}
          >
            <input
              type="radio"
              name="appearance"
              value={choice.id}
              checked={theme === choice.id}
              onChange={() => onChange(choice.id)}
            />
            <span className="appearance-preview" data-preview={choice.id}>
              <span className="preview-sidebar" />
              <span className="preview-main"><i /><i /><i /></span>
            </span>
            <span className="appearance-choice-copy">
              <strong><Icon name={choice.icon} size={15} />{choice.title}</strong>
              <small>{choice.copy}</small>
            </span>
            <span className="radio-indicator" aria-hidden="true" />
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function ReadyStep({
  theme,
  learningMode,
}: {
  theme: ThemeChoice;
  learningMode: LearningMode;
}) {
  const themeText = theme[0].toUpperCase() + theme.slice(1);
  return (
    <div className="setup-step ready-step">
      <span className="ready-mark"><Icon name="check" size={27} strokeWidth={2.5} /></span>
      <p className="eyebrow">YOU'RE ALL SET</p>
      <h1>Ready to explore?</h1>
      <p className="setup-intro">
        Your learning space is ready. Start with a small change and follow the
        chain of ideas from there.
      </p>
      <div className="ready-summary">
        <div><Icon name="book" size={18} /><span><small>Learning mode</small><strong>{learningMode === "guided" ? "Guided learning" : "Explore freely"}</strong></span></div>
        <div><Icon name={theme === "system" ? "monitor" : theme === "dark" ? "moon" : "sun"} size={18} /><span><small>Appearance</small><strong>{themeText}</strong></span></div>
        <div><Icon name="shield" size={18} /><span><small>Privacy</small><strong>Local · Offline</strong></span></div>
      </div>
      <div className="notice notice--info setup-notice">
        <Icon name="info" size={17} />
        <p>This is a learning model, not a Bitcoin node or wallet. Experiments use no real funds and do not connect to a network.</p>
      </div>
    </div>
  );
}
