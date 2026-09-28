# Prompt Engineer prompt files

Add your UTF-8 `.txt` or `.md` system prompts to Krea2, ZIT, or another subfolder.
The sidebar's Collection selector follows the folder structure. Click Refresh
to scan again, or reload Prompt Engineer. Subfolders can be nested.

Plain text defaults to Rewrite; a separate word Vision in the filename enables
image input. For explicit metadata use a `.json` file with title, mode and text:

```json
{"title": "My prompt", "mode": "generate", "text": "Your system instructions"}
```

Valid modes: vision, rewrite, generate. Files must be at most 256 KB. README,
hidden files and symbolic links are ignored. Keep personal variations under
new filenames so module updates do not replace bundled files you have changed.
The ten bundled Krea2 and ZIT presets retain the original user-supplied text.
