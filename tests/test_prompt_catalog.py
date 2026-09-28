"""Prompt-file discovery uses temporary resources and never calls a model."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from test_connection_integration import pe, Handler


class PromptCatalogTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.resources = Path(temp.name)
        self.root = self.resources / 'prompt-engineer/prompts'
        self.module = pe.PromptEngineerModule(SimpleNamespace(resources_dir=temp.name))

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        return path

    def catalog(self):
        handler = Handler(None)
        self.module._get_prompts(handler, {})
        return handler.response

    def test_missing_folder_is_optional(self):
        self.assertEqual(self.catalog(), {'prompts': [], 'warnings': []})

    def test_nested_paths_duplicate_titles_and_vision_mode(self):
        self.write('Krea2/Cinematic.txt', '\ufeffLine one\nLine two\n')
        self.write('ZIT/Cinematic.txt', 'Other model instructions')
        self.write('Krea2/Illustrations/Vision Sketch.md', 'Image instructions')
        self.write('Krea2/Readme.txt', 'Documentation is not a preset')
        items = self.catalog()['prompts']
        self.assertEqual(len(items), 3)
        self.assertEqual(len({item['id'] for item in items}), 3)
        self.assertEqual(items[0]['text'], 'Line one\nLine two\n')
        self.assertEqual(items[0]['mode'], 'rewrite')
        vision = next(item for item in items if item['mode'] == 'vision')
        self.assertEqual(vision['folder'], 'Krea2/Illustrations')

    def test_structured_mode_overrides_filename_and_preserves_text(self):
        self.write('Custom/Vision name.json', json.dumps({'title':'Story builder','mode':'generate','text':'Exact instructions\n'}))
        item = self.catalog()['prompts'][0]
        self.assertEqual((item['title'], item['mode'], item['text']), ('Story builder', 'generate', 'Exact instructions\n'))

    def test_bad_files_are_reported_without_losing_valid_files(self):
        self.write('Good.txt', 'Valid text')
        self.write('Empty.txt', ' \n')
        self.write('Broken.json', '{')
        self.write('Mode.json', json.dumps({'text':'text','mode':'execute'}))
        self.write('InvalidMode.json', json.dumps({'text':'text','mode':[]}))
        self.write('Big.txt', 'a' * (256 * 1024 + 1))
        self.write('Bytes.txt', 'placeholder').write_bytes(b'\xff')
        self.write('.hidden.txt', 'Hidden')
        self.write('.private/Secret.txt', 'Hidden')
        data = self.catalog()
        self.assertEqual(len(data['prompts']), 1)
        self.assertEqual(len(data['warnings']), 6)

    def test_symlinks_cannot_read_outside_catalog(self):
        external = self.resources / 'private.txt'
        external.write_text('Not a prompt')
        self.write('Good.txt', 'Visible')
        (self.root / 'linked.txt').symlink_to(external)
        (self.root / 'linked-folder').symlink_to(self.resources, target_is_directory=True)
        self.assertEqual([item['title'] for item in self.catalog()['prompts']], ['Good'])

    def test_add_edit_delete_are_seen_without_restart(self):
        path = self.write('Krea2/Test.txt', 'Before')
        self.assertEqual(self.catalog()['prompts'][0]['text'], 'Before')
        path.write_text('After')
        self.assertEqual(self.catalog()['prompts'][0]['text'], 'After')
        path.unlink()
        self.assertEqual(self.catalog()['prompts'], [])

    def test_shipped_catalog_contains_ten_presets_with_two_vision_prompts(self):
        repo = Path(__file__).resolve().parents[1]
        self.module.assets_dir = str(repo / 'resources/prompt-engineer')
        data = self.catalog()
        self.assertEqual(len(data['prompts']), 10)
        self.assertFalse(data['warnings'])
        self.assertEqual({p['folder'] for p in data['prompts']}, {'Krea2', 'ZIT'})
        self.assertEqual(sum(p['mode'] == 'vision' for p in data['prompts']), 2)
