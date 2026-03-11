/**
 * Test script to send multiple events
 * Usage: node test-events.js [user_id] [count]
 */

const API_URL = process.env.API_URL || 'http://localhost:8001';
const TENANT_ID = process.env.TENANT_ID || 'default-tenant';
const USER_ID = process.argv[2] || 'test-user-123';
const COUNT = parseInt(process.argv[3] || '10');

const eventTypes = ['page_view', 'button_click', 'add_to_cart', 'purchase', 'search'];

async function sendEvent(index) {
  const eventId = `event-${Date.now()}-${index}`;
  const eventType = eventTypes[index % eventTypes.length];
  
  const eventData = {
    event_id: eventId,
    user_id: USER_ID,
    event_type: eventType,
    event_data: {
      page: `/products/${index}`,
      action: eventType,
      timestamp: new Date().toISOString(),
      ...(eventType === 'purchase' && { amount: Math.floor(Math.random() * 1000) + 10 }),
      ...(eventType === 'add_to_cart' && { product_id: `prod-${index}`, quantity: Math.floor(Math.random() * 3) + 1 }),
    },
  };

  try {
    const response = await fetch(
      `${API_URL}/api/v1/events/ingest`,
      {
        method: 'POST',
        headers: {
          'X-Tenant-ID': TENANT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      }
    );
    
    const data = await response.json();
    console.log(`[${index}/${COUNT}] ✓ ${eventType} - ${eventId} (${response.status})`);
    return true;
  } catch (error) {
    console.error(`[${index}/${COUNT}] ✗ Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`\n🚀 Sending ${COUNT} events for user: ${USER_ID}`);
  console.log(`API: ${API_URL}\n`);

  const promises = [];
  for (let i = 1; i <= COUNT; i++) {
    promises.push(sendEvent(i));
    // Small delay to avoid overwhelming
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const results = await Promise.all(promises);
  const successCount = results.filter(r => r).length;

  console.log(`\n✅ Completed: ${successCount}/${COUNT} events sent successfully`);
  console.log(`\n📊 Check events:`);
  console.log(`   curl -H 'X-Tenant-ID: ${TENANT_ID}' ${API_URL}/api/v1/events?user_id=${USER_ID}`);
  console.log(`\n👤 Check persona:`);
  console.log(`   curl -H 'X-Tenant-ID: ${TENANT_ID}' ${API_URL}/api/v1/personas/${USER_ID}\n`);
}

main().catch(console.error);
