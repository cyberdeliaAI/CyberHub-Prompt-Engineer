const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../modules/prompt_engineer/static/prompt-engineer.html'),'utf8');
const script = html.split('<script>')[1].split('</script>')[0].replace(/init\(\);\s*$/, '');
function harness(saved={}) {
  const elements = new Map();
  const makeElement = id => ({id, value:'', min:'', max:'', style:{}, dataset:{}, options:[], children:[], checked:false,
    classList:{add(){},remove(){},toggle(){}}, addEventListener(){},
    appendChild(child){this.children.push(child);return child;},
    set innerHTML(value){this.children=[];}, get innerHTML(){return '';},
    showModal(){this.open=true;},close(){this.open=false;},reportValidity(){return true;}});
  const el = id => {if (!elements.has(id)) elements.set(id,makeElement(id));return elements.get(id);};
  const storage = new Map(Object.entries(saved));
  const ctx = vm.createContext({console, feather:{replace(){}}, URL, AbortController, setTimeout, clearTimeout,
    document:{getElementById:el, createElement:()=>makeElement(''), querySelectorAll:()=>[]}, localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    fetch:async()=>{throw Error('Unexpected request');}});
  vm.runInContext(script,ctx);
  return {ctx,el,storage,run:code=>vm.runInContext(code,ctx)};
}
const cfg = {central_available:true, connection_mode:'shared',connection_saved:true,api_url:'http://shared/v1',model:'vendor/full-model',transport:'hub',shared_model:'',shared:{configured:true,api_url:'http://shared/v1',model:'vendor/full-model',transport:'hub'},custom:{api_url:'http://own/v1',model:'old',transport:'browser'}};
const reply = data => ({ok:true,status:200,json:async()=>data});
test('shared model inherits while own connection remains selectable',()=>{
 const h=harness();h.ctx.cfg=cfg;h.run('populatePeConnection(cfg)');
 assert.equal(h.el('ip-input').disabled,true);
 assert.equal(h.el('pe-model').value,'');
 h.el('pe-connection-mode').value='custom';h.run('updatePeConnectionMode()');
 assert.equal(h.el('ip-input').value,'http://own/v1');
 assert.equal(h.el('pe-model').value,'old');
 assert.equal(h.run('baseUrl()'),'http://shared/v1');
});
test('legacy browser migration is once-only and cannot overwrite existing Hub settings',async()=>{
 const h=harness({'prompt-engineer-v3-prefs':JSON.stringify({ip:'old.test:8000',modelName:'vendor/old'})});
 const calls=[];h.ctx.fetch=async(url,opts)=>{calls.push(opts);return reply(opts?.method==='POST'?{...cfg,connection_mode:'custom'}:{...cfg,connection_saved:false});};
 await h.run('loadPeConnection()');
 assert.equal(calls.length,2);const body=JSON.parse(calls[1].body);
 assert.equal(body.initialize_only,true);assert.equal(body.api_url,'http://old.test:8000/v1');
 calls.length=0;await h.run('loadPeConnection()');assert.equal(calls.length,1);
 assert.equal(h.storage.get('prompt-engineer-v3-connection-migrated'),'1');
});
test('saved server config wins over another browser legacy settings',async()=>{
 const h=harness({'prompt-engineer-v3-prefs':JSON.stringify({ip:'wrong.test'})});
 h.ctx.fetch=async(_url,opts)=>{assert.notEqual(opts?.method,'POST');return reply(cfg);};
 await h.run('loadPeConnection()');assert.equal(h.run('baseUrl()'),'http://shared/v1');
});
test('requests refresh central config and ignore unsaved fields',async()=>{
 const h=harness();h.ctx.cfg=cfg;h.run('populatePeConnection(cfg); state.abortController=new AbortController()');
 h.el('ip-input').value='http://unsaved';h.el('pe-model').value='unsaved';
 const requests=[];h.ctx.fetch=async(url,opts)=>{requests.push({url,opts});return reply(url.endsWith('/config')?{...cfg,model:'vendor/changed'}:{});};
 await h.run('postChatCompletions([{role:"user",content:"test"}])');
 assert.equal(requests[1].url,'/api/prompt-engineer/chat');
 assert.equal(JSON.parse(requests[1].opts.body).model,'vendor/changed');
});
test('central browser connection uses v1 exactly once with full model id',async()=>{
 const h=harness();h.ctx.cfg={...cfg,transport:'browser'};h.run('populatePeConnection(cfg);state.abortController=new AbortController()');
 const requests=[];h.ctx.fetch=async(url,opts)=>{requests.push({url,opts});return reply(url.endsWith('/config')?h.ctx.cfg:{});};
 await h.run('postChatCompletions([])');assert.equal(requests[1].url,'http://shared/v1/chat/completions');
 assert.equal(JSON.parse(requests[1].opts.body).model,'vendor/full-model');
});
test('own connection remains usable on old Core',()=>{
 const h=harness();h.ctx.cfg={central_available:false,connection_mode:'custom',api_url:'http://old/v1',model:'old',transport:'browser'};h.run('populatePeConnection(cfg)');
 assert.equal(h.el('pe-connection-mode').disabled,true);assert.equal(h.el('ip-input').disabled,false);
});
test('no generation is sent when refreshed central config is missing',async()=>{
 const h=harness();h.ctx.cfg=cfg;h.run('populatePeConnection(cfg)');
 h.ctx.fetch=async url=>{assert.ok(url.endsWith('/config'));return reply({...cfg,connection_error:'Configure central first'});};
 await assert.rejects(h.run('postChatCompletions([])'),/Configure central first/);
});

