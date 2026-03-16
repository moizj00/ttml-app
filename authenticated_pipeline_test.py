#!/usr/bin/env python3
"""
Authenticated AI Pipeline Test
"""

import requests
import json
import time

class AuthenticatedPipelineTest:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
        self.session_data = None
        
    def login_subscriber(self):
        """Login and get session cookies"""
        login_data = {
            "email": "subscriber@test.com",
            "password": "TestPass123!"
        }
        
        # Use the /api/auth/login endpoint which should set session cookies
        response = self.session.post(f"{self.base_url}/api/auth/login", json=login_data)
        
        if response.status_code == 200:
            self.session_data = response.json()
            print("✅ Subscriber login successful")
            
            # Check if we got session cookies
            cookies = self.session.cookies.get_dict()
            print(f"   Session cookies: {list(cookies.keys())}")
            
            return True
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
    
    def test_letter_submission_with_auth(self):
        """Test letter submission with proper authentication"""
        if not self.session_data:
            print("❌ No session data - login first")
            return None
            
        print(f"Testing with session cookies: {list(self.session.cookies.get_dict().keys())}")
            
        # Prepare letter data according to the Zod schema
        letter_payload = {
            "letterType": "demand-letter",
            "subject": f"AI Pipeline Test - {int(time.time())}",
            "issueSummary": "Testing the AI pipeline with Perplexity research and Anthropic drafting",
            "jurisdictionCountry": "US", 
            "jurisdictionState": "California",
            "jurisdictionCity": "Los Angeles",
            "intakeJson": {
                "schemaVersion": "1.0",
                "letterType": "demand-letter",
                "sender": {
                    "name": "Pipeline Test User",
                    "address": "123 Test St, Los Angeles, CA 90210",
                    "email": "subscriber@test.com",
                    "phone": "(555) 123-4567"
                },
                "recipient": {
                    "name": "Test Recipient Company", 
                    "address": "456 Business Ave, Los Angeles, CA 90211",
                    "email": "test@company.com"
                },
                "jurisdiction": {
                    "country": "US",
                    "state": "California",
                    "city": "Los Angeles"
                },
                "matter": {
                    "category": "Contract Dispute",
                    "subject": "Payment Demand for Services",
                    "description": "Company owes $3,500 for consulting services provided in December 2024. Payment was due January 15, 2025 but remains outstanding despite multiple follow-up attempts.",
                    "incidentDate": "2024-12-15"
                },
                "financials": {
                    "amountOwed": 3500,
                    "currency": "USD"
                },
                "desiredOutcome": "Payment of full amount within 21 days plus any applicable late fees",
                "tonePreference": "firm",
                "additionalContext": "This is a test of the AI pipeline system including Perplexity research and Anthropic Claude drafting stages."
            },
            "priority": "normal"
        }
        
        try:
            # Test auth first with a simple query
            auth_test = self.session.get(f"{self.base_url}/api/trpc/auth.me")
            print(f"Auth test response: {auth_test.status_code}")
            
            if auth_test.status_code == 200:
                auth_data = auth_test.json()
                if auth_data.get('result', {}).get('data', {}).get('json'):
                    print(f"✅ Authentication verified - logged in as user")
                else:
                    print(f"⚠️ Authentication unclear - proceeding with submission")
            
            # Submit via tRPC endpoint using JSON-RPC 2.0 format
            trpc_payload = [{
                "jsonrpc": "2.0",
                "id": 1,
                "method": "letters.submit",
                "params": {
                    "input": letter_payload
                }
            }]
            
            response = self.session.post(
                f"{self.base_url}/api/trpc/letters.submit",
                json=trpc_payload,
                timeout=30
            )
            
            print(f"Letter submission response: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Response structure: {list(data.keys()) if isinstance(data, dict) else 'Array response'}")
                
                # Handle JSON-RPC array response
                if isinstance(data, list) and len(data) > 0:
                    rpc_response = data[0]
                    if 'result' in rpc_response and 'data' in rpc_response['result']:
                        letter_info = rpc_response['result']['data']
                        letter_id = letter_info.get('letterId')
                        status = letter_info.get('status')
                        
                        print(f"✅ Letter submitted successfully!")
                        print(f"   Letter ID: {letter_id}")
                        print(f"   Initial Status: {status}")
                        
                        return letter_id
                    else:
                        print(f"❌ Unexpected RPC response format: {json.dumps(rpc_response, indent=2)}")
                        return None
                elif isinstance(data, dict) and 'result' in data and 'data' in data['result']:
                    letter_info = data['result']['data']
                    letter_id = letter_info.get('letterId')
                    status = letter_info.get('status')
                    
                    print(f"✅ Letter submitted successfully!")
                    print(f"   Letter ID: {letter_id}")
                    print(f"   Initial Status: {status}")
                    
                    return letter_id
                else:
                    print(f"❌ Unexpected response format: {json.dumps(data, indent=2)}")
                    return None
            else:
                print(f"❌ Submission failed: {response.text[:300]}")
                return None
                
        except Exception as e:
            print(f"❌ Error submitting letter: {str(e)}")
            return None
    
    def monitor_pipeline_status(self, letter_id):
        """Monitor AI pipeline progress"""
        if not letter_id:
            print("❌ No letter ID to monitor")
            return None
            
        print(f"\n🤖 Monitoring AI Pipeline for Letter #{letter_id}")
        print("Expected: submitted → researching → drafting → generated_locked")
        print("-" * 60)
        
        statuses_seen = []
        start_time = time.time()
        
        for attempt in range(20):  # Monitor for up to 5 minutes (15s intervals)
            try:
                # Check letter status via API
                response = self.session.get(
                    f"{self.base_url}/api/trpc/letters.detail?input={{\"id\":{letter_id}}}",
                    timeout=15
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if 'result' in data and 'data' in data['result']:
                        letter_data = data['result']['data']['letter']
                        current_status = letter_data.get('status')
                        
                        if current_status not in statuses_seen:
                            elapsed = time.time() - start_time
                            print(f"   {elapsed:.1f}s: Status = {current_status}")
                            statuses_seen.append(current_status)
                        
                        # Check if pipeline is complete
                        if current_status == "generated_locked":
                            print(f"✅ AI Pipeline completed! Letter ready for payment/review")
                            print(f"   Total processing time: {elapsed:.1f} seconds")
                            print(f"   Status progression: {' → '.join(statuses_seen)}")
                            return current_status
                        
                        # Check for failure states
                        if current_status in ["failed", "error"]:
                            print(f"❌ Pipeline failed with status: {current_status}")
                            return current_status
                            
                    else:
                        print(f"❌ Could not get letter status")
                        
                else:
                    print(f"❌ Status check failed: {response.status_code}")
                    
            except Exception as e:
                print(f"❌ Error checking status: {str(e)}")
            
            time.sleep(15)  # Wait 15 seconds before next check
        
        # Timeout reached
        elapsed = time.time() - start_time
        print(f"⏰ Pipeline monitoring timeout after {elapsed:.1f}s")
        print(f"   Last seen statuses: {' → '.join(statuses_seen)}")
        return statuses_seen[-1] if statuses_seen else None

def main():
    base_url = "https://c6b6cbf3-9bdd-4078-8fe7-58ccee1ed48d.preview.emergentagent.com"
    
    print("🤖 AI Pipeline Integration Test")
    print("="*60)
    
    tester = AuthenticatedPipelineTest(base_url)
    
    # Step 1: Login
    if not tester.login_subscriber():
        print("❌ Cannot proceed without login")
        return 1
    
    # Step 2: Submit letter
    print("\n📝 Testing Letter Submission")
    letter_id = tester.test_letter_submission_with_auth()
    
    if letter_id:
        # Step 3: Monitor AI pipeline
        final_status = tester.monitor_pipeline_status(letter_id)
        
        if final_status == "generated_locked":
            print(f"\n🎉 SUCCESS: AI Pipeline working correctly!")
            print(f"   Letter #{letter_id} processed through full AI pipeline")
            print(f"   Ready for subscriber to pay and submit for attorney review")
            return 0
        else:
            print(f"\n⚠️ Pipeline completed with status: {final_status}")
            return 1
    else:
        print("\n❌ Letter submission failed")
        return 1

if __name__ == "__main__":
    exit(main())