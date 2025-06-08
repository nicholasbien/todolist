# Manual Tests

These tests require user interaction and cannot be automated.

## Files

- `auth_manual.py` - Interactive authentication test with manual verification code input
- `email_manual.py` - Email functionality test (requires SMTP configuration)

## Usage

Make sure the backend server is running before executing these tests:

```bash
# Start backend server (Terminal 1)
cd backend
source venv/bin/activate
python app.py

# Run manual tests (Terminal 2)
cd backend
source venv/bin/activate

# Interactive test
python manual_tests/auth_manual.py

# Email test (requires SMTP config)
python manual_tests/email_manual.py
```

## Notes

- These tests are excluded from pytest discovery
- Verification codes are printed to the backend server console
- Email tests require proper SMTP configuration in `.env`