test('cancellation while refreshing connection reaches the model request', async()=>{
 const h=harness();
 h.run('state.abortController=new AbortController();state.abortController.abort()');
 h.ctx.fetch=async(_url,opts)=>{assert.equal(opts.signal.aborted,true);throw new Error('Stopped');};
 await assert.rejects(h.run('fetchWithTimeout("http://local/v1/chat/completions",{signal:state.abortController.signal})'),/Stopped/);
});


test('key fields preserve, replace and clear without filling a saved password',()=>{
 const h=harness();h.ctx.cfg={...cfg,connection_mode:'custom',api_key_set:true,custom:{...cfg.custom,api_key_set:true}};
 h.run('populatePeConnection(cfg)');assert.equal(h.el('pe-api-key').value,'');assert.match(h.el('pe-api-key').placeholder,/saved/);
 assert.equal(Object.hasOwn(h.run('peConnectionDraft()'),'api_key'),false);
 h.el('pe-api-key').value='new-secret';assert.equal(h.run('peConnectionDraft().api_key'),'new-secret');
 h.el('pe-clear-api-key').checked=true;assert.equal(h.run('peConnectionDraft().api_key'),'');
});
test('browser streaming sends a saved key on retries without persisting it',async()=>{
 const h=harness();h.ctx.cfg={...cfg,transport:'browser',api_key_set:true};h.run('populatePeConnection(cfg);state.abortController=new AbortController();showToast=()=>{}');
 const calls=[];h.ctx.fetch=async(url,opts)=>{calls.push({url,opts});
 if(url.endsWith('/config'))return reply(h.ctx.cfg);
 if(url.endsWith('/browser-connection'))return reply({api_url:cfg.api_url,api_key:'saved-secret'});
 if(calls.length===3)return {ok:false,text:async()=> 'unsupported top_k'};
 return reply({});};
 await h.run('postChatCompletions([])');assert.equal(calls.length,4);
 for(const call of calls.slice(2)){assert.equal(call.opts.headers.Authorization,'Bearer saved-secret');assert.equal(call.opts.redirect,'error');}
 assert.equal(h.run('peConnection.api_key'),undefined);assert.equal(JSON.stringify([...h.storage]).includes('saved-secret'),false);
});
test('browser credentials fail closed if the saved endpoint changes',async()=>{
 const h=harness();h.ctx.fetch=async()=>reply({api_url:'http://changed/v1',api_key:'secret'});
 await assert.rejects(h.run('peBrowserHeaders({api_url:"http://old/v1",api_key_set:true},true)'),/Connection changed/);
});


