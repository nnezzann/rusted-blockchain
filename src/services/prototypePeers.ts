export type PeerDifficulty = "easy" | "standard" | "challenging";

export type PrototypePeer = {
  id: string;
  name: string;
  address: string;
  port: number;
  difficulty: PeerDifficulty;
  chainName: string;
  branchNumber: number;
};

const STORAGE_KEY = "learning-blockchain-prototype-peers";

const initialPeers: PrototypePeer[] = [
  {
    id: "peer-main",
    name: "Peer 1 (Local)",
    address: "127.0.0.1",
    port: 8331,
    difficulty: "easy",
    chainName: "Main chain",
    branchNumber: 0,
  },
  {
    id: "peer-2",
    name: "Peer 2",
    address: "127.0.0.1",
    port: 8332,
    difficulty: "easy",
    chainName: "Independent chain",
    branchNumber: 1,
  },
  {
    id: "peer-3",
    name: "Peer 3",
    address: "127.0.0.1",
    port: 8333,
    difficulty: "standard",
    chainName: "Independent chain",
    branchNumber: 2,
  },
];

export function loadPrototypePeers(): { peers: PrototypePeer[]; error: string | null } {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return { peers: initialPeers, error: null };
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return { peers: initialPeers, error: "Saved peer settings are not a valid list." };
    }
    const peers = parsed.filter(isPrototypePeer);
    if (peers.length !== parsed.length) {
      return { peers, error: "Some saved peer settings were invalid and were not loaded." };
    }
    return { peers, error: null };
  } catch {
    return { peers: initialPeers, error: "Could not read peer settings from this app profile." };
  }
}

export function savePrototypePeers(peers: PrototypePeer[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(peers));
}

function isPrototypePeer(value: unknown): value is PrototypePeer {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "address" in value &&
    typeof value.address === "string" &&
    "port" in value &&
    typeof value.port === "number" &&
    Number.isInteger(value.port) &&
    value.port >= 1 &&
    value.port <= 65535 &&
    "difficulty" in value &&
    (value.difficulty === "easy" || value.difficulty === "standard" || value.difficulty === "challenging") &&
    "chainName" in value &&
    typeof value.chainName === "string" &&
    "branchNumber" in value &&
    typeof value.branchNumber === "number" &&
    Number.isInteger(value.branchNumber) &&
    value.branchNumber >= 0
  );
}
