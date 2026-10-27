import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../../components/Icon";
import {
  calculateMerkleRoot,
  cancelMining,
  createDemoChain,
  controlWindow,
  errorMessage,
  formatBytes,
  hashInput,
  inspectBlock,
  mineBlock,
  getGpuStatus,
  getSystemInfo,
  getWindowSnapshot,
  runComputeProbe,
  validateChain,
  type BlockHeader,
  type ChainValidation,
  type ComputeBackend,
  type ComputeResult,
  type GpuStatus,
  type HeaderInspection,
  type MiningProgress,
  type MiningResult,
  type SystemInfo,
  type WindowSnapshot,
} from "../../services/nativeRuntime";
import {
  loadPrototypeExperiments,
  isPrototypeExperiment,
  savePrototypeExperiments,
  type PrototypeExperiment,
} from "../../services/prototypeExperiments";
import type { ScreenId } from "../../App";
import type { LearningMode, ThemeChoice } from "../Onboarding";

type ModeProps = {
  learningMode: LearningMode;
};

type Props = ModeProps & {
  onNavigate: (screen: ScreenId) => void;
};

const DEFAULT_HASH_INPUT = "Hello, blockchain!";

function PrototypeNote({ children }: { children: ReactNode }) {
  return (
    <div className="prototype-note">
      <Icon name="info" size={16} />
      <p>{children}</p>
    </div>
  );
}

function LabLayout({
  title,
  icon,
  note,
  guidance,
  learningMode,
  backendConnected = false,
  backendMessage,
  children,
}: {
  title: string;
  icon: IconName;
  note: string;
  guidance: string;
  learningMode: LearningMode;
  backendConnected?: boolean;
  backendMessage?: string;
  children: ReactNode;
}) {
  return (
    <div className="lab-layout">
      <div className="lab-subheading">
        <span className="lab-subheading-icon"><Icon name={icon} size={18} /></span>
        <div><h2>{title}</h2><p>{note}</p></div>
      </div>
      <PrototypeNote>
        <strong>{backendConnected ? "Rust engine connected." : "Development preview."}</strong>{" "}
        {backendConnected
          ? backendMessage ?? "Hashing, serialized header data, mining, and header-chain proof-of-work results come from Rust."
          : "This workflow is not connected to the Rust blockchain engine yet; no derived results are simulated in the frontend."}
      </PrototypeNote>
      <GuidedHelp mode={learningMode}>{guidance}</GuidedHelp>
      {children}
    </div>
  );
}

function GuidedHelp({ mode, children }: { mode: LearningMode; children: ReactNode }) {
  if (mode === "free") {
    return <details className="guided-help guided-help--collapsed"><summary>Need a hint?</summary><p>{children}</p></details>;
  }
  return <div className="guided-help"><Icon name="book" size={15} /><p>{children}</p></div>;
}

function useMiningJob() {
  const activeJobId = useRef<string | null>(null);
  const [mining, setMining] = useState(false);
  const [progress, setProgress] = useState<MiningProgress | null>(null);
  const [result, setResult] = useState<MiningResult | null>(null);
  const [error, setError] = useState("");

  const start = async (header: BlockHeader) => {
    const jobId = crypto.randomUUID();
    activeJobId.current = jobId;
    setMining(true);
    setProgress(null);
    setResult(null);
    setError("");
    try {
      const mined = await mineBlock(jobId, header, 2_000_000, setProgress);
      setResult(mined);
      return mined;
    } catch (reason) {
      const message = errorMessage(reason);
      if (message.toLowerCase().includes("cancelled")) {
        setError("Mining cancelled. The header has not been changed.");
      } else {
        setError(message);
      }
      return null;
    } finally {
      activeJobId.current = null;
      setMining(false);
    }
  };

  const cancel = async () => {
    const jobId = activeJobId.current;
    if (!jobId) return;
    try {
      await cancelMining(jobId);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return { mining, progress, result, error, setError, start, cancel };
}

export function HashLabScreen({ learningMode }: ModeProps) {
  const [input, setInput] = useState(DEFAULT_HASH_INPUT);
  const [hashes, setHashes] = useState<{ sha256: string; sha256d: string } | null>(null);
  const [hashError, setHashError] = useState("");
  const [hashLoading, setHashLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setHashLoading(true);
      setHashError("");
      void hashInput(input)
        .then((result) => {
          if (active) setHashes(result);
        })
        .catch((error: unknown) => {
          if (active) {
            setHashes(null);
            setHashError(errorMessage(error));
          }
        })
        .finally(() => {
          if (active) setHashLoading(false);
        });
    }, 140);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [input]);

  return (
    <LabLayout title="Hash function" icon="hash" note="A one-way fingerprint for any input." guidance="SHA-256 maps any message to a fixed-size digest. It is deterministic, but a tiny input change should produce a radically different result." learningMode={learningMode} backendConnected>
      <div className="lab-two-column hash-layout">
        <section className="panel lab-panel">
          <div className="panel-title-row">
            <div><h3>Input data</h3><p>Change the message to explore the avalanche effect.</p></div>
            <button className="text-button" onClick={() => setInput(DEFAULT_HASH_INPUT)}>Reset</button>
          </div>
          <label className="field-label" htmlFor="hash-input">Message</label>
          <textarea
            id="hash-input"
            className="text-area"
            rows={5}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type or paste a message..."
          />
          <div className="field-hint"><span>{input.length} characters</span><span>Computed locally in Rust</span></div>
        </section>
        <section className="hash-results" aria-live="polite">
          <HashOutput label="SHA-256" description="Single SHA-256 digest" value={hashes?.sha256 ?? ""} loading={hashLoading} error={hashError} />
          <HashOutput label="Double SHA-256" description="SHA-256 applied twice" value={hashes?.sha256d ?? ""} loading={hashLoading} error={hashError} />
          <div className="explain-card explain-card--blue">
            <span className="explain-icon"><Icon name="info" size={17} /></span>
            <div><h3>The avalanche effect</h3><p>A tiny change in the input produces a dramatically different digest. Both values above are returned by Rust.</p></div>
          </div>
        </section>
      </div>
    </LabLayout>
  );
}

