// Load + scale test for the LMS API (spec §13 go-live gate).
// STATUS: code-ready. Run against YOUR deployed API:
//   k6 run -e BASE_URL=https://api.yourdomain.com -e TOKEN=<jwt> ops/load-test.js
//
// Simulates a ramp to 1,000 virtual users hitting the hot read paths
// (dashboard, course list, gradebook) that dominate real LMS traffic.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const gradebookLatency = new Trend('gradebook_latency');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // warm up
    { duration: '5m', target: 1000 },  // ramp to 1k VUs
    { duration: '10m', target: 1000 }, // sustained peak
    { duration: '3m', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.01'],            // <1% errors
    gradebook_latency: ['p(95)<800'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.TOKEN || '';
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

export default function () {
  // hot path 1: dashboard
  const dash = http.get(`${BASE}/api/courses`, { headers });
  check(dash, { 'courses 200': (r) => r.status === 200 }) || errorRate.add(1);

  // hot path 2: gradebook (the heaviest aggregation read)
  const gb = http.get(`${BASE}/api/grades/mine`, { headers });
  check(gb, { 'grades 200': (r) => r.status === 200 }) || errorRate.add(1);
  gradebookLatency.add(gb.timings.duration);

  // hot path 3: notifications poll
  http.get(`${BASE}/api/notifications?unread=true`, { headers });

  sleep(Math.random() * 2 + 1); // think time 1-3s
}
