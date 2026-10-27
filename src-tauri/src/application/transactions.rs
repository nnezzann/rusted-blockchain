//! Transaction lesson use cases and ephemeral signer orchestration.
//!
//! Each demo run constructs a fresh coinbase-funded UTXO, signs one spend with
//! a random in-memory Ed25519 key, applies it, and returns inspectable values.
//! Neither keys nor ledger state are persisted.

use ed25519_dalek::SigningKey;
use rand_core::OsRng;
use serde::Serialize;

use crate::domain::{
    hash::hex,
    transaction::{OutPoint, Transaction, TransactionValidation, TxInput, TxOutput, UtxoSet},
};

pub const LEARNING_COINBASE_REWARD: u64 = 50_000_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDemo {
    pub coinbase_transaction_id: String,
    pub transaction: Transaction,
    pub validation: TransactionValidation,
    pub remaining_utxos: Vec<DemoUtxo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoUtxo {
    pub outpoint: OutPoint,
    pub output: TxOutput,
}

pub fn run_demo(amount: u64, fee: u64) -> Result<TransactionDemo, String> {
    let spend_total = amount
        .checked_add(fee)
        .ok_or_else(|| "Amount and fee exceed the supported integer range.".to_string())?;
    if amount == 0 || spend_total > LEARNING_COINBASE_REWARD {
        return Err(format!(
            "Choose a positive amount and fee totaling no more than {LEARNING_COINBASE_REWARD} learning units."
        ));
    }

    let sender = SigningKey::generate(&mut OsRng);
    let recipient = SigningKey::generate(&mut OsRng);
    let sender_public_key = hex(&sender.verifying_key().to_bytes());
    let recipient_public_key = hex(&recipient.verifying_key().to_bytes());

    let coinbase = Transaction::new(
        vec![],
        vec![TxOutput {
            value: LEARNING_COINBASE_REWARD,
            recipient: sender_public_key.clone(),
        }],
    );
    let mut utxos = UtxoSet::default();
    let coinbase_result = utxos.apply_coinbase(&coinbase, LEARNING_COINBASE_REWARD)?;
    let input_outpoint = OutPoint {
        transaction_id: coinbase_result.transaction_id.clone(),
        output_index: 0,
    };

    let change = LEARNING_COINBASE_REWARD - spend_total;
    let mut outputs = vec![TxOutput {
        value: amount,
        recipient: recipient_public_key,
    }];
    if change > 0 {
        outputs.push(TxOutput {
            value: change,
            recipient: sender_public_key.clone(),
        });
    }
    let mut transaction = Transaction::new(
        vec![TxInput {
            previous_output: input_outpoint,
            public_key: sender_public_key,
            signature: String::new(),
        }],
        outputs,
    );
    transaction.sign_input(0, &sender)?;
    let validation = utxos.apply(&transaction)?;
    let remaining_utxos = utxos
        .outputs
        .into_iter()
        .map(|(outpoint, output)| DemoUtxo { outpoint, output })
        .collect();

    Ok(TransactionDemo {
        coinbase_transaction_id: coinbase_result.transaction_id,
        transaction,
        validation,
        remaining_utxos,
    })
}
