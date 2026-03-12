#!/usr/bin/env python3
"""
Test script to debug SMTP email issues
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FROM_EMAIL = os.getenv("FROM_EMAIL")


def test_smtp_connection():
    """Test SMTP connection and send a test email."""

    print("🔍 Testing SMTP Configuration")
    print(f"Server: {SMTP_SERVER}:{SMTP_PORT}")
    print(f"Username: {SMTP_USERNAME}")
    print(f"From Email: {FROM_EMAIL}")
    print(f"Password: {'*' * len(SMTP_PASSWORD) if SMTP_PASSWORD else 'NOT SET'}")
    print("-" * 50)

    if not SMTP_USERNAME or not SMTP_PASSWORD:
        print("❌ SMTP credentials not configured!")
        return False

    try:
        print("📡 Connecting to SMTP server...")
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)

        print("🔐 Starting TLS...")
        server.starttls()

        print("🔑 Attempting login...")
        server.login(SMTP_USERNAME, SMTP_PASSWORD)

        print("✅ SMTP connection successful!")

        # Send test email
        test_email = input("Enter email to send test to (or press Enter to skip): ").strip()

        if test_email:
            print(f"📧 Sending test email to {test_email}...")

            msg = MIMEMultipart()
            msg["From"] = FROM_EMAIL
            msg["To"] = test_email
            msg["Subject"] = "Test Email from Todo App"

            body = """
This is a test email from your Todo App SMTP configuration.

If you received this, your email setup is working correctly!

Time: """ + str(__import__("datetime").datetime.now())

            msg.attach(MIMEText(body, "plain"))

            server.sendmail(FROM_EMAIL, test_email, msg.as_string())
            print("✅ Test email sent successfully!")
            print("📝 Check inbox (and spam folder) for the test email")

        server.quit()
        return True

    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ Authentication failed: {e}")
        print("💡 Check:")
        print("   - 2FA is enabled on the Gmail account")
        print("   - App password is generated correctly")
        print("   - Using app password, not regular password")
        return False

    except smtplib.SMTPConnectError as e:
        print(f"❌ Connection failed: {e}")
        print("💡 Check:")
        print("   - Internet connection")
        print("   - Gmail SMTP settings")
        return False

    except Exception as e:
        print(f"❌ Unexpected error: {type(e).__name__}: {e}")
        return False


if __name__ == "__main__":
    test_smtp_connection()