test('settings drafts never affect generation or saved preferences and cancel restores them',async()=>{
 const h=harness();h.ctx.cfg=cfg;
 h.run('populatePeConnection(cfg);state.initializing=false;showToast=()=>{}');
 h.el('rng-temp').value='0.3';h.el('ctx-input').value='8192';
 await h.run('openPeSettings()');
 h.el('rng-temp').value='1.5';h.el('ctx-input').value='16384';h.el('pe-model').value='unsaved';
 assert.equal(h.run('buildPayload([]).temperature'),0.3);
 assert.equal(h.run('preferenceSnapshot().temperature'),'0.3');
 assert.equal(h.run('state.maxContext'),8192);
 h.run('saveQuickPrefs()');assert.equal(JSON.parse(h.storage.get('prompt-engineer-v3-prefs')).temperature,'0.3');
 h.run('clearGenerationOverrides();closePeSettings()');
 assert.equal(h.el('rng-temp').value,'0.3');assert.equal(h.el('ctx-input').value,'8192');
 assert.equal(h.el('pe-settings-dialog').open,false);
});
test('saving settings applies generation values only after a successful server save',async()=>{
 const h=harness();h.ctx.cfg=cfg;h.run('populatePeConnection(cfg);state.initializing=false;showToast=()=>{}');
 h.el('rng-temp').value='0.3';await h.run('openPeSettings()');h.el('rng-temp').value='0.8';h.el('ctx-input').value='16384';
 h.ctx.fetch=async()=>({ok:false,json:async()=>({error:'Disk unavailable'})});
 await h.run('savePeConnection()');
 assert.equal(h.run('buildPayload([]).temperature'),0.3);assert.equal(h.el('pe-settings-dialog').open,true);
 assert.match(h.el('pe-connection-feedback').textContent,/Disk unavailable/);
 h.ctx.fetch=async()=>reply(cfg);await h.run('savePeConnection()');
 assert.equal(h.run('buildPayload([]).temperature'),0.8);assert.equal(h.run('state.maxContext'),16384);
 assert.equal(h.el('pe-settings-dialog').open,false);assert.equal(h.run('peSettingsSnapshot'),null);
 assert.equal(JSON.parse(h.storage.get('prompt-engineer-v3-prefs')).temperature,'0.8');
});
test('model detection changes only the dialog draft and is discarded by cancel',async()=>{
 const h=harness();h.ctx.cfg=cfg;h.run('populatePeConnection(cfg);showToast=()=>{}');
 h.el('ctx-input').value='8192';h.el('img-max-dim').value='1024';await h.run('openPeSettings()');
 h.ctx.fetch=async()=>reply({data:[{id:'Qwen3-VL-test',context_length:32768}]});
 await h.run('fetchModelInfo()');
 assert.equal(h.el('pe-model').value,'Qwen3-VL-test');assert.equal(h.el('ctx-input').value,32768);
 assert.equal(h.run('state.modelName'),'vendor/full-model');assert.equal(h.run('state.maxContext'),8192);
 assert.equal(h.el('img-max-dim').value,'1024');assert.equal(h.storage.size,0);
 h.run('closePeSettings()');assert.equal(h.el('pe-model').value,'');assert.equal(h.el('ctx-input').value,'8192');
});
const files = [
 {id:'resource:Krea2/Cinematic.txt',title:'Cinematic',text:'Krea cinematic instructions',folder:'Krea2',mode:'rewrite'},
 {id:'resource:ZIT/Cinematic.txt',title:'Cinematic',text:'ZIT cinematic instructions',folder:'ZIT',mode:'rewrite'},
 {id:'resource:Krea2/Vision.txt',title:'Vision Illustration',text:'Image instructions',folder:'Krea2',mode:'vision'}
];
test('prompt files have distinct identities, explicit image mode and are not custom deletions',async()=>{
 const h=harness();h.ctx.fetch=async()=>reply({prompts:files,warnings:[]});
 await h.run('loadResourcePrompts(true)');
 assert.equal(h.run('PROMPTS["resource:Krea2/Cinematic.txt"]'),'Krea cinematic instructions');
 assert.equal(h.run('PROMPTS["resource:ZIT/Cinematic.txt"]'),'ZIT cinematic instructions');
 h.el('sys-prompt-select').value='resource:Krea2/Vision.txt';assert.equal(h.run('getCurrentMode()'),'vision');
 h.run('deleteCurrentPrompt()');assert.equal(h.run('PROMPTS["resource:Krea2/Vision.txt"]'),'Image instructions');
});
test('search and folder browsing keep the selected prompt and editor draft',async()=>{
 const h=harness();h.ctx.fetch=async()=>reply({prompts:files,warnings:[]});await h.run('loadResourcePrompts(true)');
 h.run('rebuildDropdown("resource:Krea2/Cinematic.txt")');h.el('sys-prompt-preview').value='Hand edited';
 h.el('pe-prompt-folder').value='folder:ZIT';h.el('pe-prompt-search').value='no match';h.run('renderPePromptOptions()');
 assert.equal(h.el('sys-prompt-select').value,'resource:Krea2/Cinematic.txt');
 assert.equal(h.run('getActiveSystemPrompt()'),'Hand edited');assert.match(h.el('pe-catalog-status').textContent,/No matching/);
});
test('refresh preserves edited text and chat, including a removed selected file',async()=>{
 const h=harness();h.ctx.fetch=async()=>reply({prompts:files,warnings:[]});await h.run('loadResourcePrompts(true)');
 h.run('rebuildDropdown("resource:Krea2/Cinematic.txt");state.history=[{role:"user",content:"Previous"}]');
 h.el('sys-prompt-preview').value='Hand edited';
 h.ctx.fetch=async()=>reply({prompts:[],warnings:[]});await h.run('loadResourcePrompts(false)');
 assert.equal(h.run('getActiveSystemPrompt()'),'Hand edited');assert.equal(h.run('state.history.length'),1);
 assert.equal(h.run('PROMPT_META["resource:Krea2/Cinematic.txt"].source'),'missing');
 await h.run('loadResourcePrompts(false)');
 assert.equal(h.run('PROMPT_META["resource:Krea2/Cinematic.txt"].source'),'missing');
 h.ctx.fetch=async()=>{throw Error('Offline')};await h.run('loadResourcePrompts(false)');
 assert.equal(h.run('getActiveSystemPrompt()'),'Hand edited');assert.match(h.el('pe-catalog-status').textContent,/unavailable/);
});
test('file selection and an edited system prompt restore after catalog loading',async()=>{
 const h=harness({'prompt-engineer-v3-prefs':JSON.stringify({sys:files[0].id,systemPromptDraft:'Saved edit',generationOverridesVersion:1})});
 h.ctx.fetch=async()=>reply({prompts:files,warnings:[]});await h.run('loadResourcePrompts(true)');
 h.run('rebuildDropdown(storedPromptName());restoreState()');
 assert.equal(h.el('sys-prompt-select').value,files[0].id);assert.equal(h.run('getActiveSystemPrompt()'),'Saved edit');
});

test('removed file restores its saved editor draft and vision mode after reopening',()=>{
 const h=harness({'prompt-engineer-v3-prefs':JSON.stringify({sys:'resource:Krea2/Missing.txt',systemPromptDraft:'Kept text',systemPromptMode:'vision',generationOverridesVersion:1})});
 h.run('restoreMissingResourcePrompt();rebuildDropdown(storedPromptName());restoreState()');
 assert.equal(h.run('getCurrentMode()'),'vision');assert.equal(h.run('getActiveSystemPrompt()'),'Kept text');
 assert.equal(h.run('PROMPT_META[els.sysSelect.value].source'),'missing');
});
