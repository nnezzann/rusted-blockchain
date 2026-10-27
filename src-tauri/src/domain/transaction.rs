//! Chain-V transaction encoding, demo signatures, and UTXO state transitions.
//!
//! This small educational format uses integer learning units and Ed25519
//! signatures. It is not Bitcoin transaction serialization, Script, or wallet
//! key management. Demo signing keys are ephemeral and must never protect funds.

use std::collections::{BTreeMap, BTreeSet};

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

use super::hash::{display_hash, hex, sha256d};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct OutPoint {
    pub transaction_id: String,
    pub output_index: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TxInput {
    pub previous_output: OutPoint,
    pub public_key: String,
    pub signature: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TxOutput {
    pub value: u64,
    pub recipient: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub version: u32,
    pub inputs: Vec<TxInput>,
    pub outputs: Vec<TxOutput>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UtxoSet {
    pub outputs: BTreeMap<OutPoint, TxOutput>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TransactionValidation {
    pub transaction_id: String,
    pub input_value: u64,
    pub output_value: u64,
    pub fee: u64,
    pub verified_signatures: usize,
}

impl Transaction {
    pub fn new(inputs: Vec<TxInput>, outputs: Vec<TxOutput>) -> Self {
        Self {
            version: 1,
            inputs,
            outputs,
        }
    }

    fn unsigned_bytes(&self) -> Result<Vec<u8>, String> {
        if self.inputs.len() > u32::MAX as usize || self.outputs.len() > u32::MAX as usize {
            return Err("Transaction has too many inputs or outputs.".into());
        }
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&self.version.to_le_bytes());
        bytes.extend_from_slice(&(self.inputs.len() as u32).to_le_bytes());
        for input in &self.inputs {
            bytes.extend_from_slice(&decode_hex::<32>(
                &input.previous_output.transaction_id,
                "Previous transaction ID",
            )?);
            bytes.extend_from_slice(&input.previous_output.output_index.to_le_bytes());
            bytes.extend_from_slice(&decode_hex::<32>(&input.public_key, "Public key")?);
        }
        bytes.extend_from_slice(&(self.outputs.len() as u32).to_le_bytes());
        for output in &self.outputs {
            bytes.extend_from_slice(&output.value.to_le_bytes());
            bytes.extend_from_slice(&decode_hex::<32>(&output.recipient, "Output recipient")?);
        }
        Ok(bytes)
    }

    fn signing_message(&self, input_index: usize) -> Result<Vec<u8>, String> {
        if input_index >= self.inputs.len() {
            return Err("Signature input index is outside the transaction.".into());
        }
        let mut bytes = self.unsigned_bytes()?;
        bytes.extend_from_slice(&(input_index as u32).to_le_bytes());
        Ok(bytes)
    }

    pub fn sign_input(&mut self, input_index: usize, key: &SigningKey) -> Result<(), String> {
        let input = self
            .inputs
            .get(input_index)
            .ok_or_else(|| "Signature input index is outside the transaction.".to_string())?;
        if decode_hex::<32>(&input.public_key, "Public key")? != key.verifying_key().to_bytes() {
            return Err("Signing key does not match the input public key.".into());
        }
        let signature = key.sign(&self.signing_message(input_index)?);
        self.inputs[input_index].signature = hex(&signature.to_bytes());
        Ok(())
    }

    fn serialized_bytes(&self) -> Result<Vec<u8>, String> {
        let mut bytes = self.unsigned_bytes()?;
        for input in &self.inputs {
            bytes.extend_from_slice(&decode_hex::<64>(&input.signature, "Input signature")?);
        }
        Ok(bytes)
    }

    pub fn transaction_id(&self) -> Result<String, String> {
        Ok(display_hash(&sha256d(&self.serialized_bytes()?)))
    }
}

impl UtxoSet {
    pub fn apply_coinbase(
        &mut self,
        transaction: &Transaction,
        maximum_reward: u64,
    ) -> Result<TransactionValidation, String> {
        if !transaction.inputs.is_empty() {
            return Err("Coinbase transactions must not contain spending inputs.".into());
        }
        let output_value = checked_output_value(&transaction.outputs)?;
        if output_value > maximum_reward {
            return Err("Coinbase outputs exceed the permitted learning reward.".into());
        }
        let transaction_id = transaction.transaction_id()?;
        let created = created_outputs(transaction, &transaction_id)?;
        ensure_new_outpoints(&self.outputs, &created)?;
        self.outputs.extend(created);
        Ok(TransactionValidation {
            transaction_id,
            input_value: 0,
            output_value,
            fee: 0,
            verified_signatures: 0,
        })
    }

    pub fn validate(&self, transaction: &Transaction) -> Result<TransactionValidation, String> {
        if transaction.inputs.is_empty() {
            return Err("Use the bounded coinbase path for transactions without inputs.".into());
        }
        if transaction.inputs.len() > u32::MAX as usize {
            return Err("Transaction has too many inputs.".into());
        }
        let output_value = checked_output_value(&transaction.outputs)?;
        let mut input_value = 0u64;
        let mut seen_inputs = BTreeSet::new();
        for (index, input) in transaction.inputs.iter().enumerate() {
            if !seen_inputs.insert(input.previous_output.clone()) {
                return Err("Transaction spends the same output more than once.".into());
            }
            let previous = self.outputs.get(&input.previous_output).ok_or_else(|| {
                "Transaction input does not reference an unspent output.".to_string()
            })?;
            if decode_hex::<32>(&input.public_key, "Public key")?
                != decode_hex::<32>(&previous.recipient, "UTXO owner")?
            {
                return Err("Input public key does not own the referenced output.".into());
            }
            let verifying_key =
                VerifyingKey::from_bytes(&decode_hex::<32>(&input.public_key, "Public key")?)
                    .map_err(|_| "Input public key is invalid.".to_string())?;
            let signature =
                Signature::from_slice(&decode_hex::<64>(&input.signature, "Input signature")?)
                    .map_err(|_| "Input signature is invalid.".to_string())?;
            verifying_key
                .verify(&transaction.signing_message(index)?, &signature)
                .map_err(|_| "Input signature verification failed.".to_string())?;
            input_value = input_value
                .checked_add(previous.value)
                .ok_or_else(|| "Input value exceeds the supported integer range.".to_string())?;
        }
        if input_value < output_value {
            return Err("Transaction outputs exceed the value of its inputs.".into());
        }
        let transaction_id = transaction.transaction_id()?;
        let fee = input_value - output_value;
        let created = created_outputs(transaction, &transaction_id)?;
        ensure_new_outpoints(&self.outputs, &created)?;
        Ok(TransactionValidation {
            transaction_id,
            input_value,
            output_value,
            fee,
            verified_signatures: transaction.inputs.len(),
        })
    }

    pub fn apply(&mut self, transaction: &Transaction) -> Result<TransactionValidation, String> {
        let validation = self.validate(transaction)?;
        let created = created_outputs(transaction, &validation.transaction_id)?;
        let mut next = self.outputs.clone();
        for input in &transaction.inputs {
            next.remove(&input.previous_output);
        }
        ensure_new_outpoints(&next, &created)?;
        next.extend(created);
        self.outputs = next;
        Ok(validation)
    }
}

fn checked_output_value(outputs: &[TxOutput]) -> Result<u64, String> {
    if outputs.is_empty() {
        return Err("Transaction must create at least one output.".into());
    }
    outputs.iter().try_fold(0u64, |total, output| {
        if output.value == 0 {
            return Err("Transaction output values must be greater than zero.".into());
        }
        decode_hex::<32>(&output.recipient, "Output recipient")?;
        total
            .checked_add(output.value)
            .ok_or_else(|| "Output value exceeds the supported integer range.".to_string())
    })
}

fn created_outputs(
    transaction: &Transaction,
    transaction_id: &str,
) -> Result<BTreeMap<OutPoint, TxOutput>, String> {
    transaction
        .outputs
        .iter()
        .enumerate()
        .map(|(index, output)| {
            let output_index = u32::try_from(index)
                .map_err(|_| "Transaction has too many outputs.".to_string())?;
            Ok((
                OutPoint {
                    transaction_id: transaction_id.to_string(),
                    output_index,
                },
                output.clone(),
            ))
        })
        .collect()
}

fn ensure_new_outpoints(
    existing: &BTreeMap<OutPoint, TxOutput>,
    created: &BTreeMap<OutPoint, TxOutput>,
) -> Result<(), String> {
    if created
        .keys()
        .any(|outpoint| existing.contains_key(outpoint))
    {
        return Err("Transaction would overwrite an existing unspent output.".into());
    }
    Ok(())
}

fn decode_hex<const N: usize>(value: &str, description: &str) -> Result<[u8; N], String> {
    if value.len() != N * 2 {
        return Err(format!(
            "{description} must contain exactly {} hexadecimal characters.",
            N * 2
        ));
    }
    let (pairs, _) = value.as_bytes().as_chunks::<2>();
    let mut output = [0; N];
    for (byte, pair) in output.iter_mut().zip(pairs) {
        *byte = (hex_nibble(pair[0])
            .ok_or_else(|| format!("{description} must be hexadecimal."))?
            << 4)
            | hex_nibble(pair[1]).ok_or_else(|| format!("{description} must be hexadecimal."))?;
    }
    Ok(output)
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    fn funded_set(owner: &SigningKey) -> (UtxoSet, OutPoint) {
        let mut set = UtxoSet::default();
        let reward = Transaction::new(
            vec![],
            vec![TxOutput {
                value: 100,
                recipient: hex(&owner.verifying_key().to_bytes()),
            }],
        );
        let result = set.apply_coinbase(&reward, 100).unwrap();
        let outpoint = OutPoint {
            transaction_id: result.transaction_id,
            output_index: 0,
        };
        (set, outpoint)
    }

    fn signed_spend(
        owner: &SigningKey,
        outpoint: OutPoint,
        recipient: &SigningKey,
        value: u64,
    ) -> Transaction {
        let mut transaction = Transaction::new(
            vec![TxInput {
                previous_output: outpoint,
                public_key: hex(&owner.verifying_key().to_bytes()),
                signature: String::new(),
            }],
            vec![
                TxOutput {
                    value,
                    recipient: hex(&recipient.verifying_key().to_bytes()),
                },
                TxOutput {
                    value: 100 - value - 5,
                    recipient: hex(&owner.verifying_key().to_bytes()),
                },
            ],
        );
        transaction.sign_input(0, owner).unwrap();
        transaction
    }

    #[test]
    fn verifies_signature_conserves_value_and_atomically_spends_utxos() {
        let owner = key(7);
        let recipient = key(8);
        let (mut set, outpoint) = funded_set(&owner);
        let transaction = signed_spend(&owner, outpoint.clone(), &recipient, 60);
        let validation = set.validate(&transaction).unwrap();
        assert_eq!(validation.input_value, 100);
        assert_eq!(validation.output_value, 95);
        assert_eq!(validation.fee, 5);
        assert_eq!(validation.verified_signatures, 1);
        let applied = set.apply(&transaction).unwrap();
        assert_eq!(applied.transaction_id, validation.transaction_id);
        assert!(!set.outputs.contains_key(&outpoint));
        assert_eq!(set.outputs.len(), 2);
    }

    #[test]
    fn rejects_tampered_signature_without_mutating_the_utxo_set() {
        let owner = key(7);
        let recipient = key(8);
        let (mut set, outpoint) = funded_set(&owner);
        let mut transaction = signed_spend(&owner, outpoint.clone(), &recipient, 60);
        transaction.outputs[0].value += 1;
        let before = set.clone();
        assert!(set.apply(&transaction).unwrap_err().contains("signature"));
        assert_eq!(set, before);
    }

    #[test]
    fn rejects_duplicate_missing_and_overspent_inputs() {
        let owner = key(7);
        let recipient = key(8);
        let (set, outpoint) = funded_set(&owner);
        let mut duplicate = Transaction::new(
            vec![
                TxInput {
                    previous_output: outpoint.clone(),
                    public_key: hex(&owner.verifying_key().to_bytes()),
                    signature: String::new(),
                },
                TxInput {
                    previous_output: outpoint.clone(),
                    public_key: hex(&owner.verifying_key().to_bytes()),
                    signature: String::new(),
                },
            ],
            vec![TxOutput {
                value: 1,
                recipient: hex(&recipient.verifying_key().to_bytes()),
            }],
        );
        duplicate.sign_input(0, &owner).unwrap();
        duplicate.sign_input(1, &owner).unwrap();
        assert!(
            set.validate(&duplicate)
                .unwrap_err()
                .contains("more than once")
        );

        let mut overspend = signed_spend(&owner, outpoint.clone(), &recipient, 90);
        overspend.outputs[1].value = 15;
        overspend.sign_input(0, &owner).unwrap();
        assert!(set.validate(&overspend).unwrap_err().contains("exceed"));

        let mut missing = signed_spend(
            &owner,
            OutPoint {
                transaction_id: "ff".repeat(32),
                output_index: 0,
            },
            &recipient,
            10,
        );
        missing.sign_input(0, &owner).unwrap();
        assert!(set.validate(&missing).unwrap_err().contains("unspent"));
    }

    #[test]
    fn coinbase_is_bounded_and_adds_a_spendable_output() {
        let owner = key(7);
        let mut set = UtxoSet::default();
        let reward = Transaction::new(
            vec![],
            vec![TxOutput {
                value: 51,
                recipient: hex(&owner.verifying_key().to_bytes()),
            }],
        );
        assert!(set.apply_coinbase(&reward, 50).is_err());
        assert!(set.outputs.is_empty());
        let valid = Transaction::new(
            vec![],
            vec![TxOutput {
                value: 50,
                recipient: hex(&owner.verifying_key().to_bytes()),
            }],
        );
        assert_eq!(set.apply_coinbase(&valid, 50).unwrap().output_value, 50);
        assert_eq!(set.outputs.len(), 1);
    }

    #[test]
    fn rejects_malformed_unicode_keys_without_panicking() {
        assert!(decode_hex::<32>(&format!("{}é", "0".repeat(62)), "key").is_err());
    }
}
