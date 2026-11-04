use anchor_lang::{AccountDeserialize, InstructionData};
use creator_registry::instruction::{Register, UpdateMetadata, UpdatePayout};
use creator_tipping::instruction::Tip;
use solana_program_test::{processor, BanksClientError, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::{Account, AccountSharedData},
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program_stubs::{set_syscall_stubs, SyscallStubs},
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    transaction::Transaction,
};
use std::sync::{Mutex, Once};

static PREVIOUS_STUBS: Mutex<Option<Box<dyn SyscallStubs>>> = Mutex::new(None);
static EVENT_BYTES: Mutex<Vec<Vec<u8>>> = Mutex::new(Vec::new());

fn with_previous<T>(call: impl FnOnce(&dyn SyscallStubs) -> T) -> T {
    let guard = PREVIOUS_STUBS.lock().expect("event log");
    let previous = guard.as_ref().expect("syscall stubs");
    call(previous.as_ref())
}

struct CapturingStubs;

impl SyscallStubs for CapturingStubs {
    fn sol_log(&self, message: &str) {
        with_previous(|inner| inner.sol_log(message));
    }

    fn sol_invoke_signed(
        &self,
        instruction: &Instruction,
        account_infos: &[AccountInfo],
        signers_seeds: &[&[&[u8]]],
    ) -> ProgramResult {
        with_previous(|inner| inner.sol_invoke_signed(instruction, account_infos, signers_seeds))
    }

    fn sol_get_clock_sysvar(&self, var_addr: *mut u8) -> u64 {
        with_previous(|inner| inner.sol_get_clock_sysvar(var_addr))
    }

    fn sol_get_epoch_schedule_sysvar(&self, var_addr: *mut u8) -> u64 {
        with_previous(|inner| inner.sol_get_epoch_schedule_sysvar(var_addr))
    }

    fn sol_get_epoch_rewards_sysvar(&self, var_addr: *mut u8) -> u64 {
        with_previous(|inner| inner.sol_get_epoch_rewards_sysvar(var_addr))
    }

    fn sol_get_fees_sysvar(&self, var_addr: *mut u8) -> u64 {
        with_previous(|inner| inner.sol_get_fees_sysvar(var_addr))
    }

    fn sol_get_rent_sysvar(&self, var_addr: *mut u8) -> u64 {
        with_previous(|inner| inner.sol_get_rent_sysvar(var_addr))
    }

    fn sol_get_last_restart_slot(&self, var_addr: *mut u8) -> u64 {
        with_previous(|inner| inner.sol_get_last_restart_slot(var_addr))
    }

    fn sol_get_return_data(&self) -> Option<(Pubkey, Vec<u8>)> {
        with_previous(|inner| inner.sol_get_return_data())
    }

    fn sol_set_return_data(&self, data: &[u8]) {
        with_previous(|inner| inner.sol_set_return_data(data));
    }

    fn sol_get_stack_height(&self) -> u64 {
        with_previous(|inner| inner.sol_get_stack_height())
    }

    fn sol_log_data(&self, fields: &[&[u8]]) {
        let mut bytes = Vec::new();
        for field in fields {
            bytes.extend_from_slice(field);
        }
        EVENT_BYTES.lock().expect("event log").push(bytes);
        with_previous(|inner| inner.sol_log_data(fields));
    }
}

fn install_event_capture() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let previous = set_syscall_stubs(Box::new(CapturingStubs));
        *PREVIOUS_STUBS.lock().expect("event log") = Some(previous);
    });
}

/// Anchor's generated `entry` requires one lifetime for both the account slice and each
/// `AccountInfo`. `solana-program-test` passes those lifetimes independently. The values
/// are the same borrow for the duration of the call.
fn registry_entry(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let accounts: &[AccountInfo] = unsafe { std::mem::transmute(accounts) };
    creator_registry::entry(program_id, accounts, data)
}

fn tipping_entry(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let accounts: &[AccountInfo] = unsafe { std::mem::transmute(accounts) };
    creator_tipping::entry(program_id, accounts, data)
}

fn creator_pda(authority: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[creator_registry::CreatorAccount::SEED, authority.as_ref()], &creator_registry::ID)
}

