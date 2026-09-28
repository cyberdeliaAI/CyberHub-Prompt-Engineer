# CyberHub Prompt Engineer

Build and rewrite image prompts with a local LM Studio model.

- Version: `1.4.0`
- Channel: `stable`
- Publisher: `official`

## Installation

1. Open **Module Manager** in CyberHub.
2. Click **Check for updates**.
3. Find **Prompt Engineer** and choose **Install** or **Update**.
4. Restart CyberHub when the installation finishes.

The ZIP attached to this repository's GitHub Release can also be imported manually through Settings.

## Shared AI connection

Open **Settings** (or click the compact **Connection** card) and choose **Central connection** to use **Settings → AI
connection** (Core 1.4.0 / Settings 1.5.0). An optional model override applies only
to Prompt Engineer. Leave it empty to inherit the central model. **Own
connection** retains a separate server and model. Choose where the connection
runs: **CyberHub computer** supports streaming through CyberHub; **Browser
computer** connects directly. `localhost` refers to the chosen computer.

**Detect Model** fills the full model ID; **Save settings** applies edits.
Detection tests the form without saving it. Generation uses saved settings and
refreshes them before each request, so central changes apply without restarting.

An existing browser connection is imported once into the module's own settings
if CyberHub has no saved module connection. Other browsers cannot overwrite it.
New setups inherit an already configured central connection. The own connection
is preserved when switching to central. Generation controls, image processing,
context and chat history remain browser preferences.

Updated Prompt Engineer also runs on Core 1.3.x with its own connection. There
is no mandatory Core update to continue using the module.

## Workspace and prompt folders (1.4.0)

The sidebar now starts with a compact connection summary, followed by system
prompts. **Settings** in the chat header and the **Connection** card open the
same dialog. Server, API key, connection source/location, model, context limit
and generation overrides are all in that dialog. **Save settings** applies
changes; **Cancel**, Escape and the backdrop discard them. Detection and
**Clear overrides** edit the draft only. Unsaved overrides are not sent to the
model or stored, even when leaving the page. Generation overrides and context
remain browser preferences; connection settings remain stored by CyberHub.

**Collection** separates built-in prompts, browser-saved **My prompts**, and
folders on the CyberHub computer. Search filters the current collection;
browsing does not change the active prompt. Selecting a different prompt clears
chat context, as before. Edited prompt text and the selected preset survive a
page reload in the same browser. **Add** still creates a browser-saved preset.
Only these custom presets can be deleted in the UI; file presets are managed
on disk. Older `prompts.json` imports remain available in their own collection.

The module includes the user's ten original presets, unchanged, in:

```text
resources/prompt-engineer/prompts/
├── Krea2/   (five presets)
└── ZIT/     (five presets)
```

Create additional subfolders here and add UTF-8 `.txt` or `.md` files. The
filename becomes the title; the relative folder becomes the collection, even
for nested folders. **Refresh** reads additions, edits and removals without a
Hub restart. A page reload also scans automatically. These files are read from
the CyberHub computer, not from the browser computer. No separate Prompt Library
module is required. To use the preview editor for a permanent variation, copy
the text into a new file or create a custom preset with **Add**.

Plain text presets default to **Rewrite**. A separate word `Vision` in the
filename selects image input (including the two supplied Vision Illustration
presets). For explicit title/mode metadata, use a `.json` file instead:

```json
{
  "title": "My scene builder",
  "mode": "generate",
  "text": "Write one image prompt from the supplied description."
}
```

Modes are `vision`, `rewrite` and `generate`. Files are prompt data, never
executable code. Duplicate titles in different folders have separate identities.
Empty, malformed, non-UTF-8 and over-256-KB files are skipped with a status note;
hover that note for details. Hidden files/folders, symbolic links and README
files are ignored. Existing prompts remain usable if a refresh fails. Refresh
keeps hand edits and ongoing chat; an unedited prompt in an empty chat picks up
its latest file text. If the selected file disappears, its editor draft is kept
under **Unavailable files** until another prompt is chosen.

Use your own filenames or an extra subfolder for variations: later module
updates can replace bundled files with the same paths. Browser data is local to
the browser/origin and is lost when browser storage is cleared.

### Local installable package

```sh
python3 tools/build_test_package.py --output /path/to/packages
```

Import `cyberhub_module_prompt_engineer_v1.4.0.zip` through **Settings →
Maintenance → Import update or module ZIP**, then restart CyberHub. This package
contains only this module, its offline assets, the prompt folders and the
package manifest. Creating a package does not publish a GitHub release or update
the Module Manager catalog.

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

Validation for 1.4.0: 19 browser-logic tests and 20 Python tests pass on macOS
with Core 1.4.2. Browser checks cover both dialog triggers, save/cancel/Escape,
central/own fields, search, Vision selection, refresh and edited-text recovery,
plus desktop/mobile and dark/light layout. Model calls in tests are mocked;
no live model generation was verified. Core's ZIP import planner accepts the
package, and all ten shipped prompt files match the originals byte for byte.

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
