# Security Policy

X Data Scraper is a local-first Chrome extension. Security and privacy issues are especially important because the project runs in the browser and handles user-collected content.

## Reporting a vulnerability

If you find a security issue or a privacy-sensitive bug, please do not disclose it publicly at first.

Open a private security advisory on GitHub if available, or contact the maintainer through GitHub.

Please include:

- A clear description of the issue
- Steps to reproduce
- Affected browser or extension version
- Whether the issue affects permissions, storage, network requests, data export, or page injection behavior
- Any suggested mitigation, if you have one

## Security scope

Issues worth reporting include:

- Unexpected data exfiltration
- Unsafe network requests
- Excessive or unnecessary permissions
- Cross-site scripting risks in the extension UI
- Unsafe handling of copied or exported data
- Bugs that expose locally stored data unexpectedly
- Behavior that could mislead users about where their data is stored

## Responsible-use boundary

This project must not be used for credential collection, spam, harassment, privacy-invasive monitoring, or unauthorized access.

Contributions that change permissions, host access, storage behavior, export behavior, or network behavior should explain their security and privacy impact clearly.
