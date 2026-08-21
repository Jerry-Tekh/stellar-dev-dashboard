import type { RawDocumentInput } from '../../types/documentAnalysis';

const ACCOUNT_ID = 'GA6SXIZIKMPEYE2CHTDDDG4OG5S4PNKMWOYB2YBNQAGAEAH6ZDBNTZEX';
const CONTRACT_ID = 'CA7QYNF7SOWQ3GLR2BGMZEH3AVAFKBU MNR5ISSP6DF4TBZ3WYFVBWCDR'.replace(/\s/g, '');
const TX_HASH = '2b2e4f7a1c9d8e6f0a3b5c7d9e1f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f';

export const DEMO_CORPUS: RawDocumentInput[] = [
  {
    id: 'demo-protocol-overview',
    title: 'Stellar Protocol Overview',
    format: 'markdown',
    source: 'whitepaper',
    url: 'https://developer.stellar.org/docs',
    publishedAt: '2026-01-10T00:00:00.000Z',
    content: `# Stellar Protocol Overview

The Stellar network is a decentralized ledger for payments and asset issuance.
Stellar uses the Stellar Consensus Protocol to reach agreement without proof of work.
The Stellar Consensus Protocol relies on quorum slices instead of a mining hierarchy.

## Core Components

Stellar Core is the validation software that runs the network.
Horizon is the API layer that applications use to submit transactions and stream events.
Horizon uses Stellar Core for consensus data and exposes REST endpoints.

## Accounts and Value

An account holds a balance of XLM, the native asset of the network.
Every account requires a sequence number to order transactions.
A trustline authorizes holding an issued asset such as USDC.
Issued assets require an issuer account and an asset code.`,
  },
  {
    id: 'demo-payments-guide',
    title: 'Building Payments',
    format: 'markdown',
    source: 'docs',
    url: 'https://developer.stellar.org/docs/payments',
    publishedAt: '2026-02-14T00:00:00.000Z',
    content: `# Building Payments

The payment operation moves value between accounts on the Stellar network.
A payment requires a trustline when transferring issued assets.
Path payment converts one asset into another through offers in the order book.

## Sending Your First Payment

Always validate the destination account before submitting a payment.
Never share your secret seed; sign transactions in a secure environment.

\`\`\`js
import { Keypair, Operation, TransactionBuilder } from 'stellar-sdk';

const tx = new TransactionBuilder(sourceAccount, { fee })
  .addOperation(Operation.payment({
    destination: '${ACCOUNT_ID}',
    asset: Asset.native(),
    amount: '25.50',
  }))
  .setTimeout(30)
  .build();
\`\`\`

## Claimable Balances

A claimable balance lets you send funds to an account that is not yet funded.
Claimable balance entries are useful for onboarding new users.`,
  },
  {
    id: 'demo-soroban-guide',
    title: 'Soroban Smart Contracts Guide',
    format: 'markdown',
    source: 'docs',
    url: 'https://developer.stellar.org/docs/soroban',
    publishedAt: '2026-03-20T00:00:00.000Z',
    content: `# Soroban Smart Contracts

Soroban is the smart contracts platform of the Stellar network.
Smart contracts use WebAssembly as the execution format.
Soroban requires a Footprint that declares every ledger entry a contract touches.
Budget metering limits CPU and memory usage during contract execution.

## Deploying a Contract

Contract deployment uploads contract wasm then creates the contract instance.
Invoke Host Function operations execute contract methods.

\`\`\`js
const deployTx = new TransactionBuilder(account, { fee })
  .addOperation(Operation.invokeHostFunction({
    function: InvokeHostFunction.createContractV2,
    wasm: compiledWasm,
  }))
  .build();
\`\`\`

## Storage Types

Persistent storage keeps contract data after invocations complete.
Instance storage stores data scoped to the contract instance.
Authorization entries prove who approved a contract invocation.`,
  },
  {
    id: 'demo-horizon-reference',
    title: 'Horizon API Reference',
    format: 'html',
    source: 'specification',
    url: 'https://developers.stellar.org/api',
    publishedAt: '2026-04-02T00:00:00.000Z',
    content: `<h1>Horizon API Reference</h1>
<p>Horizon is the RESTful API layer for the Stellar network.</p>
<h2>Accounts Endpoint</h2>
<p>The accounts endpoint returns account details such as balances and signers.</p>
<p>Account ${ACCOUNT_ID} example response includes native and issued balances.</p>
<h2>Transactions Endpoint</h2>
<p>The transactions endpoint lists transactions and supports cursor streaming.</p>
<p>Transaction ${TX_HASH} settled with a fee bump transaction.</p>
<h2>Rate Limits</h2>
<p>Rate limits protect Horizon from excessive request volume.</p>
<p>Always respect rate limit headers and retry with exponential backoff.</p>
<h2>Fee Stats</h2>
<p>The fee stats endpoint reports accepted fee bands for the last few ledgers.</p>`,
  },
  {
    id: 'demo-security-practices',
    title: 'Security Best Practices',
    format: 'markdown',
    source: 'docs',
    url: 'https://developer.stellar.org/docs/security',
    publishedAt: '2026-04-18T00:00:00.000Z',
    content: `# Security Best Practices

Never expose a secret seed in client-side code or logs.
Private key material should be encrypted at rest.
Always validate input from users before building transactions.
Use https endpoints for every Horizon request.
Multisig improves security by requiring multiple signers for a transaction.
Signing thresholds define how many signatures an operation class requires.
Avoid reusing the same signer across hot and cold wallets.
Phishing sites often imitate wallet interfaces; verify URLs carefully.`,
  },
  {
    id: 'demo-forum-trustline-thread',
    title: 'Forum: Payment failing with trustline error',
    format: 'text',
    source: 'forum',
    author: 'alice_dev',
    url: 'https://discuss.stellar.org/t/trustline-error/1234',
    publishedAt: '2026-05-11T00:00:00.000Z',
    content: `Payment failing with trustline error

My payment operation keeps failing with op_underfunded for a USDC payment.
The receiver says they already added a trustline for the asset.

Reply by bob_ops:

An op_underfunded error usually means the sender lacks the asset balance.
Check that the trustline exists AND the issuer actually holds reserves.
The trustline requires a base reserve locked on the receiving account.

Reply by alice_dev:

Fixed! The trustline was missing because the change trust operation was never submitted.
The ledger confirmed after resubmitting with a higher sequence number.`,
  },
  {
    id: 'demo-forum-soroban-budget',
    title: 'Forum: Soroban budget exceeded during simulation',
    format: 'text',
    source: 'forum',
    author: 'carol_builds',
    url: 'https://discuss.stellar.org/t/budget-exceeded/1300',
    publishedAt: '2026-06-03T00:00:00.000Z',
    content: `Soroban budget exceeded during simulation

Simulating my contract invocation fails with budget metering exhaustion.
The contract loops over a large vector of ledger entries.

Reply by dave_core:

Budget metering charges instructions and memory per host function call.
Reduce the Footprint size or paginate the loop across multiple invocations.
Simulation will report exact resource consumption before submission.`,
  },
  {
    id: 'demo-contract-inspection',
    title: 'Inspecting Contract State',
    format: 'markdown',
    source: 'community',
    author: 'dave_core',
    url: 'https://stellar.org/blog/contract-state',
    publishedAt: '2026-06-22T00:00:00.000Z',
    content: `# Inspecting Contract State

Soroban RPC exposes read-only contract queries without submitting transactions.
Contract ${CONTRACT_ID} stores configuration in instance storage.
Persistent storage survives between invocations and costs a rent fee.

\`\`\`bash
curl soroban-rpc getLedgerEntries --keys '{"contractId":"${CONTRACT_ID}"}'
\`\`\`

Authorization entries must be provided for protected contract functions.`,
  },
  {
    id: 'demo-release-notes',
    title: 'Protocol 23 Release Notes',
    format: 'text',
    source: 'specification',
    publishedAt: '2026-07-08T00:00:00.000Z',
    content: `PROTOCOL 23 RELEASE NOTES

CAP-40 supersedes CAP-15 for liquidity pool fee distribution.
Liquidity pool deposits now record exact pool shares.
Parallel execution scheduling improves Soroban throughput.
Soroban requires a Footprint with write access for state changes.
Testnet upgraded two weeks before Mainnet. Futurenet tracks cutting edge features.`,
  },
  {
    id: 'demo-guia-pagos-es',
    title: 'Guía de Pagos en Stellar',
    format: 'text',
    source: 'community',
    publishedAt: '2026-07-15T00:00:00.000Z',
    content: `Guía de pagos en la red Stellar

La operación de pago transfiere valor entre cuentas de la red Stellar.
La cuenta puede tener un saldo de activos emitidos y XLM.
Para activos emitidos se requiere una trustline en la cuenta destino.
El libro mayor registra cada transacción con su secuencia.`,
  },
  {
    id: 'demo-guide-ja',
    title: 'ステラ支払いガイド',
    format: 'text',
    source: 'community',
    publishedAt: '2026-07-25T00:00:00.000Z',
    content: `ステラネットワークの支払いガイド

支払い操作はアカウント間で価値を移動します。
アカウントは残高を記録し、台帳が取引を保存します。
発行済みアセットにはtrustlineが必要です。`,
  },
  {
    id: 'demo-multisig-tutorial',
    title: 'Multisig Wallets Tutorial',
    format: 'markdown',
    source: 'docs',
    url: 'https://developer.stellar.org/docs/multisig',
    publishedAt: '2026-08-05T00:00:00.000Z',
    content: `# Multisig Wallets

Multisig requires multiple signers to authorize a single transaction.
Set options configures signer weights and signing thresholds.
A threshold defines how many signatures low, medium, and high risk operations need.

\`\`\`js
const tx = new TransactionBuilder(account, { fee })
  .addOperation(Operation.setOptions({
    signer: { ed25519PublicKey: coSignerKey, weight: 2 },
    lowThreshold: 2,
    medThreshold: 2,
    highThreshold: 3,
  }))
  .build();
\`\`\`

Always keep master weight below the sum of cosigner weights for shared control.`,
  },
  {
    id: 'demo-streaming-events',
    title: 'Streaming Events from Horizon',
    format: 'markdown',
    source: 'docs',
    url: 'https://developer.stellar.org/docs/streaming',
    publishedAt: '2026-08-12T00:00:00.000Z',
    content: `# Streaming Events

Cursor streaming delivers new ledgers and operations in real time.
The payments endpoint supports streaming with a paging token cursor.
Effects describe low level ledger changes such as account created or trustline created.

\`\`\`js
const es = new EventSource(HORIZON_URL + '/payments?cursor=now');
es.onmessage = (event) => console.log(JSON.parse(event.data));
\`\`\`

Reconnect with the last paging token after any disconnection to avoid missed events.`,
  },
];

export const createDemoCorpus = (): RawDocumentInput[] => DEMO_CORPUS.map((doc) => ({ ...doc }));
