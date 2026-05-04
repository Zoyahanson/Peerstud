"""
Create Supabase Auth users for seeded demo accounts.
This script uses the Supabase Admin API to batch-create authentication identities.
"""

import os
import sys
from pathlib import Path
import requests
import json

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

# Load environment variables from backend/.env
from dotenv import load_dotenv
load_dotenv(backend_path / ".env")

# Seeded user credentials
SEEDED_USERS = [
    {
        "email": "alana.morgan@mymona.uwi.edu",
        "password": "peerstud123!",
        "user_metadata": {"first_name": "Alana", "last_name": "Morgan"},
    },
    {
        "email": "dwayne.brown@mymona.uwi.edu",
        "password": "peerstud123!",
        "user_metadata": {"first_name": "Dwayne", "last_name": "Brown"},
    },
    {
        "email": "kayla.reid@uwi.edu.jm",
        "password": "peerstud123!",
        "user_metadata": {"first_name": "Kayla", "last_name": "Reid"},
    },
    {
        "email": "malik.thomas@mymona.uwi.edu",
        "password": "peerstud123!",
        "user_metadata": {"first_name": "Malik", "last_name": "Thomas"},
    },
]


def create_auth_users():
    """Create Supabase Auth users for seeded accounts."""
    
    # Get environment variables
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not supabase_service_role_key:
        print("❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        print("   Set these in your .env file")
        return False
    
    # Supabase Admin API endpoint
    admin_url = f"{supabase_url}/auth/v1/admin/users"
    print(f"📍 Using URL: {admin_url}")
    print(f"📍 Service Role Key (first 20 chars): {supabase_service_role_key[:20]}...")
    
    headers = {
        "apikey": supabase_service_role_key,
        "Authorization": f"Bearer {supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    
    results = []
    
    for user_data in SEEDED_USERS:
        email = user_data["email"]
        password = user_data["password"]
        
        print(f"\n📧 Creating Auth user for {email}...")
        
        try:
            # Prepare user creation payload
            payload = {
                "email": email,
                "password": password,
                "email_confirm": True,  # Auto-confirm email for demo
                "user_metadata": user_data.get("user_metadata", {}),
            }
            
            # Create the Auth user via REST API
            response = requests.post(admin_url, json=payload, headers=headers)
            
            print(f"   Response Status: {response.status_code}")
            if response.status_code not in (200, 201):
                print(f"   Response Text: {response.text[:200]}")
            
            if response.status_code in (200, 201):
                resp_data = response.json()
                user_id = resp_data.get("id", "unknown")
                print(f"   ✅ Created successfully")
                print(f"   ID: {user_id}")
                results.append({
                    "email": email,
                    "status": "created",
                    "auth_id": user_id,
                })
            elif response.status_code == 422 and "already exists" in response.text.lower():
                print(f"   ⚠️  User already exists in Auth, skipping")
                results.append({
                    "email": email,
                    "status": "skipped",
                    "reason": "already_exists",
                })
            else:
                try:
                    error_data = response.json()
                    error_msg = error_data.get("message", str(error_data))
                except:
                    error_msg = response.text
                print(f"   ❌ Error: {error_msg}")
                results.append({
                    "email": email,
                    "status": "failed",
                    "error": error_msg,
                })
            
        except Exception as e:
            error_msg = str(e)
            print(f"   ❌ Error: {error_msg}")
            results.append({
                "email": email,
                "status": "failed",
                "error": error_msg,
            })
    
    # Print summary
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    
    created = [r for r in results if r["status"] == "created"]
    skipped = [r for r in results if r["status"] == "skipped"]
    failed = [r for r in results if r["status"] == "failed"]
    
    print(f"✅ Created: {len(created)}")
    print(f"⚠️  Skipped: {len(skipped)}")
    print(f"❌ Failed: {len(failed)}")
    
    if failed:
        print("\nFailed users:")
        for r in failed:
            print(f"  - {r['email']}: {r['error']}")
    
    print("\n💡 Next steps:")
    print("   1. Try logging in with any of these credentials:")
    for user in SEEDED_USERS:
        print(f"      Email: {user['email']}")
        print(f"      Password: {user['password']}")
    print("\n   2. You should be redirected to /dashboard after login")
    
    return len(failed) == 0


if __name__ == "__main__":
    success = create_auth_users()
    sys.exit(0 if success else 1)