fn register_ix(authority: Pubkey, uri: String, payout: Option<Pubkey>) -> Instruction {
    let (creator, _) = creator_pda(&authority);
    Instruction {
        program_id: creator_registry::ID,
        accounts: vec![
            AccountMeta::new(authority, true),
            AccountMeta::new(creator, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: Register { metadata_uri: uri, payout }.data(),
    }
}

fn update_metadata_ix(authority: Pubkey, uri: String) -> Instruction {
    let (creator, _) = creator_pda(&authority);
    Instruction {
        program_id: creator_registry::ID,
        accounts: vec![
            AccountMeta::new_readonly(authority, true),
            AccountMeta::new(creator, false),
        ],
        data: UpdateMetadata { metadata_uri: uri }.data(),
    }
}

fn update_payout_ix(authority: Pubkey, payout: Pubkey) -> Instruction {
    let (creator, _) = creator_pda(&authority);
    Instruction {
        program_id: creator_registry::ID,
        accounts: vec![
            AccountMeta::new_readonly(authority, true),
            AccountMeta::new(creator, false),
        ],
        data: UpdatePayout { payout }.data(),
    }
}

fn tip_ix(sender: Pubkey, creator_authority: Pubkey, payout: Pubkey, amount: u64) -> Instruction {
    let (creator, _) = creator_pda(&creator_authority);
    Instruction {
        program_id: creator_tipping::ID,
        accounts: vec![
            AccountMeta::new(sender, true),
            AccountMeta::new(payout, false),
            AccountMeta::new_readonly(creator, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: Tip { amount }.data(),
    }
}

async fn context() -> ProgramTestContext {
    let mut test = ProgramTest::new("creator_registry", creator_registry::ID, processor!(registry_entry));
    test.add_program("creator_tipping", creator_tipping::ID, processor!(tipping_entry));
    let context = test.start_with_context().await;
    install_event_capture();
    context
}

async fn send(context: &mut ProgramTestContext, instructions: &[Instruction], signers: &[&Keypair]) -> Result<(), BanksClientError> {
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let mut transaction = Transaction::new_with_payer(instructions, Some(&context.payer.pubkey()));
    let mut keys = vec![&context.payer];
    for signer in signers {
        if signer.pubkey() != context.payer.pubkey() {
            keys.push(signer);
        }
    }
    transaction.sign(&keys, blockhash);
    context.banks_client.process_transaction(transaction).await
}

async fn lamports(context: &mut ProgramTestContext, account: &Pubkey) -> u64 {
    context.banks_client.get_account(*account).await.unwrap().map(|account| account.lamports).unwrap_or(0)
}

fn tip_event(bytes: &[u8], sender: &Pubkey, payout: &Pubkey, amount: u64) -> bool {
    if bytes.len() < 112 {
        return false;
    }
    let found = u64::from_le_bytes(bytes[104..112].try_into().expect("amount"));
    found == amount && bytes[8..40] == sender.to_bytes() && bytes[72..104] == payout.to_bytes()
}

fn fund(_pubkey: Pubkey) -> AccountSharedData {
    AccountSharedData::from(Account {
        lamports: 5_000_000_000,
        data: vec![],
        owner: system_program::ID,
        executable: false,
        rent_epoch: 0,
    })
}

#[tokio::test]
async fn registers_one_creator_per_wallet_and_rejects_duplicates() {
    let mut context = context().await;
    let authority = context.payer.pubkey();
    let (pda, bump) = creator_pda(&authority);
    send(&mut context, &[register_ix(authority, "ipfs://alice".into(), None)], &[]).await.unwrap();
    let stored = context.banks_client.get_account(pda).await.unwrap().expect("creator account");
    assert_eq!(stored.owner, creator_registry::ID);
    let creator = creator_registry::CreatorAccount::try_deserialize(&mut stored.data.as_slice()).unwrap();
    assert_eq!(creator.authority, authority);
    assert_eq!(creator.payout, authority);
    assert_eq!(creator.metadata_uri, "ipfs://alice");
    assert_eq!(creator.bump, bump);
    assert!(send(&mut context, &[register_ix(authority, "ipfs://again".into(), None)], &[]).await.is_err());
}

#[tokio::test]
async fn updates_metadata_only_for_the_authority() {
    let mut context = context().await;
    let authority = context.payer.pubkey();
    send(&mut context, &[register_ix(authority, "ipfs://alice".into(), None)], &[]).await.unwrap();
    send(&mut context, &[update_metadata_ix(authority, "https://metadata.example/alice.json".into())], &[]).await.unwrap();
    let (pda, _) = creator_pda(&authority);
    let stored = context.banks_client.get_account(pda).await.unwrap().unwrap();
    let creator = creator_registry::CreatorAccount::try_deserialize(&mut stored.data.as_slice()).unwrap();
    assert_eq!(creator.metadata_uri, "https://metadata.example/alice.json");
    assert_eq!(creator.authority, authority);
}

#[tokio::test]
async fn rejects_invalid_metadata_and_zero_payout() {
    let mut context = context().await;
    let authority = context.payer.pubkey();
    assert!(send(&mut context, &[register_ix(authority, "http://example.com".into(), None)], &[]).await.is_err());
    assert!(send(&mut context, &[register_ix(authority, "".into(), None)], &[]).await.is_err());
    assert!(send(&mut context, &[register_ix(authority, "ipfs://has space".into(), None)], &[]).await.is_err());
    assert!(send(&mut context, &[register_ix(authority, "ipfs://alice".into(), Some(Pubkey::default()))], &[]).await.is_err());
    assert_eq!(lamports(&mut context, &creator_pda(&authority).0).await, 0);
}

#[tokio::test]
async fn two_creators_have_independent_pdas() {
    let mut context = context().await;
    let alice = context.payer.pubkey();
    let bob = Keypair::new();
    context.set_account(&bob.pubkey(), &fund(bob.pubkey()));
    send(&mut context, &[register_ix(alice, "ipfs://alice".into(), None)], &[]).await.unwrap();
    send(&mut context, &[register_ix(bob.pubkey(), "ipfs://bob".into(), None)], &[&bob]).await.unwrap();
    let (alice_pda, _) = creator_pda(&alice);
    let (bob_pda, _) = creator_pda(&bob.pubkey());
    assert_ne!(alice_pda, bob_pda);
    assert!(context.banks_client.get_account(alice_pda).await.unwrap().is_some());
    assert!(context.banks_client.get_account(bob_pda).await.unwrap().is_some());
}

#[tokio::test]
async fn rejects_a_substituted_creator_account() {
    let mut context = context().await;
    let alice = context.payer.pubkey();
    let bob = Keypair::new();
    context.set_account(&bob.pubkey(), &fund(bob.pubkey()));
    send(&mut context, &[register_ix(alice, "ipfs://alice".into(), None)], &[]).await.unwrap();
    send(&mut context, &[register_ix(bob.pubkey(), "ipfs://bob".into(), None)], &[&bob]).await.unwrap();
    let (alice_pda, _) = creator_pda(&alice);
    let wrong = Instruction {
        program_id: creator_registry::ID,
        accounts: vec![
            AccountMeta::new_readonly(bob.pubkey(), true),
            AccountMeta::new(alice_pda, false),
        ],
        data: UpdateMetadata { metadata_uri: "ipfs://nope".into() }.data(),
    };
    assert!(send(&mut context, &[wrong], &[&bob]).await.is_err());
}

#[tokio::test]
async fn tip_pays_the_registered_payout_exactly() {
    let mut context = context().await;
    let creator = context.payer.pubkey();
    let payout = Keypair::new();
    context.set_account(&payout.pubkey(), &fund(payout.pubkey()));
    let sender = Keypair::new();
    context.set_account(&sender.pubkey(), &fund(sender.pubkey()));
    send(&mut context, &[register_ix(creator, "ipfs://alice".into(), Some(payout.pubkey()))], &[]).await.unwrap();
    let before = lamports(&mut context, &payout.pubkey()).await;
    send(&mut context, &[tip_ix(sender.pubkey(), creator, payout.pubkey(), 250_000)], &[&sender]).await.unwrap();
    assert_eq!(lamports(&mut context, &payout.pubkey()).await - before, 250_000);
    send(&mut context, &[tip_ix(sender.pubkey(), creator, payout.pubkey(), 100_000)], &[&sender]).await.unwrap();
    assert_eq!(lamports(&mut context, &payout.pubkey()).await - before, 350_000);
}

#[tokio::test]
async fn rejects_zero_unregistered_and_wrong_payout_tips() {
    let mut context = context().await;
    let creator = context.payer.pubkey();
    let payout = Keypair::new();
    let stranger = Keypair::new();
    context.set_account(&payout.pubkey(), &fund(payout.pubkey()));
    context.set_account(&stranger.pubkey(), &fund(stranger.pubkey()));
    let sender = context.payer.pubkey();
    assert!(send(&mut context, &[tip_ix(sender, creator, payout.pubkey(), 10)], &[]).await.is_err());
    send(&mut context, &[register_ix(creator, "ipfs://alice".into(), Some(payout.pubkey()))], &[]).await.unwrap();
    let before = lamports(&mut context, &payout.pubkey()).await;
    assert!(send(&mut context, &[tip_ix(sender, creator, payout.pubkey(), 0)], &[]).await.is_err());
    assert!(send(&mut context, &[tip_ix(sender, creator, stranger.pubkey(), 10)], &[]).await.is_err());
    let (pda, _) = creator_pda(&creator);
    let spoofed = Instruction {
        program_id: creator_tipping::ID,
        accounts: vec![
            AccountMeta::new(sender, true),
            AccountMeta::new(stranger.pubkey(), false),
            AccountMeta::new_readonly(pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: Tip { amount: 10 }.data(),
    };
    assert!(send(&mut context, &[spoofed], &[]).await.is_err());
    assert_eq!(lamports(&mut context, &payout.pubkey()).await, before);
}

#[tokio::test]
async fn tip_event_is_emitted_and_payout_can_change() {
    let mut context = context().await;
    let creator = context.payer.pubkey();
    let first = Keypair::new();
    let second = Keypair::new();
    context.set_account(&first.pubkey(), &fund(first.pubkey()));
    context.set_account(&second.pubkey(), &fund(second.pubkey()));
    send(&mut context, &[register_ix(creator, "ipfs://alice".into(), Some(first.pubkey()))], &[]).await.unwrap();
    send(&mut context, &[update_payout_ix(creator, second.pubkey())], &[]).await.unwrap();
    let before = lamports(&mut context, &second.pubkey()).await;
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let mut transaction = Transaction::new_with_payer(
        &[tip_ix(creator, creator, second.pubkey(), 80_000)],
        Some(&context.payer.pubkey()),
    );
    transaction.sign(&[&context.payer], blockhash);
    let result = context.banks_client.process_transaction_with_metadata(transaction).await.unwrap();
    assert!(result.result.is_ok());
    assert!(result.result.is_ok());
    let logs = result.metadata.unwrap().log_messages;
    let captured = EVENT_BYTES.lock().expect("event log");
    let emitted = logs.iter().any(|line| line.contains("Program data:"))
        || captured.iter().any(|bytes| tip_event(bytes, &creator, &second.pubkey(), 80_000));
    assert!(emitted, "TipSent was not emitted");
    drop(captured);
    assert_eq!(lamports(&mut context, &second.pubkey()).await - before, 80_000);
    assert_eq!(lamports(&mut context, &first.pubkey()).await, 5_000_000_000);
}

#[tokio::test]
async fn rejects_a_creator_account_that_is_not_the_pda() {
    let mut context = context().await;
    let creator = context.payer.pubkey();
    let payout = Keypair::new();
    context.set_account(&payout.pubkey(), &fund(payout.pubkey()));
    send(&mut context, &[register_ix(creator, "ipfs://alice".into(), Some(payout.pubkey()))], &[]).await.unwrap();
    let fake = Keypair::new();
    context.set_account(
        &fake.pubkey(),
        &AccountSharedData::from(Account {
            lamports: 1_000_000,
            data: vec![0; 8],
            owner: creator_registry::ID,
            executable: false,
            rent_epoch: 0,
        }),
    );
    let wrong = Instruction {
        program_id: creator_tipping::ID,
        accounts: vec![
            AccountMeta::new(creator, true),
            AccountMeta::new(payout.pubkey(), false),
            AccountMeta::new_readonly(fake.pubkey(), false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: Tip { amount: 10 }.data(),
    };
    let before = lamports(&mut context, &payout.pubkey()).await;
    assert!(send(&mut context, &[wrong], &[]).await.is_err());
    assert_eq!(lamports(&mut context, &payout.pubkey()).await, before);
}
