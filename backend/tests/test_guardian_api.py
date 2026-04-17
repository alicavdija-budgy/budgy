"""
Guardian Money CHF - Backend API Tests
Tests: Health, Coach IA, Family Mode, PDF Export, Budget Alerts
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not configured", allow_module_level=True)


class TestHealthCheck:
    """Health check endpoint"""

    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert data["app"] == "Guardian Money CHF"
        print(f"✓ Health check passed: {data}")


class TestCoachIA:
    """Coach IA - GPT-4o-mini powered financial advisor"""

    def test_coach_chat_basic(self):
        """Test basic chat with Coach IA"""
        payload = {
            "session_id": f"test_session_{os.urandom(4).hex()}",
            "message": "Bonjour, peux-tu m'aider avec mon budget?",
            "financial_context": "Revenus: CHF 6000/mois, Dépenses: CHF 4500/mois"
        }
        response = requests.post(f"{BASE_URL}/api/coach/chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "session_id" in data
        assert len(data["response"]) > 0
        print(f"✓ Coach IA response: {data['response'][:100]}...")

    def test_coach_chat_with_context(self):
        """Test chat with financial context"""
        session_id = f"test_ctx_{os.urandom(4).hex()}"
        payload = {
            "session_id": session_id,
            "message": "Combien devrais-je épargner par mois?",
            "financial_context": "Revenus: CHF 8000/mois, Dépenses: CHF 5000/mois, Épargne actuelle: CHF 20000"
        }
        response = requests.post(f"{BASE_URL}/api/coach/chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == session_id
        assert len(data["response"]) > 20
        print(f"✓ Coach IA with context: {data['response'][:100]}...")


class TestFamilyMode:
    """Family Mode - 8-char invitation codes"""

    def test_create_family(self):
        """Test family creation with 8-char code"""
        payload = {
            "owner_id": f"user_{os.urandom(4).hex()}",
            "owner_name": "Test User",
            "family_name": "Famille Test"
        }
        response = requests.post(f"{BASE_URL}/api/family/create", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "code" in data
        assert len(data["code"]) == 8
        assert data["code"].isupper()
        assert "family" in data
        assert data["family"]["name"] == "Famille Test"
        assert data["family"]["owner_name"] == "Test User"
        assert len(data["family"]["members"]) == 1
        print(f"✓ Family created with code: {data['code']}")
        return data["code"]

    def test_join_family(self):
        """Test joining a family with invitation code"""
        # First create a family
        create_payload = {
            "owner_id": f"owner_{os.urandom(4).hex()}",
            "owner_name": "Owner User",
            "family_name": "Test Family Join"
        }
        create_response = requests.post(f"{BASE_URL}/api/family/create", json=create_payload)
        assert create_response.status_code == 200
        code = create_response.json()["code"]

        # Now join the family
        join_payload = {
            "user_id": f"member_{os.urandom(4).hex()}",
            "user_name": "Member User",
            "code": code
        }
        join_response = requests.post(f"{BASE_URL}/api/family/join", json=join_payload)
        assert join_response.status_code == 200
        data = join_response.json()
        assert "family" in data
        assert len(data["family"]["members"]) == 2
        print(f"✓ Successfully joined family with code: {code}")

    def test_join_invalid_code(self):
        """Test joining with invalid code"""
        payload = {
            "user_id": "test_user",
            "user_name": "Test User",
            "code": "INVALID1"
        }
        response = requests.post(f"{BASE_URL}/api/family/join", json=payload)
        assert response.status_code == 404
        print("✓ Invalid code correctly rejected")

    def test_get_family(self):
        """Test retrieving family info"""
        # Create family first
        create_payload = {
            "owner_id": f"owner_{os.urandom(4).hex()}",
            "owner_name": "Owner",
            "family_name": "Get Test Family"
        }
        create_response = requests.post(f"{BASE_URL}/api/family/create", json=create_payload)
        code = create_response.json()["code"]

        # Get family info
        response = requests.get(f"{BASE_URL}/api/family/{code}")
        assert response.status_code == 200
        data = response.json()
        assert "family" in data
        assert data["family"]["code"] == code
        print(f"✓ Retrieved family info for code: {code}")


class TestPDFExport:
    """PDF Export - A4 expense reports with TVA 8.1%"""

    def test_pdf_export_basic(self):
        """Test PDF export with basic expenses"""
        payload = {
            "user_name": "Jean Dupont",
            "company": "Test Company SA",
            "expenses": [
                {"date": "2026-01-15", "title": "Restaurant client", "category": "restaurant", "amount": 120.50, "justification": "Réunion client"},
                {"date": "2026-01-16", "title": "Taxi", "category": "transport", "amount": 45.00, "justification": "Déplacement professionnel"},
                {"date": "2026-01-17", "title": "Fournitures", "category": "materiel", "amount": 89.90, "justification": "Matériel bureau"}
            ],
            "mode": "employee",
            "canton": "VD",
            "period": "Janvier 2026"
        }
        response = requests.post(f"{BASE_URL}/api/export/pdf", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "html" in data
        assert "total_ht" in data
        assert "total_tva" in data
        assert "total_ttc" in data
        assert data["count"] == 3
        
        # Verify TVA calculation (8.1%)
        expected_ht = 120.50 + 45.00 + 89.90
        assert abs(data["total_ht"] - expected_ht) < 0.01
        expected_tva = round(expected_ht * 8.1 / 100, 2)
        assert abs(data["total_tva"] - expected_tva) < 0.01
        
        # Verify HTML contains TVA 8.1%
        assert "8.1" in data["html"]
        assert "TVA 8.1%" in data["html"]
        print(f"✓ PDF export: HT={data['total_ht']}, TVA={data['total_tva']}, TTC={data['total_ttc']}")

    def test_pdf_export_empty(self):
        """Test PDF export with no expenses"""
        payload = {
            "user_name": "Test User",
            "expenses": [],
            "mode": "independent",
            "canton": "GE"
        }
        response = requests.post(f"{BASE_URL}/api/export/pdf", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["total_ht"] == 0
        assert data["total_tva"] == 0
        assert data["count"] == 0
        print("✓ PDF export with empty expenses works")


class TestBudgetAlerts:
    """Budget Alerts - Detect budget exceeded, warnings, and spending pace"""

    def test_budget_exceeded_alert(self):
        """Test alert when budget is exceeded"""
        payload = {
            "user_id": "test_user_1",
            "budgets": [
                {"category": "courses", "limit": 500}
            ],
            "expenses": [
                {"category": "courses", "amount": 300},
                {"category": "courses", "amount": 250}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/alerts/check-budgets", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "alerts" in data
        assert data["count"] > 0
        
        # Should have budget_exceeded alert
        exceeded_alerts = [a for a in data["alerts"] if a["type"] == "budget_exceeded"]
        assert len(exceeded_alerts) > 0
        alert = exceeded_alerts[0]
        assert alert["category"] == "courses"
        assert alert["spent"] == 550
        assert alert["limit"] == 500
        assert alert["percentage"] >= 100
        print(f"✓ Budget exceeded alert: {alert['title']}")

    def test_budget_warning_alert(self):
        """Test warning when budget is at 80%+"""
        payload = {
            "user_id": "test_user_2",
            "budgets": [
                {"category": "restaurant", "limit": 400}
            ],
            "expenses": [
                {"category": "restaurant", "amount": 340}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/alerts/check-budgets", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["count"] > 0
        
        # Should have budget_warning alert
        warning_alerts = [a for a in data["alerts"] if a["type"] == "budget_warning"]
        assert len(warning_alerts) > 0
        alert = warning_alerts[0]
        assert alert["percentage"] >= 80
        assert alert["percentage"] < 100
        print(f"✓ Budget warning alert: {alert['title']}")

    def test_no_alerts_under_budget(self):
        """Test no alerts when under budget"""
        payload = {
            "user_id": "test_user_3",
            "budgets": [
                {"category": "transport", "limit": 200}
            ],
            "expenses": [
                {"category": "transport", "amount": 50}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/alerts/check-budgets", json=payload)
        assert response.status_code == 200
        data = response.json()
        # May have spending_pace alert but not exceeded/warning
        exceeded = [a for a in data["alerts"] if a["type"] in ["budget_exceeded", "budget_warning"]]
        assert len(exceeded) == 0
        print("✓ No critical alerts when under budget")

    def test_get_alerts(self):
        """Test retrieving stored alerts"""
        user_id = f"test_user_{os.urandom(4).hex()}"
        
        # First create some alerts
        payload = {
            "user_id": user_id,
            "budgets": [{"category": "courses", "limit": 300}],
            "expenses": [{"category": "courses", "amount": 350}]
        }
        requests.post(f"{BASE_URL}/api/alerts/check-budgets", json=payload)
        
        # Now retrieve them
        response = requests.get(f"{BASE_URL}/api/alerts/{user_id}")
        assert response.status_code == 200
        data = response.json()
        assert "alerts" in data
        assert data["count"] > 0
        print(f"✓ Retrieved {data['count']} alerts for user")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