function HashOutput({
  label,
  description,
  value,
  loading,
  error,
}: {
  label: string;
  description: string;
  value: string;
  loading: boolean;
  error: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyError("");
      window.setTimeout(() => setCopied(false), 1400);
    } catch (reason) {
      setCopyError(errorMessage(reason));
    }
  };
  return (
    <section className="panel hash-output">
      <div className="panel-title-row">
        <div><h3>{label}</h3><p>{description}</p></div>
        <span className={`pending-pill${error ? " status-pill--error" : value ? " status-pill--success" : ""}`}>
          <span className="pending-dot" />{error ? "Error" : loading ? "Calculating" : value ? "Ready" : "Waiting"}
        </span>
      </div>
      <div className={`hash-value${value ? "" : " hash-value--empty"}`}>
        <code>{error || (loading ? "Calculating…" : value || "Digest unavailable")}</code>
        <button className="icon-button" aria-label={`Copy ${label} digest`} disabled={!value} onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} size={15} /></button>
      </div>
      {copied && <span className="sr-only" role="status">Digest copied</span>}
      {copyError && <p className="copy-error" role="alert">Could not copy digest: {copyError}</p>}
    </section>
  );
}

export function BlockLabScreen({ onNavigate, learningMode }: Props) {
  const [fields, setFields] = useState({
    version: "1",
    previous: "0000000000000000000000000000000000000000000000000000000000000000",
    merkle: "0000000000000000000000000000000000000000000000000000000000000000",
    timestamp: new Date().toISOString().slice(0, 16),
    target: "207fffff",
    nonce: "0",
  });
  const update = (key: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [key]: value }));
  const [inspection, setInspection] = useState<HeaderInspection | null>(null);
  const [inspectionError, setInspectionError] = useState("");
  const [loading, setLoading] = useState(false);
  const miner = useMiningJob();

  const toHeader = (): BlockHeader => {
    const timestamp = Math.floor(new Date(fields.timestamp).getTime() / 1000);
    const version = Number(fields.version);
    const bits = Number.parseInt(fields.target, 16);
    const nonce = Number(fields.nonce);
    if (!Number.isInteger(version) || version < -2_147_483_648 || version > 2_147_483_647) {
      throw new Error("Version must be a signed 32-bit integer.");
    }
    if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > 4_294_967_295) {
      throw new Error("Timestamp must be a valid time within the supported range.");
    }
    if (!Number.isInteger(bits) || bits < 0 || bits > 4_294_967_295) {
      throw new Error("Target must be an 8-digit hexadecimal compact target.");
    }
    if (!Number.isInteger(nonce) || nonce < 0 || nonce > 4_294_967_295) {
      throw new Error("Nonce must be an unsigned 32-bit integer.");
    }
    return {
      version,
      previousHash: fields.previous,
      merkleRoot: fields.merkle,
      timestamp,
      bits,
      nonce,
    };
  };

  useEffect(() => {
    let active = true;
    let header: BlockHeader;
    try {
      header = toHeader();
    } catch (reason) {
      setInspection(null);
      setInspectionError(errorMessage(reason));
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      setInspectionError("");
      void inspectBlock(header)
        .then((result) => {
          if (active) setInspection(result);
        })
        .catch((reason: unknown) => {
          if (active) {
            setInspection(null);
            setInspectionError(errorMessage(reason));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 140);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fields]);

  const reset = () => setFields({
    version: "1",
    previous: "0000000000000000000000000000000000000000000000000000000000000000",
    merkle: "0000000000000000000000000000000000000000000000000000000000000000",
    timestamp: new Date().toISOString().slice(0, 16),
    target: "207fffff",
    nonce: "0",
  });

  const mineHeader = async () => {
    setInspectionError("");
    try {
      const mined = await miner.start(toHeader());
      if (mined) update("nonce", String(mined.header.nonce));
    } catch (reason) {
      setInspectionError(errorMessage(reason));
    }
  };

  return (
    <LabLayout title="Block header" icon="cube" note="Explore the data committed by a block's proof of work." guidance="The header commits to its version, parent hash, Merkle root, time, target, and nonce. Changing one committed field changes the header hash. Chain-V uses the Bitcoin 80-byte header layout with an intentionally easy target limit." learningMode={learningMode} backendConnected>
      <div className="lab-two-column block-layout">
        <section className="panel lab-panel">
          <div className="panel-title-row"><div><h3>Header fields</h3><p>Inputs are checked by the Rust engine.</p></div><span className="sample-pill">LOCAL MODEL</span></div>
          <div className="field-grid">
            <Field label="Version" value={fields.version} onChange={(value) => update("version", value)} />
            <Field label="Previous block hash" value={fields.previous} onChange={(value) => update("previous", value)} mono />
            <Field label="Merkle root" value={fields.merkle} onChange={(value) => update("merkle", value)} mono placeholder="Not calculated" />
            <Field label="Timestamp" value={fields.timestamp} onChange={(value) => update("timestamp", value)} type="datetime-local" />
            <Field label="Target (nBits)" value={fields.target} onChange={(value) => update("target", value)} mono />
            <Field label="Nonce" value={fields.nonce} onChange={(value) => update("nonce", value)} mono />
          </div>
          <div className="field-actions">
            <button className="button button--secondary" onClick={reset}>
              <Icon name="refresh" size={15} /> Reset example
            </button>
            <button className="button button--secondary" onClick={() => onNavigate("mining")}>Open Mining</button>
            <button className="button button--primary" disabled={miner.mining} onClick={() => void mineHeader()}>
              <Icon name="pickaxe" size={15} /> {miner.mining ? "Mining…" : "Mine this header"}
            </button>
          </div>
          {miner.mining && <div className="mining-inline"><span>Searching nonce values… {miner.progress ? `${miner.progress.attempts.toLocaleString()} attempts` : ""}</span><button className="button button--secondary" onClick={() => void miner.cancel()}>Cancel</button></div>}
          {miner.error && <p className="backend-error" role="alert">{miner.error}</p>}
        </section>
        <div className="block-derived-column">
          <section className="panel validation-panel">
            <div className="validation-heading">
              <span className={`validation-symbol ${inspection?.meetsTarget ? "validation-symbol--valid" : inspection ? "validation-symbol--invalid" : "validation-symbol--pending"}`}><Icon name={inspection?.meetsTarget ? "check" : inspection ? "close" : "clock"} size={18} /></span>
              <div><h3>{inspection?.meetsTarget ? "Proof of work valid" : inspection ? "Hash above target" : loading ? "Inspecting header…" : "Header unavailable"}</h3><p>{inspectionError || (inspection ? "Header hash compared numerically with its compact target." : "Rust computes the header hash and target comparison.")}</p></div>
            </div>
            <div className="derived-list">
              <DerivedValue label="Header hash (SHA-256d)" value={inspection?.hash ?? ""} />
              <DerivedValue label="Target" value={inspection?.target ?? ""} />
            </div>
          </section>
          <section className="panel serialized-panel">
            <div className="panel-title-row"><div><h3>Serialized header</h3><p>80 bytes · hexadecimal</p></div><CopyValue value={inspection?.serializedHeader ?? ""} label="serialized header" /></div>
            <code className="serialized-empty">{inspection?.serializedHeader ?? (inspectionError || "Waiting for valid header fields…")}</code>
          </section>
          <div className="notice notice--info">
            <Icon name="info" size={16} />
            <p>Changing a committed field changes the Rust-calculated hash. Proof of work is an unsigned numeric comparison, not a prefix check.</p>
          </div>
        </div>
      </div>
    </LabLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  mono = false,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  type?: string;
  placeholder?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`text-input${mono ? " text-input--mono" : ""}`}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function DerivedValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="derived-value">
      <span>{label}</span>
      <code>{value || "Not available"}</code>
    </div>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyError("");
      window.setTimeout(() => setCopied(false), 1400);
    } catch (reason) {
      setCopied(false);
      setCopyError(errorMessage(reason));
    }
  };
  return (
    <>
      <button className="icon-button" aria-label={`Copy ${label}`} disabled={!value} onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} size={15} /></button>
      {copied && <span className="sr-only" role="status">{label} copied</span>}
      {copyError && <span className="copy-error" role="alert">Could not copy: {copyError}</span>}
    </>
  );
}

