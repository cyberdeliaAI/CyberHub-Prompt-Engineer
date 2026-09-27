# CyberHub Prompt Engineer

Build and rewrite image prompts with a local LM Studio model.

- Version: `1.3.1`
- Channel: `stable`
- Publisher: `official`

## Installation

1. Open **Module Manager** in CyberHub.
2. Click **Check for updates**.
3. Find **Prompt Engineer** and choose **Install** or **Update**.
4. Restart CyberHub when the installation finishes.

The ZIP attached to this repository's GitHub Release can also be imported manually through Settings.

## Shared AI connection

Choose **Central connection** in the connection panel to use **Settings → AI
connection** (Core 1.4.0 / Settings 1.5.0). An optional model override applies only
to Prompt Engineer. Leave it empty to inherit the central model. **Own
connection** retains a separate server and model. Choose where the connection
runs: **CyberHub computer** supports streaming through CyberHub; **Browser
computer** connects directly. `localhost` refers to the chosen computer.

**Detect Model** fills the full model ID; **Save connection** applies edits.
Detection tests the form without saving it. Generation uses saved settings and
refreshes them before each request, so central changes apply without restarting.

An existing browser connection is imported once into the module's own settings
if CyberHub has no saved module connection. Other browsers cannot overwrite it.
New setups inherit an already configured central connection. The own connection
is preserved when switching to central. Generation controls, image processing,
context and chat history remain browser preferences.

Updated Prompt Engineer also runs on Core 1.3.x with its own connection. There
is no mandatory Core update to continue using the module.

## Development tests

```sh
node --test tests/connection.test.cjs
python -m unittest discover -s tests -v
```

The Python integration tests use sibling CyberHub and CyberHub-Captioner
checkouts and the CyberHub Python environment (`requests` required). Set
`CYBERHUB_CORE` and `CYBERHUB_CAPTIONER` to select other checkouts, including an
older Core to verify compatibility. Tests use temporary settings and mock
model responses, without modifying an installed Hub.

## API keys (1.3.1)

The central connection inherits the API key saved in Settings. An own connection
has its own optional **API key** field, for example for oMLX authentication.
Leave it blank to keep the saved key; select **Remove saved API key** to delete it.
Changing the server address clears the old key unless you enter a new one.
Model detection and generation use the same key, including browser connections.
Keys are stored locally in CyberHub's `settings.json`, not in browser preferences.
A direct browser connection receives the key only when it needs to contact the server.

API-key support is included in 1.3.1. Update through **Module Manager → Check
for updates**, then restart. For a central API key, also install the revised
CyberHub 1.4.0 package. If Core 1.4.0 is already installed, reimport its current
ZIP through **Settings → Maintenance → Import update or module ZIP**, because
Core's version number remains unchanged.

## Python Packages

- `requests>=2.28`

## Privacy

CyberHub runs locally. A module uses an external service only when its function requires it and the user starts that action.

## License

See `LICENSE.md` and `THIRD-PARTY-NOTICES.md`.
