"""Cross-repository tests. CYBERHUB_CORE / CYBERHUB_CAPTIONER may select other checkouts."""
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

repos = Path(__file__).resolve().parents[2]
core_repo = Path(os.environ.get('CYBERHUB_CORE', repos / 'CyberHub'))
captioner_repo = Path(os.environ.get('CYBERHUB_CAPTIONER', repos / 'CyberHub-Captioner'))
if not (core_repo / 'core/server.py').is_file() or not (captioner_repo / 'modules/captioner/__init__.py').is_file():
    raise unittest.SkipTest('Set CYBERHUB_CORE and CYBERHUB_CAPTIONER to run cross-repository tests.')
sys.path.insert(0, str(core_repo))
from core.server import Settings
try:
    from core.ai_connection import AIConnection
except ImportError:
    AIConnection = None
try:
    import requests
except ImportError:
    raise unittest.SkipTest('Run with the CyberHub Python environment (requests required).')


def load(name, source):
    spec = importlib.util.spec_from_file_location(name, source)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pe = load('pe_connection_test', Path(__file__).parents[1] / 'modules/prompt_engineer/__init__.py')
cap = load('cap_connection_test', captioner_repo / 'modules/captioner/__init__.py')


class Handler:
    def __init__(self, data):
        self.data = data
        self.status = 200
        self.wfile = io.BytesIO()
        self.headers_sent = {}
    def read_body_json(self, length): return self.data
    def respond_json(self, data, status=200): self.response, self.status = data, status
    def send_response(self, status): self.status = status
    def send_header(self, key, value): self.headers_sent[key] = value
    def end_headers(self): pass


class ModuleConnectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Settings(str(Path(self.temp.name) / 'settings.json'))
        self.hub = SimpleNamespace(settings=self.store, resources_dir=self.temp.name)
        if AIConnection:
            self.hub.ai_connection = AIConnection(self.store)
        self.pe = pe.PromptEngineerModule(self.hub)
        self.cap = cap.CaptionerModule(self.hub)

    def call(self, module, method, data):
        handler = Handler(data)
        getattr(module, method)(handler, 0, 'application/json')
        return handler

    def own(self, module, **kwargs):
        return self.call(module, '_save_config', {'connection_mode':'custom', 'api_url':'http://own/v1/', 'model':'vendor/own', 'transport':'hub', **kwargs})

    def test_own_connections_save_and_generate_without_shared_service(self):
        if hasattr(self.hub, 'ai_connection'): del self.hub.ai_connection
        for module in (self.cap, self.pe):
            self.assertEqual(self.own(module).status, 200)
            cfg = module._get_cfg()
            self.assertFalse(cfg['central_available'])
            self.assertEqual(cfg['api_url'], 'http://own/v1')
            self.assertEqual(cfg['model'], 'vendor/own')
            result = self.call(module, '_save_config', {'connection_mode':'shared'})
            self.assertEqual(result.status, 400)
            self.assertEqual(module._get_cfg()['model'], 'vendor/own')

    def test_captioner_partial_save_preserves_connection(self):
        self.own(self.cap)
        result = self.call(self.cap, '_save_config', {'temperature':0.2})
        self.assertEqual(result.status, 200)
        self.assertEqual(self.cap._get_cfg()['api_url'], 'http://own/v1')
        self.assertEqual(self.cap._get_cfg()['model'], 'vendor/own')
        self.assertEqual(self.cap._get_cfg()['temperature'], 0.2)

    def test_browser_migration_cannot_overwrite_saved_connection(self):
        self.own(self.pe)
        handler = self.call(self.pe, '_save_config', {'initialize_only':True, 'connection_mode':'custom', 'api_url':'http://stale', 'model':'stale'})
        self.assertEqual(handler.status, 200)
        self.assertEqual(self.pe._get_cfg()['model'], 'vendor/own')

    @unittest.skipUnless(AIConnection, 'Old Core intentionally has no shared service')
    def test_both_modules_share_default_and_keep_custom_backups(self):
        self.hub.ai_connection.save({'api_url':'http://shared', 'model':'vendor/shared'})
        for module in (self.cap, self.pe):
            self.own(module)
            result = self.call(module, '_save_config', {'connection_mode':'shared', 'shared_model':''})
            self.assertEqual(result.status, 200)
            cfg = module._get_cfg()
            self.assertEqual(cfg['model'], 'vendor/shared')
            self.assertEqual(cfg['custom']['model'], 'vendor/own')
            self.assertEqual(cfg['api_url'], 'http://shared/v1')
        self.hub.ai_connection.save({'api_url':'http://changed', 'model':'vendor/changed', 'transport':'browser'})
        self.assertEqual(self.cap._get_cfg()['transport'], 'browser')
        self.assertEqual(self.pe._get_cfg()['model'], 'vendor/changed')

    @unittest.skipUnless(AIConnection, 'Old Core intentionally has no shared service')
    def test_captioner_shared_payload_keeps_generation_overrides(self):
        self.own(self.cap, temperature=0.3)
        self.hub.ai_connection.save({'api_url':'http://shared', 'model':'vendor/shared'})
        self.call(self.cap, '_save_config', {'connection_mode':'shared', 'shared_model':'vendor/caption'})
        response = Mock(ok=True)
        response.json.return_value = {'choices':[{'message':{'content':'A caption'}}]}
        with patch('requests.post', return_value=response) as post:
            result = self.call(self.cap, '_caption', {'image_b64':'test', 'media_type':'image/png'})
        self.assertEqual(result.response['caption'], 'A caption')
        self.assertEqual(post.call_args.args[0], 'http://shared/v1/chat/completions')
        self.assertEqual(post.call_args.kwargs['json']['model'], 'vendor/caption')
        self.assertEqual(post.call_args.kwargs['json']['temperature'], 0.3)

    def test_stream_uses_saved_url_model_and_forwards_sse(self):
        self.own(self.pe)
        response = Mock(ok=True)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_lines.return_value = [b'data: {"choices":[{"delta":{"content":"Hi"}}]}', b'', b'data: [DONE]', b'']
        with patch('requests.post', return_value=response) as post:
            result = self.call(self.pe, '_chat', {'messages':[{'role':'user','content':'Hi'}], 'model':'unsaved', 'api_url':'http://ignored'})
        self.assertEqual(post.call_args.args[0], 'http://own/v1/chat/completions')
        self.assertEqual(post.call_args.kwargs['json']['model'], 'vendor/own')
        self.assertIn(b'data: [DONE]\n\n', result.wfile.getvalue())
        self.assertEqual(result.headers_sent['Content-Type'], 'text/event-stream')
        self.assertTrue(result.close_connection)
        response.__exit__.assert_called_once()

    def test_model_error_can_trigger_frontend_minimal_payload_retry(self):
        self.own(self.pe)
        response = Mock(ok=False, text='Unsupported top_k')
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with patch('requests.post', return_value=response):
            result = self.call(self.pe, '_chat', {'messages':[]})
        self.assertEqual(result.status, 502)
        self.assertIn('top_k', result.response['error'])

    def test_detection_tests_draft_without_saving(self):
        self.own(self.pe)
        response = Mock()
        response.json.return_value = {'data':[{'id':'vendor/model'}]}
        with patch('requests.get', return_value=response) as get:
            result = self.call(self.pe, '_models', {'connection_mode':'custom', 'api_url':'draft.test:1234/v1/'})
        self.assertEqual(result.status, 200)
        self.assertEqual(get.call_args.args[0], 'http://draft.test:1234/v1/models')
        self.assertEqual(self.pe._get_cfg()['api_url'], 'http://own/v1')



    def test_own_api_keys_preserve_clear_and_never_appear_in_config(self):
        for module in (self.cap, self.pe):
            response = self.own(module, api_key='own-secret')
            self.assertEqual(response.status, 200)
            self.assertNotIn('own-secret', str(response.response))
            self.assertEqual(module._get_cfg()['api_key'], 'own-secret')
            self.own(module, model='changed')
            self.assertEqual(module._get_cfg()['api_key'], 'own-secret')
            self.own(module, api_url='http://different')
            self.assertEqual(module._get_cfg()['api_key'], '')
            self.own(module, api_key='own-secret')
            self.own(module, api_key='')
            self.assertEqual(module._get_cfg()['api_key'], '')

    def test_invalid_api_keys_do_not_change_own_connection(self):
        for module in (self.cap, self.pe):
            self.own(module, api_key='kept-secret')
            result = self.own(module, api_key='secret\nInjected:yes')
            self.assertEqual(result.status, 400)
            self.assertNotIn('Injected', str(result.response))
            self.assertEqual(module._get_cfg()['api_key'], 'kept-secret')

    @unittest.skipUnless(AIConnection and hasattr(AIConnection, 'draft'), 'This Core predates central API-key support')
    def test_shared_keys_override_own_keys_without_destroying_backup(self):
        self.hub.ai_connection.save({'api_url':'http://shared','api_key':'central-secret','transport':'browser'})
        for module in (self.cap, self.pe):
            self.own(module, api_key='own-secret')
            result = self.call(module, '_save_config', {'connection_mode':'shared'})
            self.assertEqual(result.status, 200)
            self.assertNotIn('secret', str(result.response))
            self.assertEqual(module._get_cfg()['api_key'], 'central-secret')
            credentials = self.call(module, '_browser_connection', {'saved':True})
            self.assertEqual(credentials.response['api_key'], 'central-secret')
            self.own(module)
            self.assertEqual(module._get_cfg()['api_key'], 'own-secret')

    def test_model_detection_and_browser_credentials_use_matching_key(self):
        response = Mock()
        response.json.return_value = {'data':[{'id':'vision'}]}
        for module in (self.cap, self.pe):
            self.own(module, api_key='own-secret')
            with patch('requests.get', return_value=response) as request:
                result = self.call(module, '_models', {'api_url':'http://own/v1','transport':'hub'})
                self.assertEqual(result.status, 200)
                self.assertEqual(request.call_args.kwargs['headers'], {'Authorization':'Bearer own-secret'})
                self.call(module, '_models', {'api_url':'http://different','transport':'hub'})
                self.assertEqual(request.call_args.kwargs['headers'], {})
                self.call(module, '_models', {'api_url':'http://different','api_key':'draft-secret','transport':'hub'})
                self.assertEqual(request.call_args.kwargs['headers'], {'Authorization':'Bearer draft-secret'})
            self.assertEqual(module._get_cfg()['api_key'], 'own-secret')
            self.assertEqual(self.call(module, '_browser_connection', {'saved':True}).status, 400)
            creds = self.call(module, '_browser_connection', {'api_url':'http://own/v1','transport':'browser'})
            self.assertEqual(creds.response['api_key'], 'own-secret')
            creds = self.call(module, '_browser_connection', {'api_url':'http://different','transport':'browser'})
            self.assertEqual(creds.response['api_key'], '')

    def test_caption_and_stream_include_auth_on_initial_and_retry_requests(self):
        self.own(self.cap, api_key='caption-secret')
        failed = Mock(ok=False, text='unsupported top_k')
        success = Mock(ok=True)
        success.json.return_value = {'choices':[{'message':{'content':'caption'}}]}
        with patch('requests.post', side_effect=[failed, success]) as request:
            result = self.call(self.cap, '_caption', {'image_b64':'test'})
            self.assertEqual(result.response['caption'], 'caption')
            self.assertEqual(request.call_count, 2)
            for call in request.call_args_list:
                self.assertEqual(call.kwargs['headers'], {'Authorization':'Bearer caption-secret'})
                self.assertFalse(call.kwargs['allow_redirects'])
        self.own(self.pe, api_key='prompt-secret')
        success.__enter__ = Mock(return_value=success)
        success.__exit__ = Mock(return_value=None)
        success.iter_lines.return_value = [b'data: [DONE]', b'']
        with patch('requests.post', return_value=success) as request:
            result = self.call(self.pe, '_chat', {'messages':[]})
            self.assertEqual(result.status, 200)
            self.assertEqual(request.call_args.kwargs['headers'], {'Authorization':'Bearer prompt-secret'})
            self.assertFalse(request.call_args.kwargs['allow_redirects'])


if __name__ == '__main__': unittest.main()
