import { http, HttpResponse } from 'msw';
import {
  buildAccountFixture,
  buildLedgerFixture,
  buildTransactionsResponse,
  buildOperation,
} from '../__factories__';

const HORIZON_BASE = 'https://horizon-testnet.stellar.org';
const FAUCET_BASE = 'https://friendbot.stellar.org';
const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';

const mockAccount = buildAccountFixture();
const mockTransactions = buildTransactionsResponse();
const mockOperations = buildTransactionsResponse([buildOperation()]);
const mockLedger = buildLedgerFixture();

export const handlers = [
  // Account endpoint
  http.get(`${HORIZON_BASE}/accounts/:accountId`, ({ params }) => {
    return HttpResponse.json({ ...mockAccount, id: params.accountId, account_id: params.accountId });
  }),

  // Transactions for an account
  http.get(`${HORIZON_BASE}/accounts/:accountId/transactions`, () => {
    return HttpResponse.json(mockTransactions);
  }),

  // Operations for an account
  http.get(`${HORIZON_BASE}/accounts/:accountId/operations`, () => {
    return HttpResponse.json(mockOperations);
  }),

  // Order book (used for SDEX-derived asset price estimates)
  http.get(`${HORIZON_BASE}/order_book`, () => {
    return HttpResponse.json({
      bids: [{ price: '0.1' }],
      asks: [{ price: '0.2' }],
    });
  }),

  // Latest ledger
  http.get(`${HORIZON_BASE}/ledgers/:sequence`, () => {
    return HttpResponse.json(mockLedger);
  }),

  // Ledger list
  http.get(`${HORIZON_BASE}/ledgers`, () => {
    return HttpResponse.json({
      _embedded: { records: [mockLedger] },
    });
  }),

  // Friendbot faucet (testnet funding)
  http.get(FAUCET_BASE, () => {
    return HttpResponse.json({ funded: true });
  }),

  // Coingecko XLM price
  http.get(COINGECKO_PRICE_URL, () => {
    return HttpResponse.json({ stellar: { usd: 0.5 } });
  }),
];

export default handlers;
