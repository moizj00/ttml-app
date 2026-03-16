#!/usr/bin/env python3
"""
API Key and Environment Configuration Test
"""

import requests
import json

def test_api_keys_configured():
    base_url = "https://c6b6cbf3-9bdd-4078-8fe7-58ccee1ed48d.preview.emergentagent.com"
    
    print("🔑 Testing API Key Configuration")
    print("-" * 50)
    
    # Test tRPC system endpoint to check if basic functionality works
    try:
        response = requests.get(f"{base_url}/api/trpc/system.health", timeout=10)
        print(f"System Health Endpoint: {response.status_code}")
        
        # Test auth endpoint
        auth_response = requests.get(f"{base_url}/api/trpc/auth.me", timeout=10)
        print(f"Auth Me Endpoint: {auth_response.status_code}")
        
        if auth_response.status_code == 200:
            data = auth_response.json()
            print(f"Auth Response: {json.dumps(data, indent=2)}")
            
        # Test with credentials
        print("\n🔐 Testing Login with Test Credentials")
        
        # First try to login with subscriber credentials
        login_data = {
            "email": "subscriber@test.com",
            "password": "TestPass123!"
        }
        
        login_response = requests.post(f"{base_url}/api/auth/login", json=login_data, timeout=15)
        print(f"Login Response Status: {login_response.status_code}")
        
        if login_response.status_code == 200:
            login_result = login_response.json()
            print("✅ Login successful!")
            print(f"Login result keys: {list(login_result.keys()) if isinstance(login_result, dict) else 'Not a dict'}")
        else:
            print(f"❌ Login failed: {login_response.text[:200]}")
            
        # Test Supabase integration (check if error mentions Supabase)
        if "supabase" in login_response.text.lower():
            print("🔍 Supabase integration detected")
        
        print("\n📊 Testing Admin Stats (requires admin login)")
        
        # Test admin functionality
        admin_login = {
            "email": "admin@test.com", 
            "password": "TestPass123!"
        }
        
        admin_response = requests.post(f"{base_url}/api/auth/login", json=admin_login, timeout=15)
        print(f"Admin Login Status: {admin_response.status_code}")
        
    except Exception as e:
        print(f"❌ Error testing API configuration: {str(e)}")

if __name__ == "__main__":
    test_api_keys_configured()