export function MiningScreen({ onNavigate, learningMode }: Props) {
  const miner = useMiningJob();
  const miningTarget = "0000ffff00000000000000000000000000000000000000000000000000000000";
  const [header] = useState<BlockHeader>(() => ({
    version: 1,
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    merkleRoot: "0000000000000000000000000000000000000000000000000000000000000000",
    timestamp: Math.floor(Date.now() / 1000),
    bits: 0x1f00ffff,
    nonce: 0,
  }));
  const start = () => void miner.start(header);

  return (
    <LabLayout title="Proof of work" icon="pickaxe" note="Search for a header hash that meets its target." guidance="Mining tries different nonce values until the header hash is numerically at or below the target. Rust performs the search and reports bounded progress. This is not Bitcoin network mining." learningMode={learningMode} backendConnected>
      <div className="mining-grid">
        <section className="panel mining-panel">
          <div className="panel-title-row"><div><h3>Mining run</h3><p>Standalone empty genesis-style header · target 0x1f00ffff</p></div><span className={`pending-pill${miner.result ? " status-pill--success" : miner.error ? " status-pill--error" : ""}`}><span className="pending-dot" />{miner.mining ? "Mining" : miner.result ? "Found" : miner.error ? "Stopped" : "Ready"}</span></div>
          <div className="mining-status">
            <div className="mining-orb"><Icon name="cpu" size={25} /></div>
            <div><h3>{miner.mining ? "Searching for a valid nonce" : miner.result ? "Proof of work found" : "Ready to mine locally"}</h3><p>{miner.mining && miner.progress ? `Latest nonce ${miner.progress.currentNonce.toLocaleString()} · ${miner.progress.currentHash}` : miner.result ? `Nonce ${miner.result.header.nonce.toLocaleString()} meets the target.` : "Rust searches the header nonce field using an intentionally easy learning target."}</p></div>
          </div>
          <div className="mining-stats">
            <Metric label="Attempts" value={miner.result?.attempts.toLocaleString() ?? miner.progress?.attempts.toLocaleString() ?? "—"} />
            <Metric label="Hash rate" value={miner.progress ? `${Math.round(miner.progress.hashRate).toLocaleString()} H/s` : miner.result ? `${Math.round(miner.result.attempts / Math.max(miner.result.elapsedMilliseconds / 1000, 0.001)).toLocaleString()} H/s` : "—"} />
            <Metric label="Elapsed" value={miner.result ? `${(miner.result.elapsedMilliseconds / 1000).toFixed(2)} s` : miner.progress ? `${(miner.progress.elapsedMilliseconds / 1000).toFixed(2)} s` : "—"} />
          </div>
          <button className="button button--primary mining-cta" disabled={miner.mining} onClick={start}>
            <Icon name="play" size={15} /> {miner.mining ? "Mining…" : miner.result ? "Mine again" : "Start mining"}
          </button>
          <button className="button button--secondary mining-cancel" disabled={!miner.mining} onClick={() => void miner.cancel()}>Cancel</button>
          {miner.error && <p className="backend-error" role="alert">{miner.error}</p>}
        </section>
        <section className="panel mining-chart-panel">
          <div className="panel-title-row"><div><h3>Hash rate</h3><p>Attempts per second during this run</p></div><span className="unit-pill">hashes/sec</span></div>
          <div className="chart-placeholder">
            <div className="chart-grid-lines"><span /><span /><span /><span /></div>
            <div className="chart-empty"><span className="chart-empty-icon"><Icon name="cpu" size={20} /></span><strong>{miner.progress ? `${Math.round(miner.progress.hashRate).toLocaleString()} hashes/sec` : miner.result ? "Mining complete" : "Progress updates appear here"}</strong><small>{miner.progress ? `${miner.progress.attempts.toLocaleString()} attempts checked` : miner.result ? `${miner.result.attempts.toLocaleString()} attempts · ${miner.result.elapsedMilliseconds.toFixed(2)} ms` : "Updates are sent periodically by Rust, not for every nonce."}</small></div>
          </div>
          <div className="target-comparison">
            <Metric label="Current / found hash" value={miner.result?.hash ?? miner.progress?.currentHash ?? "—"} mono />
            <Metric label="Target" value={miner.result?.target ?? miningTarget} mono />
          </div>
        </section>
      </div>
      <div className="notice notice--warning mining-warning">
        <Icon name="info" size={16} />
        <p><strong>Learning difficulty only.</strong> This run uses target 0x1f00ffff and is capped at two million nonce attempts. Rust also rejects targets easier than 0x207fffff. This is not Bitcoin network mining and does not estimate a completion percentage.</p>
      </div>
      <button className="text-button mining-back-link" onClick={() => onNavigate("block")}>Return to Block Lab <Icon name="arrow-right" size={14} /></button>
    </LabLayout>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="metric"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}

export function ChainLabScreen({ onNavigate, learningMode }: Props) {
  const [headers, setHeaders] = useState<BlockHeader[]>([]);
  const [validation, setValidation] = useState<ChainValidation | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadExample = async () => {
    setLoading(true);
    setError("");
    try {
      const demo = await createDemoChain();
      const result = await validateChain(demo);
      setHeaders(demo);
      setValidation(result);
      setSelectedBlock(0);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExample();
  }, []);

  useEffect(() => {
    let active = true;
    if (headers.length === 0) {
      setValidation(null);
      return;
    }
    void validateChain(headers)
      .then((result) => {
        if (active) setValidation(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [headers]);

  const editSelectedNonce = () => {
    if (selectedBlock === null) return;
    setHeaders((current) => current.map((header, index) =>
      index === selectedBlock ? { ...header, nonce: header.nonce + 1 } : header,
    ));
  };

  const mineFromSelection = async () => {
    if (selectedBlock === null || headers[selectedBlock] === undefined) return;
    setBusy(true);
    setError("");
    try {
      const next = [...headers];
      let previousHash = selectedBlock === 0
        ? "0000000000000000000000000000000000000000000000000000000000000000"
        : validation?.blocks[selectedBlock - 1]?.hash;
      if (!previousHash) throw new Error("The preceding block has no usable hash.");
      for (let index = selectedBlock; index < next.length; index += 1) {
        const current = next[index];
        if (!current) continue;
        const header = { ...current, previousHash, nonce: 0 };
        const mined = await mineBlock(crypto.randomUUID(), header, 2_000_000, () => {});
        next[index] = mined.header;
        previousHash = mined.hash;
      }
      setHeaders(next);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const addBlock = async () => {
    const tip = headers[headers.length - 1];
    const parentHash = validation?.blocks[validation.blocks.length - 1]?.hash;
    if (!tip || !parentHash) return;
    setBusy(true);
    setError("");
    try {
      const mined = await mineBlock(crypto.randomUUID(), {
        ...tip,
        previousHash: parentHash,
        timestamp: tip.timestamp + 1,
        nonce: 0,
      }, 2_000_000, () => {});
      setHeaders((current) => [...current, mined.header]);
      setSelectedBlock(headers.length);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LabLayout title="Linked blocks" icon="chain" note="A block commits to its parent using the previous header hash." guidance="Each block points to its parent by storing that parent's hash. Changing an earlier block breaks the later link unless descendants are updated and re-mined in sequence." learningMode={learningMode} backendConnected>
      <div className="chain-toolbar">
        <div><span className={`sample-pill${validation?.valid ? " status-pill--success" : ""}`}>{validation?.valid ? "VALID HEADER CHAIN" : "RUST VALIDATION"}</span><span className="chain-count">{headers.length} blocks · header proof-of-work only</span></div>
        <div className="toolbar-actions">
          <button className="button button--secondary" disabled={busy || loading} onClick={() => void loadExample()}><Icon name="refresh" size={15} /> Reset example</button>
          <button className="button button--primary" disabled={busy || loading || !validation?.valid} onClick={() => void addBlock()}><Icon name="plus" size={15} /> Add Block</button>
        </div>
      </div>
      {error && <p className="backend-error" role="alert">{error}</p>}
      <div className="chain-list">
        {loading && <div className="panel lab-panel" role="status">Creating and mining a three-block example in Rust…</div>}
        {!loading && headers.map((header, index) => {
          const height = index;
          const isSelected = selectedBlock === height;
          const entry = validation?.blocks[height];
          return (
            <article className={`chain-card${isSelected ? " chain-card--selected" : ""}`} key={height}>
              <div className="chain-card-index"><span>{height === 0 ? "G" : height}</span><small>{height === 0 ? "GENESIS" : `BLOCK ${height}`}</small></div>
              <div className="chain-card-body">
                <div className="chain-card-heading"><h3>{height === 0 ? "Genesis block" : `Block #${height}`}</h3><span className={`pending-pill${entry?.valid ? " status-pill--success" : entry ? " status-pill--error" : ""}`}><span className="pending-dot" />{entry?.valid ? "Valid" : entry ? "Invalid" : "Checking"}</span></div>
                <div className="chain-hashes">
                  <span>Hash <code>{entry?.hash ?? "Unavailable"}</code></span>
                  <span>Previous <code>{header.previousHash}</code></span>
                </div>
              </div>
              <div className="chain-card-actions">
                <button className="icon-button" aria-label={`Inspect block ${height}`} onClick={() => setSelectedBlock(isSelected ? null : height)}><Icon name="edit" size={15} /></button>
              </div>
              {isSelected && <div className="chain-inline-detail"><Icon name="info" size={15} /><span>{entry?.reasons.join(" ") || `Nonce ${header.nonce}; compact target 0x${header.bits.toString(16).padStart(8, "0")}.`}</span><button className="text-button" onClick={editSelectedNonce} disabled={busy}>Change nonce</button><button className="text-button" onClick={() => void mineFromSelection()} disabled={busy}>{busy ? "Mining…" : "Re-mine this block and descendants"}</button><button className="text-button" onClick={() => onNavigate("block")}>Open Block Lab</button></div>}
            </article>
          );
        })}
      </div>
      <div className="notice notice--warning">
        <Icon name="info" size={16} />
        <p>Editing a block changes its hash and invalidates its proof of work. Descendants must then point to the changed parent hash and be re-mined in order. This example validates headers only; it has no transactions or network consensus.</p>
      </div>
    </LabLayout>
  );
}

type TransactionTab = "transactions" | "utxos" | "merkle";

export function TransactionsScreen({ learningMode }: ModeProps) {
  const [tab, setTab] = useState<TransactionTab>("transactions");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [showCoinbase, setShowCoinbase] = useState(false);
  const tabs: { id: TransactionTab; label: string; icon: IconName }[] = [
    { id: "transactions", label: "Transactions", icon: "arrows" },
    { id: "utxos", label: "UTXOs", icon: "database" },
    { id: "merkle", label: "Merkle Tree", icon: "layers" },
  ];
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    if (!(event.target instanceof Element)) return;
    const currentButton = event.target.closest<HTMLButtonElement>('[role="tab"]');
    if (!currentButton) return;

    const currentIndex = tabs.findIndex((item) => `tab-${item.id}` === currentButton.id);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    event.preventDefault();
    document.getElementById(`tab-${nextTab.id}`)?.focus();
    setTab(nextTab.id);
  };
  return (
    <LabLayout title="Transactions & rewards" icon="arrows" note="Explore how outputs are created, spent, and committed to a block." guidance="Transactions spend specific unspent outputs and create new outputs. Their identifiers are paired and hashed into a Merkle root committed by a block header." learningMode={learningMode} backendConnected backendMessage="Merkle roots are calculated in Rust. Transaction creation, UTXO state, signatures, and transaction validation are not implemented yet.">
      <div className="tab-list" role="tablist" aria-label="Transaction learning views" onKeyDown={handleTabKeyDown}>
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="transaction-tabpanel"
            className={`tab-button${tab === item.id ? " tab-button--active" : ""}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={15} />{item.label}
          </button>
        ))}
      </div>
      <div id="transaction-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="transaction-content">
        {tab === "transactions" && (
          <div className="lab-two-column transaction-grid">
            <section className="panel lab-panel">
              <div className="panel-title-row"><div><h3>New transaction</h3><p>Compose an educational transaction draft.</p></div><span className="sample-pill">DRAFT</span></div>
              <div className="field">
                <label className="field-label" htmlFor="tx-input">Input · previous output</label>
                <select className="text-input" id="tx-input" defaultValue="">
                  <option value="" disabled>Select an available UTXO…</option>
                  <option value="example">Illustrative input · not connected</option>
                </select>
                <span className="field-hint">A transaction input spends one specific earlier output.</span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="tx-recipient">Output · recipient script/address</label>
                <input className="text-input" id="tx-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Enter an educational placeholder" />
              </div>
              <div className="form-inline">
                <div className="field">
                  <label className="field-label" htmlFor="tx-amount">Amount (learning units)</label>
                  <input className="text-input" id="tx-amount" type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="tx-fee">Fee (learning units)</label>
                  <input className="text-input" id="tx-fee" type="number" min="0" step="1" value={fee} onChange={(event) => setFee(event.target.value)} placeholder="0" />
                </div>
              </div>
              <button className="button button--primary full-width" disabled title="Transaction validation requires Rust">Validate transaction</button>
            </section>
            <section className="panel transaction-status-panel">
              <div className="panel-title-row"><div><h3>Validation status</h3><p>Backend results appear here.</p></div><span className="pending-pill"><span className="pending-dot" />Pending</span></div>
              <StatusCheck label="Input exists" />
              <StatusCheck label="No double spend" />
              <StatusCheck label="Values conserved" />
              <StatusCheck label="Fee valid" />
              <StatusCheck label="Signature verified" />
              <div className="notice notice--info transaction-disclaimer">
                <Icon name="info" size={16} />
                <p>Signatures are not implemented yet. This preview does not claim that a transaction is authorized or valid.</p>
              </div>
              <button className="text-button coinbase-toggle" onClick={() => setShowCoinbase((shown) => !shown)}>
                <Icon name="coin" size={15} /> {showCoinbase ? "Hide" : "Learn about"} coinbase rewards
              </button>
              {showCoinbase && <p className="coinbase-explainer">A coinbase transaction is the special first transaction in a block. Its reward is limited by the simplified rules in the Rust learning model.</p>}
            </section>
          </div>
        )}
        {tab === "utxos" && <UtxoView />}
        {tab === "merkle" && <MerkleView />}
      </div>
    </LabLayout>
  );
}

function StatusCheck({ label }: { label: string }) {
  return <div className="status-check"><span className="check-pending"><Icon name="clock" size={12} /></span><span>{label}</span><small>Not checked</small></div>;
}

function UtxoView() {
  return (
    <section className="panel lab-panel">
      <div className="panel-title-row"><div><h3>Unspent transaction outputs</h3><p>Each output may be spent once as a later transaction input.</p></div><span className="sample-pill">NO DATA</span></div>
      <div className="empty-data">
        <span><Icon name="database" size={21} /></span>
        <strong>UTXO set is not available yet</strong>
        <small>Once connected, Rust will show validated outputs and their spent/unspent state here.</small>
      </div>
    </section>
  );
}

function MerkleView() {
  const [ids, setIds] = useState(`${"11".repeat(32)}\n${"22".repeat(32)}\n${"33".repeat(32)}`);
  const [root, setRoot] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const calculate = async () => {
    setLoading(true);
    setError("");
    setRoot("");
    try {
      const transactionIds = ids.split(/\s+/).map((id) => id.trim()).filter(Boolean);
      setRoot(await calculateMerkleRoot(transactionIds));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="panel lab-panel merkle-panel">
      <div className="panel-title-row"><div><h3>Merkle root calculator</h3><p>Enter one 64-character transaction ID per line. An odd final leaf is duplicated.</p></div><span className="sample-pill">RUST</span></div>
      <label className="field-label" htmlFor="merkle-ids">Displayed transaction IDs</label>
      <textarea id="merkle-ids" className="text-area text-area--mono" rows={4} value={ids} onChange={(event) => setIds(event.target.value)} />
      <div className="toolbar-actions merkle-actions"><button className="button button--primary" disabled={loading} onClick={() => void calculate()}>{loading ? "Calculating…" : "Calculate Merkle root"}</button></div>
      {error && <p className="backend-error" role="alert">{error}</p>}
      {root && <div className="derived-value merkle-root-result"><span>Computed Merkle root · returned by Rust</span><code>{root}</code><CopyValue value={root} label="Merkle root" /></div>}
      <p className="merkle-caption">The calculation uses double SHA-256 over transaction ID pairs. This does not imply the supplied IDs correspond to validated transactions.</p>
    </section>
  );
}

export function ExperimentsScreen() {
  const [initialLoad] = useState(loadPrototypeExperiments);
  const [experiments, setExperiments] = useState<PrototypeExperiment[]>(initialLoad.experiments);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState(initialLoad.error ?? "");
  const [information, setInformation] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const filtered = useMemo(
    () => experiments.filter((item) => `${item.name} ${item.kind} ${item.description}`.toLowerCase().includes(query.toLowerCase())),
    [experiments, query],
  );

  const save = (next: PrototypeExperiment[]) => {
    try {
      savePrototypeExperiments(next);
      setExperiments(next);
      setError("");
      setInformation("");
      return true;
    } catch {
      setError("Could not save this experiment in local app storage. Check app storage permissions and try again.");
      return false;
    }
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError("Enter a name for the experiment.");
      return;
    }
    const experiment = {
      id: crypto.randomUUID(),
      name,
      kind: "Blank experiment",
      description: "Created in the frontend prototype; blockchain data is not connected.",
      updatedAt: new Date().toISOString(),
    };
    if (save([experiment, ...experiments])) {
      setNewName("");
      setCreating(false);
    }
  };

  const rename = (event: FormEvent, id: string) => {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name) {
      setError("Experiment name cannot be empty.");
      return;
    }
    if (save(experiments.map((item) => item.id === id ? { ...item, name, updatedAt: new Date().toISOString() } : item))) setRenamingId(null);
  };

  const duplicate = (experiment: PrototypeExperiment) => {
    save([{ ...experiment, id: crypto.randomUUID(), name: `${experiment.name} copy`, updatedAt: new Date().toISOString() }, ...experiments]);
  };

  const remove = (experiment: PrototypeExperiment) => {
    if (window.confirm(`Delete “${experiment.name}”? This removes its prototype data from this app profile.`)) {
      save(experiments.filter((item) => item.id !== experiment.id));
    }
  };

  const exportExperiment = (experiment: PrototypeExperiment) => {
    try {
      const blob = new Blob([JSON.stringify({ format: "learning-blockchain-experiment-prototype", version: 1, experiment }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${experiment.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "experiment"}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
      setInformation(`Exported “${experiment.name}” as metadata only. No blockchain snapshot is included.`);
    } catch {
      setInformation("");
      setError("Export failed. The experiment metadata could not be prepared for download.");
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("format" in parsed) ||
        parsed.format !== "learning-blockchain-experiment-prototype" ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("experiment" in parsed) ||
        !isPrototypeExperiment(parsed.experiment)
      ) {
        throw new Error("This file is not a supported experiment export.");
      }
      const item = parsed.experiment;
      if (!item.name.trim()) throw new Error("The experiment export is missing a name.");
      const imported: PrototypeExperiment = {
        id: crypto.randomUUID(),
        name: item.name,
        kind: "Imported prototype",
        description: "Imported metadata only; this file is not a validated blockchain snapshot.",
        updatedAt: new Date().toISOString(),
      };
      if (save([imported, ...experiments])) {
        setInformation(`Imported “${imported.name}” as metadata only. No blockchain snapshot was loaded.`);
      }
    } catch (reason) {
      setInformation("");
      setError(reason instanceof Error ? `Import failed: ${reason.message}` : "Import failed: the selected file could not be read.");
    }
  };

  return (
    <div className="experiments-layout">
      <PrototypeNote><strong>Prototype storage.</strong> Experiments currently persist in this app's local browser profile. Rust-owned SQLite storage and validated blockchain snapshots are not connected.</PrototypeNote>
      {error && <div className="notice notice--error" role="alert"><Icon name="info" size={16} /><p>{error}</p><button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><Icon name="close" size={15} /></button></div>}
      {information && <div className="notice notice--info" role="status"><Icon name="info" size={16} /><p>{information}</p><button className="icon-button" aria-label="Dismiss message" onClick={() => setInformation("")}><Icon name="close" size={15} /></button></div>}
      <div className="experiment-toolbar">
        <label className="search-field"><Icon name="search" size={16} /><span className="sr-only">Search experiments</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search experiments" /></label>
        <div className="toolbar-actions">
          <input ref={fileInput} className="sr-only" type="file" accept="application/json,.json" onChange={importFile} />
          <button className="button button--secondary" onClick={() => fileInput.current?.click()}><Icon name="upload" size={15} /> Import</button>
          <button className="button button--primary" onClick={() => { setCreating(true); setError(""); }}><Icon name="plus" size={15} /> New Experiment</button>
        </div>
      </div>
      {creating && (
        <form className="panel create-experiment-form" onSubmit={create}>
          <div className="field"><label className="field-label" htmlFor="new-experiment-name">Experiment name</label><input id="new-experiment-name" className="text-input" value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus placeholder="For example, My first chain" /></div>
          <div className="toolbar-actions"><button type="button" className="button button--secondary" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button><button className="button button--primary" type="submit">Create experiment</button></div>
        </form>
      )}
      {filtered.length === 0 ? (
        <div className="panel experiments-empty">
          <span className="empty-data-icon"><Icon name="archive" size={24} /></span>
          <h2>{query ? "No matching experiments" : "Your workspace starts here"}</h2>
          <p>{query ? "Try another search, or clear the search field." : "Create an experiment to keep a local place for your blockchain explorations."}</p>
          {!query && <button className="button button--primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Create your first experiment</button>}
        </div>
      ) : (
        <div className="experiment-list">
          {filtered.map((experiment) => (
            <article className="panel experiment-card" key={experiment.id}>
              <span className="experiment-icon"><Icon name="cube" size={19} /></span>
              <div className="experiment-main">
                {renamingId === experiment.id ? (
                  <form className="rename-form" onSubmit={(event) => rename(event, experiment.id)}>
                    <label className="sr-only" htmlFor={`rename-${experiment.id}`}>Rename experiment</label>
                    <input id={`rename-${experiment.id}`} className="text-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
                    <button type="submit" className="button button--primary">Save name</button>
                    <button type="button" className="button button--secondary" onClick={() => setRenamingId(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <h2>{experiment.name}</h2>
                    <p>{experiment.description}</p>
                    <div className="experiment-meta"><span>{experiment.kind}</span><span><Icon name="clock" size={12} />{new Date(experiment.updatedAt).toLocaleString()}</span></div>
                  </>
                )}
              </div>
              <div className="experiment-actions">
                <button className="button button--secondary" onClick={() => { setError(""); setInformation("This prototype stores experiment metadata only. Rust-backed experiment snapshots are not available to open yet."); }}>Open</button>
                <button className="icon-button" aria-label={`Rename ${experiment.name}`} title="Rename" onClick={() => { setRenameValue(experiment.name); setRenamingId(experiment.id); }}><Icon name="edit" size={15} /></button>
                <button className="icon-button" aria-label={`Duplicate ${experiment.name}`} title="Duplicate" onClick={() => duplicate(experiment)}><Icon name="copy" size={15} /></button>
                <button className="icon-button" aria-label={`Export ${experiment.name}`} title="Export" onClick={() => exportExperiment(experiment)}><Icon name="download" size={15} /></button>
                <button className="icon-button icon-button--danger" aria-label={`Delete ${experiment.name}`} title="Delete" onClick={() => remove(experiment)}><Icon name="trash" size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsDetails({
  theme,
  effectiveTheme,
  learningMode,
  onThemeChange,
  onLearningModeChange,
  onReplayOnboarding,
}: {
  theme: ThemeChoice;
  effectiveTheme: "light" | "dark";
  learningMode: LearningMode;
  onThemeChange: (theme: ThemeChoice) => void;
  onLearningModeChange: (mode: LearningMode) => void;
  onReplayOnboarding: () => void;
}) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus | null>(null);
  const [windowSnapshot, setWindowSnapshot] = useState<WindowSnapshot | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [computeBackend, setComputeBackend] = useState<ComputeBackend>("auto");
  const [computeResult, setComputeResult] = useState<ComputeResult | null>(null);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [computeLoading, setComputeLoading] = useState(false);

  const refreshRuntime = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);
    const [system, gpu, window] = await Promise.allSettled([
      getSystemInfo(),
      getGpuStatus(),
      getWindowSnapshot(),
    ]);
    if (system.status === "fulfilled") setSystemInfo(system.value);
    if (gpu.status === "fulfilled") setGpuStatus(gpu.value);
    if (window.status === "fulfilled") setWindowSnapshot(window.value);
    const failed = [system, gpu, window].filter((result) => result.status === "rejected");
    if (failed.length) {
      setRuntimeError(failed.map((result) => result.status === "rejected" ? errorMessage(result.reason) : "").join(" "));
    }
    setRuntimeLoading(false);
  };

  useEffect(() => {
    void refreshRuntime();
  }, []);

  const applyWindowAction = async (action: "center" | "restore" | "toggle_fullscreen" | "toggle_maximize") => {
    setRuntimeError(null);
    try {
      setWindowSnapshot(await controlWindow(action));
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  };

  const runProbe = async () => {
    setComputeLoading(true);
    setComputeError(null);
    setComputeResult(null);
    try {
      setComputeResult(await runComputeProbe(50_000, computeBackend));
    } catch (error) {
      setComputeError(errorMessage(error));
    } finally {
      setComputeLoading(false);
    }
  };

  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <div className="panel-heading"><span className="panel-icon"><Icon name="sun" /></span><div><h2>Appearance</h2><p>Choose how Chain-V looks.</p></div></div>
        <fieldset className="choice-row">
          <legend className="sr-only">Choose appearance</legend>
          {(["system", "light", "dark"] as const).map((option) => (
            <label key={option} className={`choice-card${theme === option ? " choice-card--selected" : ""}`}>
              <input type="radio" name="appearance-settings" value={option} checked={theme === option} onChange={() => onThemeChange(option)} />
              <span className={`theme-preview theme-preview--${option}`}><span /><span /><span /></span>
              <strong>{option[0].toUpperCase() + option.slice(1)}</strong>
              <small>{option === "system" ? `Follows Fedora (${effectiveTheme})` : `${option} appearance`}</small>
            </label>
          ))}
        </fieldset>
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading"><span className="panel-icon panel-icon--blue"><Icon name="book" /></span><div><h2>Learning mode</h2><p>Choose how much guidance appears in each lab.</p></div></div>
        <fieldset className="mode-options">
          <legend className="sr-only">Choose learning mode</legend>
          <label className="radio-option"><input type="radio" name="learning-mode" checked={learningMode === "guided"} onChange={() => onLearningModeChange("guided")} /><span><strong>Guided learning</strong><small>Show explanations, hints, and short prompts.</small></span></label>
          <label className="radio-option"><input type="radio" name="learning-mode" checked={learningMode === "free"} onChange={() => onLearningModeChange("free")} /><span><strong>Explore freely</strong><small>Keep the interface concise; help remains available.</small></span></label>
        </fieldset>
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading"><span className="panel-icon panel-icon--green"><Icon name="monitor" /></span><div><h2>Accessibility</h2><p>Motion follows Fedora's reduced-motion preference. System text zoom is supported, and high-contrast preferences strengthen borders and focus indicators.</p></div></div>
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading"><span className="panel-icon panel-icon--blue"><Icon name="cpu" /></span><div><h2>System &amp; compute</h2><p>Local device capabilities and an optional, general-purpose GPU compute probe. This does not run blockchain logic.</p></div></div>
        {runtimeError && <p className="runtime-error" role="alert">{runtimeError}</p>}
        <div className="runtime-grid">
          <div><span>System</span><strong>{systemInfo ? `${systemInfo.osVersion ?? systemInfo.operatingSystem} · ${systemInfo.architecture}` : runtimeLoading ? "Loading…" : "Unavailable"}</strong></div>
          <div><span>Logical processors</span><strong>{systemInfo?.logicalCpuCount ?? "—"}</strong></div>
          <div><span>Memory</span><strong>{systemInfo ? `${formatBytes(systemInfo.availableMemoryBytes)} available of ${formatBytes(systemInfo.totalMemoryBytes)}` : "—"}</strong></div>
          <div><span>GPU compute</span><strong>{gpuStatus?.available ? gpuStatus.adapterName : gpuStatus ? "Unavailable; CPU remains available" : "Checking…"}</strong></div>
        </div>
        {gpuStatus?.error && <p className="runtime-muted">{gpuStatus.error}</p>}
        {systemInfo && <p className="runtime-path"><span>App data</span><code>{systemInfo.appDataDirectory}</code></p>}
        <div className="settings-actions runtime-actions">
          <button className="button button--secondary" onClick={() => void refreshRuntime()} disabled={runtimeLoading}>
            Refresh device info
          </button>
          <span className="version-label">{windowSnapshot ? `${windowSnapshot.width} × ${windowSnapshot.height} px · ${windowSnapshot.scaleFactor.toFixed(2)}× scale` : "Window state unavailable"}</span>
        </div>
        <div className="runtime-actions">
          <button className="button button--secondary" onClick={() => void applyWindowAction("center")}>Center window</button>
          <button className="button button--secondary" onClick={() => void applyWindowAction("toggle_maximize")}>{windowSnapshot?.isMaximized ? "Restore size" : "Maximize"}</button>
          <button className="button button--secondary" onClick={() => void applyWindowAction("toggle_fullscreen")}>{windowSnapshot?.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}</button>
          <button className="button button--secondary" onClick={() => void applyWindowAction("restore")}>Restore window</button>
        </div>
        <div className="runtime-compute">
          <label className="field"><span>Compute device</span><select value={computeBackend} onChange={(event) => setComputeBackend(event.target.value as ComputeBackend)}><option value="auto">Automatic (GPU, then CPU)</option><option value="gpu">GPU only</option><option value="cpu">CPU only</option></select></label>
          <button className="button button--primary" onClick={() => void runProbe()} disabled={computeLoading || (computeBackend === "gpu" && gpuStatus?.available === false)}>{computeLoading ? "Running probe…" : "Run compute probe"}</button>
        </div>
        <p className="runtime-muted">Runs a generic vector operation over 50,000 values and reports the actual execution device. It is a capability check, not a performance benchmark.</p>
        {computeError && <p className="runtime-error" role="alert">{computeError}</p>}
        {computeResult && <div className="runtime-result" role="status"><strong>{computeResult.executionBackend.toUpperCase()} completed</strong><span>{computeResult.elements.toLocaleString()} values · {computeResult.elapsedMilliseconds.toFixed(2)} ms · checksum {computeResult.checksum.toLocaleString()}</span>{computeResult.adapterName && <span>Adapter: {computeResult.adapterName}</span>}{computeResult.fallbackReason && <span>CPU fallback: {computeResult.fallbackReason}</span>}</div>}
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading"><span className="panel-icon panel-icon--green"><Icon name="shield" /></span><div><h2>About this app</h2><p>This local learning model is not a Bitcoin node or wallet. No network or real funds.</p></div></div>
        <div className="settings-actions"><button className="button button--secondary" onClick={onReplayOnboarding}>Replay first-run setup</button><span className="version-label">Version 0.1.0 · Local only</span></div>
      </section>
    </div>
  );
}
