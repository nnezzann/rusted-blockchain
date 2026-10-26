import { useState, type FormEvent } from "react";
import { Icon } from "../../components/Icon";
import {
  loadPrototypePeers,
  savePrototypePeers,
  type PeerDifficulty,
  type PrototypePeer,
} from "../../services/prototypePeers";

type PeerDraft = {
  name: string;
  address: string;
  port: string;
  difficulty: PeerDifficulty;
  chainName: string;
};

const newPeerDraft: PeerDraft = {
  name: "",
  address: "127.0.0.1",
  port: "8334",
  difficulty: "easy",
  chainName: "Independent chain",
};

const sharedFingerprints = [
  "00000000…00001a2b",
  "00000000…00007b3c",
];

const branchFingerprints = [
  ["00000000…0000a3f2", "00000000…0000c917", "00000000…0000e8a4"],
  ["00000000…00007c9e", "00000000…00004d21", "00000000…0000b3e7"],
  ["00000000…0000e461", "00000000…00006f9a", "00000000…00009a0c"],
];

function sampleFingerprint(peer: PrototypePeer, height: number) {
  if (height < sharedFingerprints.length) return sharedFingerprints[height] ?? "Sample fingerprint";
  const branch = branchFingerprints[peer.branchNumber];
  return branch?.[height - 2] ?? `DEMO-PEER-${peer.branchNumber + 1}-BLOCK-${height}`;
}

function emptyDraft(peer: PrototypePeer): PeerDraft {
  return {
    name: peer.name,
    address: peer.address,
    port: String(peer.port),
    difficulty: peer.difficulty,
    chainName: peer.chainName,
  };
}

