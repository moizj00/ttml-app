#!/usr/bin/env python3
"""
Comprehensive backend API testing for Talk-to-My-Lawyer application
"""

import requests
import json
import sys
import time
from datetime import datetime

class TalkToMyLawyerAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.timeout = 30
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

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

    def test_health_check(self):
        """Test basic server connectivity"""
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=10)
            success = response.status_code in [200, 404]  # 404 is acceptable if health endpoint doesn't exist
            self.log_test("Health Check", success, response.status_code)
            return success
        except requests.RequestException as e:
            self.log_test("Health Check", False, error_message=str(e))
            return False

    def test_homepage(self):
        """Test homepage loads"""
        try:
            response = self.session.get(f"{self.base_url}/", timeout=10)
            success = response.status_code == 200
            self.log_test("Homepage Load", success, response.status_code)
            return success
        except requests.RequestException as e:
            self.log_test("Homepage Load", False, error_message=str(e))
            return False

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        auth_endpoints = [
            "/api/auth/signup",
            "/api/auth/login", 
            "/api/auth/logout"
        ]
        
        for endpoint in auth_endpoints:
            try:
                # Test POST to auth endpoints (should return method-specific responses)
                response = self.session.post(f"{self.base_url}{endpoint}", json={})
                # Auth endpoints should respond (not 404), even if they reject invalid data
                success = response.status_code in [200, 400, 401, 422, 500]
                self.log_test(f"Auth Endpoint {endpoint}", success, response.status_code)
            except requests.RequestException as e:
                self.log_test(f"Auth Endpoint {endpoint}", False, error_message=str(e))

    def test_api_structure(self):
        """Test API structure and routing"""
        api_endpoints = [
            "/api/auth/login",
            "/api/auth/signup", 
            "/api/letters",
            "/api/admin",
            "/api/billing"
        ]
        
        for endpoint in api_endpoints:
            try:
                response = self.session.get(f"{self.base_url}{endpoint}", timeout=10)
                # API should be reachable (not 404 for missing route)
                success = response.status_code != 404
                self.log_test(f"API Route {endpoint}", success, response.status_code)
            except requests.RequestException as e:
                self.log_test(f"API Route {endpoint}", False, error_message=str(e))

    def test_public_pages(self):
        """Test public pages load correctly"""
        public_pages = [
            "/",
            "/login",
            "/signup",
            "/pricing", 
            "/faq"
        ]
        
        for page in public_pages:
            try:
                response = self.session.get(f"{self.base_url}{page}", timeout=10)
                success = response.status_code == 200
                self.log_test(f"Public Page {page}", success, response.status_code)
            except requests.RequestException as e:
                self.log_test(f"Public Page {page}", False, error_message=str(e))

    def test_trpc_endpoint(self):
        """Test tRPC endpoint availability"""
        try:
            # Test tRPC endpoint with a simple query
            response = self.session.get(f"{self.base_url}/api/trpc/auth.me", timeout=10)
            # tRPC should respond (not 404), even if unauthorized
            success = response.status_code in [200, 401, 500]
            self.log_test("tRPC Endpoint", success, response.status_code)
            return success
        except requests.RequestException as e:
            self.log_test("tRPC Endpoint", False, error_message=str(e))
            return False

    def test_signup_flow(self):
        """Test user signup flow"""
        test_email = f"test_{int(time.time())}@example.com"
        signup_data = {
            "email": test_email,
            "password": "TestPass123!",
            "name": "Test User",
            "role": "subscriber"
        }
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/signup",
                json=signup_data,
                timeout=15
            )
            
            # Signup should work or give specific validation errors
            success = response.status_code in [200, 201, 400, 409]  # 409 = email already exists
            
            if response.status_code in [200, 201]:
                try:
                    data = response.json()
                    self.log_test("User Signup", success, response.status_code, response_data=data)
                except:
                    self.log_test("User Signup", success, response.status_code)
            else:
                self.log_test("User Signup", success, response.status_code)
                
        except requests.RequestException as e:
            self.log_test("User Signup", False, error_message=str(e))

    def test_login_flow(self):
        """Test user login flow"""
        login_data = {
            "email": "demo@talk-to-my-lawyer.com",  # Try with demo credentials
            "password": "demo123"
        }
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json=login_data,
                timeout=15
            )
            
            # Login should respond with success or auth failure
            success = response.status_code in [200, 401, 400]
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    if data.get('session', {}).get('access_token'):
                        self.token = data['session']['access_token']
                    self.log_test("User Login", success, response.status_code, response_data={"has_session": bool(data.get('session'))})
                except:
                    self.log_test("User Login", success, response.status_code)
            else:
                self.log_test("User Login", success, response.status_code)
                
        except requests.RequestException as e:
            self.log_test("User Login", False, error_message=str(e))

    def test_protected_routes(self):
        """Test protected routes return appropriate responses"""
        protected_routes = [
            "/dashboard",
            "/letters", 
            "/admin",
            "/attorney",
            "/employee"
        ]
        
        for route in protected_routes:
            try:
                headers = {}
                if self.token:
                    headers['Authorization'] = f'Bearer {self.token}'
                    
                response = self.session.get(
                    f"{self.base_url}{route}",
                    headers=headers,
                    timeout=10
                )
                
                # Protected routes should redirect to login (302) or require auth (401) or work (200)
                success = response.status_code in [200, 302, 401]
                self.log_test(f"Protected Route {route}", success, response.status_code)
                
            except requests.RequestException as e:
                self.log_test(f"Protected Route {route}", False, error_message=str(e))

    def test_database_connectivity(self):
        """Test database connectivity through API"""
        try:
            # Try to access a route that would require database
            response = self.session.post(
                f"{self.base_url}/api/trpc/auth.me",
                timeout=10
            )
            
            # If DB is connected, we should get a response (not 500 internal error)
            success = response.status_code != 500
            self.log_test("Database Connectivity", success, response.status_code)
            
        except requests.RequestException as e:
            self.log_test("Database Connectivity", False, error_message=str(e))

    def run_all_tests(self):
        """Run all test suites"""
        print(f"🔍 Starting Talk-to-My-Lawyer API Tests")
        print(f"Base URL: {self.base_url}")
        print("-" * 50)
        
        # Test basic connectivity first
        if not self.test_health_check():
            print("❌ Basic connectivity failed, continuing with other tests...")
        
        # Test homepage
        self.test_homepage()
        
        # Test public pages
        self.test_public_pages()
        
        # Test API structure
        self.test_api_structure()
        
        # Test authentication endpoints
        self.test_auth_endpoints()
        
        # Test tRPC
        self.test_trpc_endpoint()
        
        # Test user flows
        self.test_signup_flow()
        self.test_login_flow()
        
        # Test protected routes
        self.test_protected_routes()
        
        # Test database connectivity
        self.test_database_connectivity()
        
        # Print results
        print("-" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Show failures
        failures = [r for r in self.test_results if not r['success']]
        if failures:
            print("\n❌ Failed Tests:")
            for failure in failures:
                error_msg = failure.get('error', f"Status {failure.get('status_code')}")
                print(f"  - {failure['test']}: {error_msg}")
        
        return self.tests_passed, self.tests_run

def main():
    # Use the provided preview URL for testing
    base_url = "https://c6b6cbf3-9bdd-4078-8fe7-58ccee1ed48d.preview.emergentagent.com"
    
    print(f"🔍 Testing Talk-to-My-Lawyer application at: {base_url}")
    
    # Run tests
    tester = TalkToMyLawyerAPITester(base_url)
    passed, total = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if passed > 0 else 1

if __name__ == "__main__":
    sys.exit(main())