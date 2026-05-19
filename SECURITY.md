# Security Policy

## Reporting Security Vulnerabilities

Security is important to us. If you discover a security vulnerability in GestEffect, please report it responsibly to protect our users.

### How to Report

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, email security details to the project maintainers with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### What to Expect

- Acknowledgment within 48 hours
- Regular updates on progress
- Credit for the discovery (if desired)
- A reasonable timeline for a fix before public disclosure

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Yes    |

## Security Best Practices

When using GestEffect:

1. **Keep dependencies updated**: Run `pip install --upgrade -r requirements.txt`
2. **Review permissions**: Ensure webcam access is appropriate
3. **Local deployment**: By default runs on localhost only
4. **Network access**: Only enable network access if needed
5. **Data handling**: GestEffect doesn't transmit or store data by default

## Known Limitations

- Webcam access requires user consent
- No built-in encryption for network transmission
- Should be deployed on trusted networks only

## Security Updates

Follow our GitHub repository for security announcements and updates.

## Questions?

For security-related questions (not vulnerability reports), contact the maintainers.

Thank you for helping keep GestEffect secure! 🔒
