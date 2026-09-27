const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../modules/prompt_engineer/static/prompt-engineer.html'),'utf8');
const script = html.split('<script>')[1].split('</script>')[0].replace(/init\(\);\s*$/, '');
function harness(saved={}) {
  const elements = new Map();
  const el = id => {if (!elements.has(id)) elements.set(id,{value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){}},addEventListener(){}});return elements.get(id);};
  const storage = new Map(Object.entries(saved));
  const ctx = vm.createContext({console, feather:{replace(){}}, URL, AbortController, setTimeout, clearTimeout,
    document:{getElementById:el}, localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
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
