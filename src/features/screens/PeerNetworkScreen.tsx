import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "../../components/Icon";
import {
  comparePeerChains,
  createPeer,
  errorMessage,
  listPeers,
  minePeerBlock,
  propagatePeerChain,
  removePeer,
  type PeerComparison,
  type PeerPropagation,
  type PeerView,
} from "../../services/nativeRuntime";

export function PeerNetworkScreen() {
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [comparison, setComparison] = useState<PeerComparison | null>(null);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [view, setView] = useState<"overview" | "compare">("overview");
  const [formOpen, setFormOpen] = useState(false);
  const [peerName, setPeerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastAction, setLastAction] = useState<PeerPropagation | null>(null);

  const refreshPeers = async () => {
    try {
      const current = await listPeers();
      setPeers(current);
      const selectedLeft = current.some((peer) => peer.id === leftId) ? leftId : current[0]?.id ?? "";
      setLeftId(selectedLeft);
      setRightId((selected) => current.some((peer) => peer.id === selected) && selected !== selectedLeft
        ? selected
        : current.find((peer) => peer.id !== selectedLeft)?.id ?? "");
      setError("");
    } catch (reason) {
      setError(`Could not load simulated peers: ${errorMessage(reason)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshPeers();
  }, []);

  useEffect(() => {
    if (!leftId || !rightId || leftId === rightId) {
      setComparison(null);
      return;
    }
    let active = true;
    setComparison(null);
    void comparePeerChains(leftId, rightId)
      .then((result) => {
        if (active) setComparison(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(`Could not compare chains: ${errorMessage(reason)}`);
      });
    return () => {
      active = false;
    };
  }, [leftId, rightId, peers]);

  const leftPeer = peers.find((peer) => peer.id === leftId) ?? null;
  const rightPeer = peers.find((peer) => peer.id === rightId && peer.id !== leftId) ?? null;

  const runPeerAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setLastAction(null);
    try {
      await action();
      await refreshPeers();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const submitPeer = async (event: FormEvent) => {
    event.preventDefault();
    const name = peerName.trim();
    if (!name) {
      setError("Enter a name for the peer.");
      return;
    }
    const source = leftPeer ?? peers[0];
    if (!source) {
      setError("No source peer is available to copy.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await createPeer(name, source.id);
      const current = await listPeers();
      setPeers(current);
      setLeftId(created.id);
      setRightId(source.id);
      setPeerName("");
      setFormOpen(false);
    } catch (reason) {
      setError(`Could not create peer: ${errorMessage(reason)}`);
    } finally {
      setBusy(false);
    }
  };

  const deletePeer = async (peer: PeerView) => {
    if (!window.confirm(`Remove ${peer.name} and its in-memory chain copy?`)) return;
    await runPeerAction(async () => {
      const current = await removePeer(peer.id);
      setPeers(current);
    });
  };

  const propagate = async (source: PeerView, destination: PeerView) => {
    setBusy(true);
    setError("");
    try {
      setLastAction(await propagatePeerChain(source.id, destination.id));
      setPeers(await listPeers());
    } catch (reason) {
      setError(`Could not propagate chain: ${errorMessage(reason)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="peer-network">
      <div className="peer-prototype-note" role="note">
        <Icon name="info" size={17} />
        <p><strong>In-process peer simulation.</strong> Rust keeps independent validated header chains, mines real proof-of-work blocks, and manually propagates the greater-work chain. No sockets or external peers are used; peer state resets when the app restarts.</p>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <Icon name="info" size={16} /><p>{error}</p>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><Icon name="close" size={15} /></button>
        </div>
      )}
      {lastAction && <div className={`notice ${lastAction.adopted ? "notice--info" : "notice--warning"}`} role="status"><Icon name="info" size={16} /><p>{lastAction.reason} Fork point: {lastAction.forkHeight === null ? "none" : `block ${lastAction.forkHeight}`}.</p></div>}

      <div className="peer-toolbar">
        <div className="peer-view-switch" role="group" aria-label="Peer network views">
          <button className={view === "overview" ? "peer-view-switch__active" : ""} aria-pressed={view === "overview"} onClick={() => setView("overview")}><Icon name="network" size={15} /> Overview</button>
          <button className={view === "compare" ? "peer-view-switch__active" : ""} aria-pressed={view === "compare"} onClick={() => setView("compare")}><Icon name="layers" size={15} /> Compare chains</button>
        </div>
        <div className="toolbar-actions">
          <button className="button button--secondary" disabled={loading || busy} onClick={() => void refreshPeers()}><Icon name="refresh" size={15} /> Refresh</button>
          <button className="button button--primary" disabled={busy || loading} onClick={() => { setPeerName(`Peer ${peers.length + 1}`); setFormOpen(true); }}><Icon name="plus" size={15} /> Create Peer</button>
        </div>
      </div>

      {formOpen && (
        <form className="panel peer-form" onSubmit={(event) => void submitPeer(event)}>
          <div className="panel-title-row">
            <div><h3>Create an independent peer</h3><p>It starts as a copy of the selected peer, then can mine its own branch.</p></div>
            <button type="button" className="icon-button" aria-label="Close peer form" onClick={() => setFormOpen(false)}><Icon name="close" size={16} /></button>
          </div>
          <div className="peer-form-grid">
            <label className="field"><span className="field-label">Peer name</span><input className="text-input" value={peerName} onChange={(event) => setPeerName(event.target.value)} required maxLength={48} /></label>
            <div className="field"><span className="field-label">Starting chain</span><span className="text-input">{leftPeer?.name ?? peers[0]?.name ?? "No peers available"}</span></div>
          </div>
          <div className="peer-form-footer">
            <p>All peers use the same easy target so cumulative work is directly comparable.</p>
            <div className="toolbar-actions"><button type="button" className="button button--secondary" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="button button--primary" disabled={busy}>Create peer</button></div>
          </div>
        </form>
      )}

      {loading ? <div className="panel lab-panel" role="status">Loading Rust peer chains…</div> : view === "overview" ? (
        <>
          <div className="peer-summary-grid">
            <div className="peer-summary-card"><span className="peer-summary-icon"><Icon name="network" size={17} /></span><strong>{peers.length}</strong><span>Simulated peers</span><small>Rust memory · offline</small></div>
            <div className="peer-summary-card"><span className="peer-summary-icon peer-summary-icon--blue"><Icon name="layers" size={17} /></span><strong>{new Set(peers.map((peer) => peer.tipHash)).size}</strong><span>Distinct chain tips</span><small>Independently mined hashes</small></div>
            <div className="peer-summary-card"><span className="peer-summary-icon peer-summary-icon--warning"><Icon name="info" size={17} /></span><strong>0</strong><span>Network connections</span><small>No sockets or P2P traffic</small></div>
          </div>

          <div className="peer-section-heading"><div><h2>Peers</h2><p>Each peer stores and validates its own header chain.</p></div><button className="text-button" onClick={() => setView("compare")}>Compare chains <Icon name="arrow-right" size={14} /></button></div>
          {peers.length === 0 ? (
            <div className="panel peer-empty"><span className="recent-empty-icon"><Icon name="network" size={19} /></span><h2>No peers configured</h2><p>Create a peer to begin a local fork simulation.</p><button className="button button--primary" onClick={() => setFormOpen(true)}><Icon name="plus" size={15} /> Create first peer</button></div>
          ) : (
            <div className="peer-list">
              {peers.map((peer, index) => (
                <article className={`panel peer-card peer-card--tone-${index % 3}`} key={peer.id}>
                  <span className="peer-card-icon"><Icon name="cube" size={19} /></span>
                  <div className="peer-card-main">
                    <div className="peer-card-title"><h3>{peer.name}</h3><span className="peer-offline"><span />{peer.valid ? "Validated" : "Invalid chain"}</span></div>
                    <p>{peer.chainName} <span>·</span> height {peer.height}</p>
                    <div className="peer-card-settings"><span>Cumulative work: {peer.cumulativeWork} units</span><span>Target 0x207fffff</span></div>
                  </div>
                  <div className="peer-card-metric"><small>Blocks</small><strong>{peer.headers.length}</strong></div>
                  <div className="peer-card-tip"><small>Tip hash · Rust</small><code>{peer.tipHash}</code></div>
                  <div className="peer-card-actions">
                    <button className="button button--secondary" disabled={busy || !peer.valid} onClick={() => void runPeerAction(async () => { await minePeerBlock(peer.id); })}><Icon name="pickaxe" size={14} /> Mine block</button>
                    <button className="icon-button icon-button--danger" aria-label={`Remove ${peer.name}`} title="Remove peer" disabled={busy || peers.length <= 1} onClick={() => void deletePeer(peer)}><Icon name="trash" size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="peer-learning-note">
            <Icon name="book" size={17} />
            <p><strong>Explore a fork:</strong> mine one block on two peers from the same tip. Each block contains a distinct commitment and a valid nonce, so both branches can be valid while their hashes differ. Mine an extra block on one branch, then manually propagate it to demonstrate greater cumulative work.</p>
          </div>
        </>
      ) : (
        <section className="peer-compare">
          <div className="peer-compare-toolbar">
            <div><h2>Compare independent chains</h2><p>Common ancestors, actual header hashes, and cumulative work are computed in Rust.</p></div>
            <div className="peer-selectors">
              <label><span className="sr-only">First peer</span><select className="text-input" value={leftPeer?.id ?? ""} onChange={(event) => setLeftId(event.target.value)}>{peers.map((peer) => <option key={peer.id} value={peer.id} disabled={peer.id === rightPeer?.id}>{peer.name}</option>)}</select></label>
              <span className="peer-versus">VS</span>
              <label><span className="sr-only">Second peer</span><select className="text-input" value={rightPeer?.id ?? ""} onChange={(event) => setRightId(event.target.value)}><option value="">Choose a second peer</option>{peers.map((peer) => <option key={peer.id} value={peer.id} disabled={peer.id === leftPeer?.id}>{peer.name}</option>)}</select></label>
            </div>
          </div>
          {leftPeer && rightPeer && comparison ? (
            <>
              <div className="peer-chain-comparison">
                <PeerChainColumn peer={leftPeer} side="left" commonHeight={comparison.commonHeight} />
                <div className="peer-divergence">
                  <span className="peer-divergence-icon"><Icon name="chain" size={18} /></span>
                  <h3>{comparison.preferredPeerId
                    ? "More cumulative work"
                    : comparison.leftHeight === comparison.rightHeight && comparison.commonHeight === comparison.leftHeight
                      ? "Identical chains"
                      : comparison.commonHeight === Math.min(comparison.leftHeight, comparison.rightHeight)
                        ? "One chain extends the other"
                        : "Equal work · fork remains"}</h3>
                  <p>{comparison.commonHeight === null ? "No common block was found." : `Shared through block ${comparison.commonHeight}; later blocks form independent branches.`}</p>
                  <div className="peer-tip-compare"><small>{leftPeer.name} · work {comparison.leftCumulativeWork}</small><code>{leftPeer.tipHash}</code></div>
                  <div className="peer-tip-compare peer-tip-compare--right"><small>{rightPeer.name} · work {comparison.rightCumulativeWork}</small><code>{rightPeer.tipHash}</code></div>
                  {comparison.preferredPeerId && <span className="sample-pill">Preferred: {peers.find((peer) => peer.id === comparison.preferredPeerId)?.name}</span>}
                  <div className="peer-propagation-actions">
                    <button className="button button--secondary" disabled={busy} onClick={() => void propagate(leftPeer, rightPeer)}>Propagate →</button>
                    <button className="button button--secondary" disabled={busy} onClick={() => void propagate(rightPeer, leftPeer)}>← Propagate</button>
                  </div>
                </div>
                <PeerChainColumn peer={rightPeer} side="right" commonHeight={comparison.commonHeight} />
              </div>
              <div className="notice notice--warning peer-consensus-note"><Icon name="info" size={16} /><p><strong>Simulation boundary.</strong> All chains use one fixed easy target, so work units equal the count of valid headers. Real Bitcoin uses target-weighted cumulative work and network consensus; this app has no transport.</p></div>
            </>
          ) : (
            <div className="panel peer-empty"><span className="recent-empty-icon"><Icon name="layers" size={19} /></span><h2>Add another peer to compare</h2><p>At least two simulated peers are needed to compare chains.</p><button className="button button--primary" onClick={() => { setPeerName(`Peer ${peers.length + 1}`); setFormOpen(true); }}><Icon name="plus" size={15} /> Create peer</button></div>
          )}
        </section>
      )}
    </div>
  );
}

function PeerChainColumn({
  peer,
  side,
  commonHeight,
}: {
  peer: PeerView;
  side: "left" | "right";
  commonHeight: number | null;
}) {
  return (
    <section className={`peer-chain-column peer-chain-column--${side}`}>
      <header className="peer-chain-heading">
        <span className="peer-card-icon"><Icon name="cube" size={17} /></span>
        <div><h3>{peer.name}</h3><p>{peer.chainName} · cumulative work {peer.cumulativeWork}</p></div>
        <span className="peer-offline"><span />{peer.valid ? "Valid" : "Invalid"}</span>
      </header>
      <div className="peer-block-list">
        {peer.headers.map((_, height) => {
          const shared = commonHeight !== null && height <= commonHeight;
          return (
            <article className={`peer-block${shared ? " peer-block--shared" : ""}`} key={`${peer.id}-${height}`}>
              <span className="peer-block-mark"><Icon name={height === 0 ? "layers" : "cube"} size={15} /></span>
              <div className="peer-block-main"><strong>{height === 0 ? "Genesis block" : `Block ${height}`}</strong><code>{peer.hashes[height] ?? "Hash unavailable"}</code></div>
              <span className={`peer-block-state${shared ? " peer-block-state--shared" : ""}`}>{shared ? "Shared block" : "Fork block"}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
