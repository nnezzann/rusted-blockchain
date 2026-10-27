//! In-process peer-chain simulation with real header mining and propagation.
//!
//! These peers never open sockets. Every simulated node stores its own
//! validated header vector; chain work is comparable because all nodes use
//! the same fixed learning target.

use serde::Serialize;

use super::{
    block::{self, BlockHeader, EASY_LEARNING_BITS, ZERO_HASH},
    chain::{self, ChainValidation},
    hash::{display_hash, sha256d},
    mining,
};

const PEER_MINING_ATTEMPTS: u64 = mining::MAX_MINING_ATTEMPTS;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub chain_name: String,
    pub headers: Vec<BlockHeader>,
    pub payloads: Vec<String>,
    pub base_merkle_roots: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PeerView {
    pub id: String,
    pub name: String,
    pub chain_name: String,
    pub headers: Vec<BlockHeader>,
    pub payloads: Vec<String>,
    pub base_merkle_roots: Vec<String>,
    pub hashes: Vec<Option<String>>,
    pub height: usize,
    pub tip_hash: String,
    pub cumulative_work: u64,
    pub valid: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PeerComparison {
    pub left_id: String,
    pub right_id: String,
    pub left_height: usize,
    pub right_height: usize,
    pub common_height: Option<usize>,
    pub left_cumulative_work: u64,
    pub right_cumulative_work: u64,
    pub preferred_peer_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PropagationResult {
    pub adopted: bool,
    pub source_id: String,
    pub destination_id: String,
    pub source_height: usize,
    pub destination_height: usize,
    pub fork_height: Option<usize>,
    pub reason: String,
}

#[derive(Clone, Debug, Default)]
pub struct PeerNetwork {
    peers: Vec<Peer>,
}

impl PeerNetwork {
    pub fn new() -> Result<Self, String> {
        let genesis = mine_genesis()?;
        let chain = vec![genesis];
        Ok(Self {
            peers: vec![
                Peer {
                    id: "peer-1".into(),
                    name: "Peer 1".into(),
                    chain_name: "Learning chain".into(),
                    headers: chain.clone(),
                    payloads: vec![String::new()],
                    base_merkle_roots: vec![ZERO_HASH.into()],
                },
                Peer {
                    id: "peer-2".into(),
                    name: "Peer 2".into(),
                    chain_name: "Learning chain".into(),
                    headers: chain,
                    payloads: vec![String::new()],
                    base_merkle_roots: vec![ZERO_HASH.into()],
                },
            ],
        })
    }

    pub fn list(&self) -> &[Peer] {
        &self.peers
    }

    pub fn views(&self) -> Result<Vec<PeerView>, String> {
        self.peers.iter().map(peer_view).collect()
    }

    pub fn view(&self, id: &str) -> Result<PeerView, String> {
        peer_view(self.peer(id)?)
    }

    pub fn validate(&self, id: &str) -> Result<ChainValidation, String> {
        let peer = self.peer(id)?;
        let validation = chain::validate(&peer.headers);
        if !validation.valid {
            return Err("Peer chain failed header or proof-of-work validation.".into());
        }
        Ok(validation)
    }

    pub fn create(&mut self, name: String, copy_from: Option<&str>) -> Result<Peer, String> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 48 {
            return Err("Peer name must contain 1 to 48 characters.".into());
        }
        let source = match copy_from {
            Some(id) => self.peer(id)?,
            None => self
                .peers
                .first()
                .ok_or_else(|| "No source peer is available to copy.".to_string())?,
        };
        let peer = Peer {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            chain_name: format!("{} copy", source.chain_name),
            headers: source.headers.clone(),
            payloads: source.payloads.clone(),
            base_merkle_roots: source.base_merkle_roots.clone(),
        };
        self.peers.push(peer.clone());
        Ok(peer)
    }

    pub fn remove(&mut self, id: &str) -> Result<(), String> {
        if self.peers.len() <= 1 {
            return Err("At least one simulated peer must remain.".into());
        }
        let index = self
            .peers
            .iter()
            .position(|peer| peer.id == id)
            .ok_or_else(|| "Peer does not exist.".to_string())?;
        self.peers.remove(index);
        Ok(())
    }

    pub fn mine_next(&mut self, id: &str, leading_zero_nibbles: u8) -> Result<Peer, String> {
        let peer = self.peer(id)?.clone();
        validate_peer(&peer)?;
        let tip = peer
            .headers
            .last()
            .ok_or_else(|| "Peer chain does not have a genesis header.".to_string())?;
        let previous_hash = tip.hash()?;
        let height = peer.headers.len();
        let commitment = sha256d(format!("chain-v-peer:{}:height:{height}", peer.id).as_bytes());
        let header = BlockHeader {
            version: 1,
            previous_hash,
            merkle_root: display_hash(&commitment),
            timestamp: tip.timestamp.saturating_add(1),
            bits: EASY_LEARNING_BITS,
            nonce: 0,
        };
        let mined = mining::mine_with_leading_zeros(
            header,
            PEER_MINING_ATTEMPTS,
            leading_zero_nibbles,
            || false,
            |_| {},
        )?;
        let stored = self
            .peers
            .iter_mut()
            .find(|candidate| candidate.id == id)
            .ok_or_else(|| "Peer no longer exists.".to_string())?;
        stored.headers.push(mined.header.clone());
        stored.payloads.push(String::new());
        stored.base_merkle_roots.push(mined.header.merkle_root);
        Ok(stored.clone())
    }

    pub fn edit_block(
        &mut self,
        id: &str,
        height: usize,
        header: BlockHeader,
        data: String,
    ) -> Result<PeerView, String> {
        let peer = self
            .peers
            .iter_mut()
            .find(|peer| peer.id == id)
            .ok_or_else(|| "Peer does not exist.".to_string())?;
        if height >= peer.headers.len() {
            return Err("Block height is outside this peer's chain.".into());
        }
        if header.bits != EASY_LEARNING_BITS {
            return Err(
                "Peer target is fixed so cumulative-work comparisons remain meaningful.".into(),
            );
        }
        let base_merkle_root = header.merkle_root.clone();
        let committed = block::commit_data(&header, &data)?;
        peer.headers[height] = committed;
        peer.payloads[height] = data;
        peer.base_merkle_roots[height] = base_merkle_root;
        peer_view(peer)
    }

    pub fn remine_from(
        &mut self,
        id: &str,
        height: usize,
        leading_zero_nibbles: u8,
    ) -> Result<PeerView, String> {
        if leading_zero_nibbles > mining::MAX_LEADING_ZERO_NIBBLES {
            return Err(format!(
                "Leading-zero difficulty must be between 0 and {} hexadecimal zeroes.",
                mining::MAX_LEADING_ZERO_NIBBLES
            ));
        }
        let original = self.peer(id)?.clone();
        if height >= original.headers.len() {
            return Err("Block height is outside this peer's chain.".into());
        }
        let previous_hash = if height == 0 {
            ZERO_HASH.to_string()
        } else {
            chain::validate(&original.headers[..height])
                .blocks
                .last()
                .and_then(|block| block.hash.clone())
                .ok_or_else(|| {
                    "Cannot mine this block until its parent chain is valid.".to_string()
                })?
        };
        let mut headers = original.headers.clone();
        let mut next_previous_hash = previous_hash;
        for (index, destination_header) in headers.iter_mut().enumerate().skip(height) {
            let current = &original.headers[index];
            let base_header = BlockHeader {
                previous_hash: next_previous_hash,
                merkle_root: original.base_merkle_roots[index].clone(),
                nonce: 0,
                ..current.clone()
            };
            let committed = block::commit_data(&base_header, &original.payloads[index])?;
            let mined = mining::mine_with_leading_zeros(
                committed,
                PEER_MINING_ATTEMPTS,
                leading_zero_nibbles,
                || false,
                |_| {},
            )?;
            next_previous_hash = mined.hash;
            *destination_header = mined.header;
        }
        let peer = self
            .peers
            .iter_mut()
            .find(|peer| peer.id == id)
            .ok_or_else(|| "Peer no longer exists.".to_string())?;
        peer.headers = headers;
        peer_view(peer)
    }

    pub fn compare(&self, left_id: &str, right_id: &str) -> Result<PeerComparison, String> {
        if left_id == right_id {
            return Err("Choose two different peers to compare.".into());
        }
        let left = self.peer(left_id)?;
        let right = self.peer(right_id)?;
        let left_validation = validate_peer(left)?;
        let right_validation = validate_peer(right)?;
        let common_count = left
            .headers
            .iter()
            .zip(&right.headers)
            .take_while(|(left_header, right_header)| left_header == right_header)
            .count();
        let left_work = cumulative_work(&left_validation);
        let right_work = cumulative_work(&right_validation);
        let preferred_peer_id = match left_work.cmp(&right_work) {
            std::cmp::Ordering::Greater => Some(left.id.clone()),
            std::cmp::Ordering::Less => Some(right.id.clone()),
            std::cmp::Ordering::Equal => None,
        };
        Ok(PeerComparison {
            left_id: left.id.clone(),
            right_id: right.id.clone(),
            left_height: left.headers.len().saturating_sub(1),
            right_height: right.headers.len().saturating_sub(1),
            common_height: (common_count > 0).then_some(common_count - 1),
            left_cumulative_work: left_work,
            right_cumulative_work: right_work,
            preferred_peer_id,
        })
    }

    pub fn propagate(
        &mut self,
        source_id: &str,
        destination_id: &str,
    ) -> Result<PropagationResult, String> {
        if source_id == destination_id {
            return Err("Choose two different peers for propagation.".into());
        }
        let source = self.peer(source_id)?.clone();
        let destination = self.peer(destination_id)?.clone();
        let source_validation = validate_peer(&source)?;
        let destination_validation = validate_peer(&destination)?;
        let source_work = cumulative_work(&source_validation);
        let destination_work = cumulative_work(&destination_validation);
        let fork_height = common_height(&source.headers, &destination.headers);
        let (adopted, reason) = if source_work > destination_work {
            let peer = self
                .peers
                .iter_mut()
                .find(|peer| peer.id == destination_id)
                .ok_or_else(|| "Destination peer no longer exists.".to_string())?;
            peer.headers = source.headers.clone();
            peer.payloads = source.payloads.clone();
            peer.base_merkle_roots = source.base_merkle_roots.clone();
            (
                true,
                "Destination adopted the valid chain with greater cumulative work.".to_string(),
            )
        } else if source_work == destination_work {
            (
                false,
                "Chains have equal cumulative work; the destination kept its current branch."
                    .to_string(),
            )
        } else {
            (
                false,
                "Source chain has less cumulative work; the destination kept its current chain."
                    .to_string(),
            )
        };
        let destination_height = if adopted {
            source.headers.len().saturating_sub(1)
        } else {
            destination.headers.len().saturating_sub(1)
        };
        Ok(PropagationResult {
            adopted,
            source_id: source.id,
            destination_id: destination.id,
            source_height: source.headers.len().saturating_sub(1),
            destination_height,
            fork_height,
            reason,
        })
    }

    fn peer(&self, id: &str) -> Result<&Peer, String> {
        self.peers
            .iter()
            .find(|peer| peer.id == id)
            .ok_or_else(|| "Peer does not exist.".to_string())
    }
}

fn mine_genesis() -> Result<BlockHeader, String> {
    let header = BlockHeader {
        version: 1,
        previous_hash: ZERO_HASH.into(),
        merkle_root: ZERO_HASH.into(),
        timestamp: 1_700_000_000,
        bits: EASY_LEARNING_BITS,
        nonce: 0,
    };
    Ok(mining::mine(header, PEER_MINING_ATTEMPTS, || false, |_| {})?.header)
}

fn validate_peer(peer: &Peer) -> Result<ChainValidation, String> {
    let validation = chain::validate(&peer.headers);
    if !validation.valid {
        return Err(format!("{} has an invalid chain.", peer.name));
    }
    Ok(validation)
}

fn peer_view(peer: &Peer) -> Result<PeerView, String> {
    let validation = chain::validate(&peer.headers);
    let tip_hash = validation
        .blocks
        .last()
        .and_then(|block| block.hash.clone())
        .unwrap_or_default();
    Ok(PeerView {
        id: peer.id.clone(),
        name: peer.name.clone(),
        chain_name: peer.chain_name.clone(),
        headers: peer.headers.clone(),
        payloads: peer.payloads.clone(),
        base_merkle_roots: peer.base_merkle_roots.clone(),
        hashes: validation
            .blocks
            .iter()
            .map(|block| block.hash.clone())
            .collect(),
        height: peer.headers.len().saturating_sub(1),
        tip_hash,
        cumulative_work: cumulative_work(&validation),
        valid: validation.valid,
    })
}

fn cumulative_work(validation: &ChainValidation) -> u64 {
    validation.blocks.iter().filter(|block| block.valid).count() as u64
}

fn common_height(left: &[BlockHeader], right: &[BlockHeader]) -> Option<usize> {
    let common_count = left
        .iter()
        .zip(right)
        .take_while(|(left_header, right_header)| left_header == right_header)
        .count();
    (common_count > 0).then_some(common_count - 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peers_start_from_a_shared_valid_mined_genesis() {
        let network = PeerNetwork::new().unwrap();
        assert_eq!(network.list().len(), 2);
        assert_eq!(network.list()[0].headers, network.list()[1].headers);
        assert!(network.validate("peer-1").unwrap().valid);
    }

    #[test]
    fn independently_mined_forks_are_real_and_choose_more_work() {
        let mut network = PeerNetwork::new().unwrap();
        let left = network.mine_next("peer-1", 0).unwrap();
        let right = network.mine_next("peer-2", 0).unwrap();
        assert_ne!(
            left.headers[1].hash().unwrap(),
            right.headers[1].hash().unwrap()
        );
        assert!(network.validate("peer-1").unwrap().valid);
        assert!(network.validate("peer-2").unwrap().valid);

        let tie = network.compare("peer-1", "peer-2").unwrap();
        assert_eq!(tie.common_height, Some(0));
        assert_eq!(tie.left_cumulative_work, tie.right_cumulative_work);
        assert_eq!(tie.preferred_peer_id, None);

        network.mine_next("peer-1", 0).unwrap();
        let comparison = network.compare("peer-1", "peer-2").unwrap();
        assert_eq!(comparison.preferred_peer_id.as_deref(), Some("peer-1"));
        let result = network.propagate("peer-1", "peer-2").unwrap();
        assert!(result.adopted);
        assert_eq!(network.list()[0].headers, network.list()[1].headers);
        assert_eq!(
            network
                .compare("peer-1", "peer-2")
                .unwrap()
                .preferred_peer_id,
            None
        );
    }

    #[test]
    fn peer_creation_copies_a_chain_and_last_peer_cannot_be_removed() {
        let mut network = PeerNetwork::new().unwrap();
        let copy = network.create("Peer 3".into(), Some("peer-2")).unwrap();
        assert_eq!(copy.headers, network.list()[1].headers);
        assert!(network.remove("peer-1").is_ok());
        assert!(network.remove("peer-2").is_ok());
        assert!(
            network
                .remove(&copy.id)
                .unwrap_err()
                .contains("At least one")
        );
    }

    #[test]
    fn editing_and_reminging_an_individual_peer_block_preserves_isolation() {
        let mut network = PeerNetwork::new().unwrap();
        let first = network.mine_next("peer-1", 0).unwrap();
        network.mine_next("peer-1", 0).unwrap();
        let original_other_tip = network.view("peer-2").unwrap().tip_hash;
        let mut edited = first.headers[1].clone();
        edited.previous_hash =
            "1111111111111111111111111111111111111111111111111111111111111111".into();
        let invalid = network
            .edit_block("peer-1", 1, edited, "editable payload".into())
            .unwrap();
        assert!(!invalid.valid);
        assert_eq!(network.view("peer-2").unwrap().tip_hash, original_other_tip);

        let repaired = network.remine_from("peer-1", 1, 2).unwrap();
        assert!(repaired.valid);
        assert!(repaired.hashes[1].as_deref().unwrap().starts_with("00"));
        assert!(repaired.hashes[2].as_deref().unwrap().starts_with("00"));
        assert_eq!(repaired.payloads[1], "editable payload");
        assert_eq!(network.view("peer-2").unwrap().tip_hash, original_other_tip);
    }

    #[test]
    fn newly_mined_peer_block_obeys_the_selected_prefix_difficulty() {
        let mut network = PeerNetwork::new().unwrap();
        let peer = network.mine_next("peer-1", 2).unwrap();
        assert!(peer.headers[1].hash().unwrap().starts_with("00"));
        assert!(network.validate("peer-1").unwrap().valid);
    }

    #[test]
    fn peer_edit_keeps_the_shared_target_fixed() {
        let mut network = PeerNetwork::new().unwrap();
        let mut header = network.view("peer-1").unwrap().headers[0].clone();
        header.bits = 0x1f00_ffff;
        assert!(
            network
                .edit_block("peer-1", 0, header, String::new())
                .unwrap_err()
                .contains("target is fixed")
        );
    }
}
