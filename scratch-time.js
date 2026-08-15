const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

const url = 'https://aqxrmxobhyoutyqbogsy.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxeHJteG9iaHlvdXR5cWJvZ3N5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0NTIzOCwiZXhwIjoyMTAxOTIxMjM4fQ.HmlikJFxPUbqbRpDW3GRSpwBW6qc6y6LpLgRxlgOQak';

async function testDns() {
  const start = Date.now();
  return new Promise((resolve) => {
    dns.lookup('aqxrmxobhyoutyqbogsy.supabase.co', (err, address, family) => {
      console.log(`DNS lookup took: ${Date.now() - start}ms (IP: ${address})`);
      resolve();
    });
  });
}

async function testFetch() {
  const start = Date.now();
  const res = await fetch(url);
  console.log(`Fetch to root took: ${Date.now() - start}ms (status: ${res.status})`);
}

async function testDb() {
  const supabase = createClient(url, key);
  const start = Date.now();
  const { data, error } = await supabase.from('products').select('id').limit(1);
  console.log(`DB query took: ${Date.now() - start}ms (error: ${error?.message || 'none'})`);
}

async function run() {
  console.log("--- START TIMINGS ---");
  await testDns();
  await testFetch();
  await testDb();
  console.log("--- END TIMINGS ---");
}

run();