export function PeerNetworkScreen() {
  const [initial] = useState(loadPrototypePeers);
  const [peers, setPeers] = useState(initial.peers);
  const [error, setError] = useState(initial.error ?? "");
  const [view, setView] = useState<"overview" | "compare">("overview");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PeerDraft>(newPeerDraft);
  const [leftId, setLeftId] = useState(initial.peers[0]?.id ?? "");
  const [rightId, setRightId] = useState(initial.peers[1]?.id ?? "");

  const leftPeer = peers.find((peer) => peer.id === leftId) ?? peers[0] ?? null;
  const rightPeer = peers.find((peer) => peer.id === rightId && peer.id !== leftPeer?.id)
    ?? peers.find((peer) => peer.id !== leftPeer?.id)
    ?? null;

  const persist = (nextPeers: PrototypePeer[]) => {
    try {
      savePrototypePeers(nextPeers);
      setPeers(nextPeers);
      setError("");
      return true;
    } catch {
      setError("Peer settings could not be saved in this app profile. Check local storage permissions and try again.");
      return false;
    }
  };

  const startCreate = () => {
    const usedPorts = new Set(peers.map((peer) => peer.port));
    let nextPort = 8331;
    while (nextPort <= 65535 && usedPorts.has(nextPort)) nextPort += 1;
    setDraft({ ...newPeerDraft, name: `Peer ${peers.length + 1}`, port: String(nextPort) });
    setEditingId(null);
    setFormOpen(true);
    setError("");
  };

  const startEdit = (peer: PrototypePeer) => {
    setDraft(emptyDraft(peer));
    setEditingId(peer.id);
    setFormOpen(true);
    setError("");
  };

  const savePeer = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    const address = draft.address.trim();
    const chainName = draft.chainName.trim();
    const port = Number(draft.port);
    if (!name || !address || !chainName || !Number.isInteger(port) || port < 1 || port > 65535) {
      setError("Enter a peer name, address, chain name, and a valid port from 1 to 65535.");
      return;
    }
    if (peers.some((peer) => peer.id !== editingId && peer.address === address && peer.port === port)) {
      setError("Another peer already uses that address and port.");
      return;
    }

    if (editingId) {
      const updated = peers.map((peer) => peer.id === editingId
        ? { ...peer, name, address, port, chainName, difficulty: draft.difficulty }
        : peer);
      if (persist(updated)) setFormOpen(false);
      return;
    }

    const peer: PrototypePeer = {
      id: crypto.randomUUID(),
      name,
      address,
      port,
      chainName,
      difficulty: draft.difficulty,
      branchNumber: Math.max(-1, ...peers.map((item) => item.branchNumber)) + 1,
    };
    if (persist([peer, ...peers])) {
      setFormOpen(false);
      setLeftId(peer.id);
      setRightId(peers[0]?.id ?? "");
    }
  };

  const removePeer = (peer: PrototypePeer) => {
    if (!window.confirm(`Remove ${peer.name} and its prototype settings?`)) return;
    persist(peers.filter((item) => item.id !== peer.id));
    if (editingId === peer.id) setFormOpen(false);
  };

  const resetPeers = () => {
    if (!window.confirm("Reset the peer list to the three example peers?")) return;
    try {
      localStorage.removeItem("learning-blockchain-prototype-peers");
      const reset = loadPrototypePeers();
      setPeers(reset.peers);
      setError(reset.error ?? "");
      setFormOpen(false);
      setLeftId(reset.peers[0]?.id ?? "");
      setRightId(reset.peers[1]?.id ?? "");
    } catch {
      setError("Peer examples could not be reset because app storage is unavailable.");
    }
  };

  const updateDraft = (key: keyof PeerDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: key === "difficulty" ? value as PeerDifficulty : value,
    }));
  };

  return (
    <div className="peer-network">
      <div className="peer-prototype-note" role="note">
        <Icon name="info" size={17} />
        <p><strong>Peer-network prototype.</strong> These are saved example configurations and illustrative chains. No sockets, peer-to-peer traffic, mining, or blockchain validation are running.</p>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <Icon name="info" size={16} /><p>{error}</p>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><Icon name="close" size={15} /></button>
        </div>
      )}

      <div className="peer-toolbar">
        <div className="peer-view-switch" role="group" aria-label="Peer network views">
          <button className={view === "overview" ? "peer-view-switch__active" : ""} aria-pressed={view === "overview"} onClick={() => setView("overview")}><Icon name="network" size={15} /> Overview</button>
          <button className={view === "compare" ? "peer-view-switch__active" : ""} aria-pressed={view === "compare"} onClick={() => setView("compare")}><Icon name="layers" size={15} /> Compare chains</button>
        </div>
        <div className="toolbar-actions">
          <button className="button button--secondary" onClick={resetPeers}><Icon name="refresh" size={15} /> Reset examples</button>
          <button className="button button--primary" onClick={startCreate}><Icon name="plus" size={15} /> Create Peer</button>
        </div>
      </div>

      {formOpen && (
        <form className="panel peer-form" onSubmit={savePeer}>
          <div className="panel-title-row">
            <div><h3>{editingId ? "Configure peer" : "Create a new peer"}</h3><p>Set up an independent example chain. Network fields are illustrative only.</p></div>
            <button type="button" className="icon-button" aria-label="Close peer form" onClick={() => setFormOpen(false)}><Icon name="close" size={16} /></button>
          </div>
          <div className="peer-form-grid">
            <label className="field"><span className="field-label">Peer name</span><input className="text-input" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} required maxLength={48} /></label>
            <label className="field"><span className="field-label">Chain label</span><input className="text-input" value={draft.chainName} onChange={(event) => updateDraft("chainName", event.target.value)} required maxLength={48} /></label>
            <label className="field"><span className="field-label">Example bind address</span><input className="text-input" value={draft.address} onChange={(event) => updateDraft("address", event.target.value)} required maxLength={64} /></label>
            <label className="field"><span className="field-label">Example port</span><input className="text-input" type="number" min="1" max="65535" value={draft.port} onChange={(event) => updateDraft("port", event.target.value)} required /></label>
            <label className="field"><span className="field-label">Learning difficulty</span>
              <select className="text-input" value={draft.difficulty} onChange={(event) => updateDraft("difficulty", event.target.value)}>
                <option value="easy">Low · quick learning demo</option>
                <option value="standard">Standard · more attempts</option>
                <option value="challenging">Challenging · illustrative only</option>
              </select>
            </label>
          </div>
          <div className="peer-form-footer">
            <p>Each peer keeps a separate sample chain. Changing difficulty does not mine or validate it.</p>
            <div className="toolbar-actions">
              <button type="button" className="button button--secondary" onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="submit" className="button button--primary">{editingId ? "Save settings" : "Create peer"}</button>
            </div>
          </div>
        </form>
      )}

      {view === "overview" ? (
        <>
          <div className="peer-summary-grid">
            <div className="peer-summary-card"><span className="peer-summary-icon"><Icon name="network" size={17} /></span><strong>{peers.length}</strong><span>Example peers</span><small>Saved locally · offline</small></div>
            <div className="peer-summary-card"><span className="peer-summary-icon peer-summary-icon--blue"><Icon name="layers" size={17} /></span><strong>{new Set(peers.map((peer) => peer.chainName)).size}</strong><span>Chain labels</span><small>Independent sample copies</small></div>
            <div className="peer-summary-card"><span className="peer-summary-icon peer-summary-icon--warning"><Icon name="info" size={17} /></span><strong>0</strong><span>Connected peers</span><small>No network transport</small></div>
          </div>

          <div className="peer-section-heading"><div><h2>Peers</h2><p>Each example peer has its own settings and illustrative chain.</p></div><button className="text-button" onClick={() => setView("compare")}>Compare chains <Icon name="arrow-right" size={14} /></button></div>

          {peers.length === 0 ? (
            <div className="panel peer-empty"><span className="recent-empty-icon"><Icon name="network" size={19} /></span><h2>No peers configured</h2><p>Create an example peer to explore independent chain copies.</p><button className="button button--primary" onClick={startCreate}><Icon name="plus" size={15} /> Create first peer</button></div>
          ) : (
            <div className="peer-list">
              {peers.map((peer, index) => (
                <article className={`panel peer-card peer-card--tone-${index % 3}`} key={peer.id}>
                  <span className="peer-card-icon"><Icon name="cube" size={19} /></span>
                  <div className="peer-card-main">
                    <div className="peer-card-title"><h3>{peer.name}</h3><span className="peer-offline"><span />Not connected</span></div>
                    <p>{peer.address}:{peer.port} <span>·</span> {peer.chainName}</p>
                    <div className="peer-card-settings"><span>Difficulty: {difficultyLabel(peer.difficulty)}</span><span>Separate sample copy</span></div>
                  </div>
                  <div className="peer-card-metric"><small>Blocks</small><strong>5</strong></div>
                  <div className="peer-card-tip"><small>Tip fingerprint · sample</small><code>{sampleFingerprint(peer, 4)}</code></div>
                  <div className="peer-card-actions">
                    <button className="icon-button" aria-label={`Configure ${peer.name}`} title="Configure peer" onClick={() => startEdit(peer)}><Icon name="settings" size={15} /></button>
                    <button className="icon-button icon-button--danger" aria-label={`Remove ${peer.name}`} title="Remove peer" onClick={() => removePeer(peer)}><Icon name="trash" size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="peer-learning-note">
            <Icon name="book" size={17} />
            <p><strong>Why do tips differ?</strong> Independent miners can find different valid blocks because their candidate data or nonce differs. The resulting block hashes differ too; peers compare valid work, not identical hashes. This prototype illustrates that idea with sample fingerprints only.</p>
          </div>
        </>
      ) : (
        <section className="peer-compare">
          <div className="peer-compare-toolbar">
            <div><h2>Compare independent chains</h2><p>Both examples share a short prefix, then diverge into different sample blocks.</p></div>
            <div className="peer-selectors">
              <label><span className="sr-only">First peer</span><select className="text-input" value={leftPeer?.id ?? ""} onChange={(event) => setLeftId(event.target.value)}>{peers.map((peer) => <option key={peer.id} value={peer.id} disabled={peer.id === rightPeer?.id}>{peer.name}</option>)}</select></label>
              <span className="peer-versus">VS</span>
              <label><span className="sr-only">Second peer</span><select className="text-input" value={rightPeer?.id ?? ""} onChange={(event) => setRightId(event.target.value)}><option value="">Choose a second peer</option>{peers.map((peer) => <option key={peer.id} value={peer.id} disabled={peer.id === leftPeer?.id}>{peer.name}</option>)}</select></label>
            </div>
          </div>

          {leftPeer && rightPeer ? (
            <>
              <div className="peer-chain-comparison">
                <PeerChainColumn peer={leftPeer} side="left" />
                <div className="peer-divergence">
                  <span className="peer-divergence-icon"><Icon name="chain" size={18} /></span>
                  <h3>Independent copies</h3>
                  <p>The sample chains share genesis and block 1. From block 2 onward, their illustrative fingerprints differ.</p>
                  <div className="peer-tip-compare"><small>{leftPeer.name} tip</small><code>{sampleFingerprint(leftPeer, 4)}</code></div>
                  <div className="peer-tip-compare peer-tip-compare--right"><small>{rightPeer.name} tip</small><code>{sampleFingerprint(rightPeer, 4)}</code></div>
                  <span className="sample-pill">SAMPLE ONLY</span>
                </div>
                <PeerChainColumn peer={rightPeer} side="right" />
              </div>
              <div className="notice notice--warning peer-consensus-note"><Icon name="info" size={16} /><p><strong>Different hashes do not by themselves decide the winner.</strong> Real chain selection validates each block and compares cumulative proof of work. These sample chains have not been mined, validated, or ranked.</p></div>
            </>
          ) : (
            <div className="panel peer-empty"><span className="recent-empty-icon"><Icon name="layers" size={19} /></span><h2>Add another peer to compare</h2><p>Chain comparison needs two separately configured example peers.</p><button className="button button--primary" onClick={startCreate}><Icon name="plus" size={15} /> Create peer</button></div>
          )}
        </section>
      )}
    </div>
  );
}

function PeerChainColumn({ peer, side }: { peer: PrototypePeer; side: "left" | "right" }) {
  return (
    <section className={`peer-chain-column peer-chain-column--${side}`}>
      <header className="peer-chain-heading">
        <span className="peer-card-icon"><Icon name="cube" size={17} /></span>
        <div><h3>{peer.name}</h3><p>{peer.address}:{peer.port} · {peer.chainName}</p></div>
        <span className="peer-offline"><span />Sample</span>
      </header>
      <div className="peer-block-list">
        {[4, 3, 2, 1, 0].map((height) => (
          <article className={`peer-block${height < 2 ? " peer-block--shared" : ""}`} key={height}>
            <span className="peer-block-mark"><Icon name={height === 0 ? "layers" : "cube"} size={15} /></span>
            <div className="peer-block-main"><strong>{height === 0 ? "Genesis block" : `Block ${height}`}</strong><code>{sampleFingerprint(peer, height)}</code></div>
            <span className={`peer-block-state${height < 2 ? " peer-block-state--shared" : ""}`}>{height < 2 ? "Shared sample" : "Divergent sample"}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function difficultyLabel(difficulty: PeerDifficulty) {
  switch (difficulty) {
    case "standard":
      return "Standard";
    case "challenging":
      return "Challenging";
    default:
      return "Low";
  }
}
