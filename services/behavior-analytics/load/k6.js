/* global __ENV, __VU, __ITER */

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    ingestion: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 500,
      exec: 'ingest',
    },
    recommendations: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2m',
      exec: 'profile',
    },
  },
  thresholds: {
    'http_req_duration{endpoint:profile}': ['p(95)<100'],
    'http_req_duration{endpoint:ingest}': ['p(95)<100'],
    http_req_failed: ['rate<0.01'],
  },
};

const baseUrl = __ENV.ANALYTICS_URL || 'http://localhost:3101';

function headers(client) {
  return { headers: { 'Content-Type': 'application/json', 'X-Analytics-Client': client } };
}

export function setup() {
  for (let index = 0; index < 100; index += 1) {
    http.post(
      `${baseUrl}/api/v1/consent`,
      JSON.stringify({ usage: true, personalization: true }),
      headers(`load-client-${index.toString().padStart(4, '0')}`)
    );
  }
}

export function ingest() {
  const client = `load-client-${String(__VU % 100).padStart(4, '0')}`;
  const events = Array.from({ length: 500 }, (_, index) => ({
    id: `${__VU}-${__ITER}-${index}`,
    type: 'navigation',
    name: 'view:overview',
    occurredAt: new Date().toISOString(),
    sessionId: `session-${__VU}`,
    properties: { tab: 'overview' },
  }));
  const response = http.post(`${baseUrl}/api/v1/events/batch`, JSON.stringify({ events }), {
    ...headers(client),
    tags: { endpoint: 'ingest' },
  });
  check(response, { 'batch accepted': (value) => value.status === 202 });
}

export function profile() {
  const client = `load-client-${String(__VU % 100).padStart(4, '0')}`;
  const response = http.get(`${baseUrl}/api/v1/profile`, {
    ...headers(client),
    tags: { endpoint: 'profile' },
  });
  check(response, { 'profile returned': (value) => value.status === 200 });
}
