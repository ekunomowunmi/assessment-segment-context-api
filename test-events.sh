#!/bin/bash

# Test script to send multiple events
# Usage: ./test-events.sh [user_id] [count]

API_URL="http://localhost:8001"
TENANT_ID="default-tenant"
USER_ID=${1:-"test-user-123"}
COUNT=${2:-10}

echo "Sending $COUNT events for user: $USER_ID"
echo "API: $API_URL"
echo ""

for i in $(seq 1 $COUNT); do
  EVENT_ID="event-$(date +%s)-$i"
  EVENT_TYPE="page_view"
  
  # Rotate event types for variety
  case $((i % 4)) in
    0) EVENT_TYPE="page_view" ;;
    1) EVENT_TYPE="button_click" ;;
    2) EVENT_TYPE="add_to_cart" ;;
    3) EVENT_TYPE="purchase" ;;
  esac
  
  EVENT_DATA=$(cat <<EOF
{
  "event_id": "$EVENT_ID",
  "user_id": "$USER_ID",
  "event_type": "$EVENT_TYPE",
  "event_data": {
    "page": "/products/$i",
    "action": "$EVENT_TYPE",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
)
  
  echo "[$i/$COUNT] Sending $EVENT_TYPE event: $EVENT_ID"
  
  curl -X POST "$API_URL/api/v1/events/ingest" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -d "$EVENT_DATA" \
    -s -o /dev/null -w "Status: %{http_code}\n"
  
  # Small delay to avoid overwhelming
  sleep 0.5
done

echo ""
echo "Done! Check the dashboard or list events:"
echo "curl -H 'X-Tenant-ID: $TENANT_ID' $API_URL/api/v1/events?user_id=$USER_ID"
