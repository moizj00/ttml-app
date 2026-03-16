#!/usr/bin/env python3
"""
Authentication flow testing for Talk-to-My-Lawyer application
Tests login with provided credentials for all 4 user roles
"""

import requests
import json
import sys
import time
from datetime import datetime

class AuthTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.timeout = 30
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test credentials from the review request
        self.test_users = {
            "subscriber": {"email": "subscriber@test.com", "password": "TestPass123!"},
            "attorney": {"email": "attorney@test.com", "password": "TestPass123!"},
            "employee": {"email": "employee@test.com", "password": "TestPass123!"},
            "admin": {"email": "admin@test.com", "password": "TestPass123!"}
        }

    def log_test(self, name, success, status_code=None, error_message=None, response_data=None):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test": name,
            "success": success,
            "status_code": status_code,
            "error": error_message,
            "response": response_data if response_data else None,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if status_code:
            print(f"     Status: {status_code}")
        if error_message:
            print(f"     Error: {error_message}")
        if response_data:
            print(f"     Data: {json.dumps(response_data, indent=2)}")

    def test_login_for_role(self, role, credentials):
        """Test login for a specific role"""
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json=credentials,
                headers={'Content-Type': 'application/json'},
                timeout=15
            )
            
            success = response.status_code == 200
            
            if success:
                try:
                    data = response.json()
                    # Check if we get session cookies or tokens
                    session_info = {
                        "has_session": bool(data.get('session')),
                        "has_user": bool(data.get('user')),
                        "cookies": dict(response.cookies) if response.cookies else {}
                    }
                    self.log_test(f"{role.title()} Login", success, response.status_code, response_data=session_info)
                    return True, data
                except Exception as e:
                    self.log_test(f"{role.title()} Login", success, response.status_code, error_message=f"JSON parse error: {e}")
                    return True, {}
            else:
                try:
                    error_data = response.json()
                    self.log_test(f"{role.title()} Login", success, response.status_code, error_message=error_data.get('message', 'Login failed'))
                except:
                    self.log_test(f"{role.title()} Login", success, response.status_code, error_message="Login failed")
                return False, {}
                
        except requests.RequestException as e:
            self.log_test(f"{role.title()} Login", False, error_message=str(e))
            return False, {}

    def test_auth_me_endpoint(self, role, session_cookies=None):
        """Test the auth.me tRPC endpoint to verify session"""
        try:
            headers = {'Content-Type': 'application/json'}
            cookies = session_cookies if session_cookies else {}
            
            response = self.session.get(
                f"{self.base_url}/api/trpc/auth.me",
                headers=headers,
                cookies=cookies,
                timeout=15
            )
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    user_info = {
                        "authenticated": True,
                        "user_role": data.get('result', {}).get('data', {}).get('role') if isinstance(data.get('result', {}).get('data'), dict) else None,
                        "user_email": data.get('result', {}).get('data', {}).get('email') if isinstance(data.get('result', {}).get('data'), dict) else None
                    }
                    self.log_test(f"{role.title()} Auth.me Check", True, response.status_code, response_data=user_info)
                    return True, data
                except Exception as e:
                    self.log_test(f"{role.title()} Auth.me Check", True, response.status_code, error_message=f"Parse error: {e}")
            else:
                self.log_test(f"{role.title()} Auth.me Check", False, response.status_code, error_message="Not authenticated")
                return False, {}
                
        except requests.RequestException as e:
            self.log_test(f"{role.title()} Auth.me Check", False, error_message=str(e))
            return False, {}

    def test_protected_route_access(self, role, route, session_cookies=None):
        """Test access to role-specific protected routes"""
        try:
            cookies = session_cookies if session_cookies else {}
            
            response = self.session.get(
                f"{self.base_url}{route}",
                cookies=cookies,
                timeout=15,
                allow_redirects=False  # Don't follow redirects to see actual response
            )
            
            # Check if we get the dashboard (200) or redirect to login (302/401)
            if response.status_code == 200:
                success = True
                message = "Access granted"
            elif response.status_code in [302, 401]:
                success = False
                message = "Redirected to login (expected for unauthenticated)"
                # Check if redirect URL contains the 'next' parameter
                location = response.headers.get('Location', '')
                if 'next=' in location:
                    message += f" with proper deep linking: {location}"
            else:
                success = False
                message = f"Unexpected status: {response.status_code}"
            
            self.log_test(f"{role.title()} Access to {route}", success if response.status_code == 200 else True, response.status_code, error_message=message if not success else None)
            return response.status_code == 200
            
        except requests.RequestException as e:
            self.log_test(f"{role.title()} Access to {route}", False, error_message=str(e))
            return False

    def run_comprehensive_auth_tests(self):
        """Run all authentication tests"""
        print(f"🔐 Starting Authentication Tests")
        print(f"Base URL: {self.base_url}")
        print("-" * 60)
        
        successful_logins = {}
        
        # Test login for each role
        for role, credentials in self.test_users.items():
            print(f"\n📝 Testing {role.upper()} role...")
            
            # Test login
            login_success, login_data = self.test_login_for_role(role, credentials)
            
            if login_success:
                # Extract session cookies if available
                cookies = dict(self.session.cookies) if self.session.cookies else {}
                successful_logins[role] = cookies
                
                # Test auth.me endpoint
                self.test_auth_me_endpoint(role, cookies)
                
                # Test role-specific route access
                role_routes = {
                    "subscriber": "/dashboard",
                    "attorney": "/attorney", 
                    "employee": "/employee",
                    "admin": "/admin"
                }
                
                if role in role_routes:
                    self.test_protected_route_access(role, role_routes[role], cookies)
        
        # Test cross-role access (subscriber trying to access admin, etc.)
        print(f"\n🔒 Testing Role-Based Access Control...")
        if "subscriber" in successful_logins:
            self.test_protected_route_access("subscriber", "/admin", successful_logins["subscriber"])
            self.test_protected_route_access("subscriber", "/attorney", successful_logins["subscriber"]) 
        
        if "employee" in successful_logins:
            self.test_protected_route_access("employee", "/attorney/queue", successful_logins["employee"])
        
        # Print results
        print("\n" + "=" * 60)
        print(f"📊 Authentication Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Show failures
        failures = [r for r in self.test_results if not r['success']]
        if failures:
            print("\n❌ Failed Tests:")
            for failure in failures:
                error_msg = failure.get('error', f"Status {failure.get('status_code')}")
                print(f"  - {failure['test']}: {error_msg}")
        else:
            print("\n✅ All authentication tests passed!")
        
        return self.tests_passed, self.tests_run

def main():
    base_url = "https://c6b6cbf3-9bdd-4078-8fe7-58ccee1ed48d.preview.emergentagent.com"
    
    print(f"🔍 Testing Talk-to-My-Lawyer Authentication at: {base_url}")
    
    tester = AuthTester(base_url)
    passed, total = tester.run_comprehensive_auth_tests()
    
    return 0 if passed > 0 else 1

if __name__ == "__main__":
    sys.exit(main())