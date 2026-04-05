const axios = require('axios');

async function debugOnboarding() {
  const BASE_URL = 'https://petpooja-saas.onrender.com/api/superadmin';
  const LOGIN_DATA = { email: 'admin@admin.com', password: 'password' };

  try {
    console.log('1. Logging in...');
    const loginRes = await axios.post(`${BASE_URL}/login`, LOGIN_DATA);
    const token = loginRes.data.data.token;
    console.log('   Login successful. Token acquired.');

    const authHeaders = { Authorization: `Bearer ${token}` };

    console.log('\n2. Fetching Chains...');
    const chainsRes = await axios.get(`${BASE_URL}/chains`, { headers: authHeaders });
    console.log('   Chains response:', JSON.stringify(chainsRes.data, null, 2));

    console.log('\n3. Attempting to onboard a new restaurant...');
    const onboardData = {
      name: 'Agent Debug Diner ' + Date.now(),
      legal_name: 'Agent Debug Diner',
      contact_email: `agent_${Date.now()}@test.com`,
      contact_phone: String(Math.floor(7000000000 + Math.random() * 2999999999)),
      owner_name: 'Debug Agent',
      password: 'Password123',
      plan: 'TRIAL',
      city: 'Mumbai',
      address: '123 Debug Lane'
    };

    const onboardRes = await axios.post(`${BASE_URL}/onboard`, onboardData, { headers: authHeaders });
    console.log('   Onboarding SUCCESS:', JSON.stringify(onboardRes.data, null, 2));

    console.log('\n4. Verifying if it appears in list...');
    const chainsRes2 = await axios.get(`${BASE_URL}/chains`, { headers: authHeaders });
    const found = chainsRes2.data.data.chains.find(c => c.name === onboardData.name);
    if (found) {
      console.log('   SUCCESS: New restaurant visible in list!');
    } else {
      console.log('   FAILURE: New restaurant NOT visible in list!');
    }

  } catch (err) {
    console.error('\n❌ ERROR during debug:');
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('   Message:', err.message);
    }
  }
}

debugOnboarding();
