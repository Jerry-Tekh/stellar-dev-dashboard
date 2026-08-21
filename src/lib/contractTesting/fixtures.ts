export interface SampleContract {
  id: string;
  label: string;
  description: string;
  source: string;
}

const TOKEN_CONTRACT = `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

#[contracttype]
pub enum DataKey {
    Balance(Address),
    Admin,
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(env: Env, admin: Address, decimal: u32, name: String) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        let _ = (decimal, name);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let key = DataKey::Balance(to.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_balance = balance + amount;
        env.storage().persistent().set(&key, &new_balance);
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_key = DataKey::Balance(from.clone());
        let from_balance: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        if from_balance < amount {
            panic!("insufficient balance");
        }
        let new_from_balance = from_balance - amount;
        env.storage().persistent().set(&from_key, &new_from_balance);

        let to_key = DataKey::Balance(to.clone());
        let to_balance: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
        let new_to_balance = to_balance + amount;
        env.storage().persistent().set(&to_key, &new_to_balance);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        let key = DataKey::Balance(id);
        env.storage().persistent().get(&key).unwrap_or(0)
    }
}
`;

const COUNTER_CONTRACT = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};

const COUNTER: Symbol = symbol_short!("COUNTER");

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env.storage().instance().get(&COUNTER).unwrap_or(0);
        count += 1;
        env.storage().instance().set(&COUNTER, &count);
        count
    }

    pub fn reset(env: Env) {
        env.storage().instance().set(&COUNTER, &0u32);
    }

    pub fn get(env: Env) -> u32 {
        env.storage().instance().get(&COUNTER).unwrap_or(0)
    }
}
`;

const ESCROW_CONTRACT = `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub released: bool,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn open(env: Env, buyer: Address, seller: Address, amount: i128) {
        buyer.require_auth();
        let deal = Deal { buyer, seller, amount, released: false };
        env.storage().persistent().set(&seller, &deal);
    }

    pub fn release(env: Env, seller: Address, target: Address) {
        let mut deal: Deal = env.storage().persistent().get(&seller).unwrap();
        deal.released = true;
        env.storage().persistent().set(&seller, &deal);
        env.invoke_contract::<()>(&target, &symbol_placeholder(), soroban_sdk::vec![&env]);
    }

    pub fn cancel(env: Env, seller: Address) {
        env.storage().persistent().remove(&seller);
    }
}

fn symbol_placeholder() -> soroban_sdk::Symbol {
    unimplemented!()
}
`;

export const SAMPLE_CONTRACTS: SampleContract[] = [
  {
    id: 'token',
    label: 'Fungible token',
    description: 'Mint/transfer/balance token contract — includes an admin-guarded mint and a checked transfer.',
    source: TOKEN_CONTRACT,
  },
  {
    id: 'counter',
    label: 'Simple counter',
    description: 'Minimal storage-backed counter — good first contract to see the pipeline end to end.',
    source: COUNTER_CONTRACT,
  },
  {
    id: 'escrow',
    label: 'Escrow (deliberately flawed)',
    description: 'Escrow release is missing require_auth and calls out to another contract after writing state — intentionally triggers access-control and reentrancy-shaped findings.',
    source: ESCROW_CONTRACT,
  },
];

export function findSampleContract(id: string): SampleContract | undefined {
  return SAMPLE_CONTRACTS.find((sample) => sample.id === id);
}
