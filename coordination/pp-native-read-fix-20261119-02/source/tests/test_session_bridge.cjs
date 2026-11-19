// Offline tests of the actual session entry point. No real connector is loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const run = eval(fs.readFileSync(path.join(__dirname, '..', 'session_bridge.js'), 'utf8'));
const sha = 'a'.repeat(64), page = 'page-633';
const scope = {dry_run:true,plan_sha256:sha,collection:'collection://fixture',pages:[{page_id:page}]};
const config = {script:"C:/candidate's folder/batch_cli.py",plan:'C:/candidate/plan.json',approval:'C:/candidate/approval.json',approvedPlanSha:sha};
let nonce=0;
const action = (type,payload) => ({type,payload,plan_sha256:sha,nonce:(++nonce).toString(16).padStart(32,'0')});
function fixture(actions, failWrite=false) {
  const seen={commands:[],events:[],reads:0,writes:0,spools:new Map()};
  const tools={
    async exec_command({cmd}) {
      seen.commands.push(cmd);
      if (cmd.includes("'inspect'")) return {exit_code:0,output:JSON.stringify(scope)};
      const match=cmd.match(/'--event-file' '([^']+)'/);
      if(match) seen.events.push(JSON.parse(seen.spools.get(match[1])));
      assert.ok(actions.length,'Unexpected extra protocol step');
      return {exit_code:0,output:JSON.stringify(actions.shift())};
    },
    async apply_patch(patch){
      const add=patch.match(/\*\*\* Add File: ([^\n]+)\n\+([^\n]+)\n/);
      if(add)seen.spools.set(add[1],add[2]);
      else {const removed=patch.match(/\*\*\* Delete File: ([^\n]+)/);assert.ok(removed);seen.spools.delete(removed[1]);}
      return {};
    },
    async mcp__codex_apps__notion_fetch() {
      seen.reads++;
      return {structuredContent:{text:'ação, Peito e Bolso'.repeat(4000),url:'https://example.test/file?X-Amz-Signature=secret'}};
    },
    async mcp__codex_apps__notion_notion_get_comments(){seen.reads++;return {structuredContent:{text:'empty fixture'}};},
    async mcp__codex_apps__notion_notion_update_page(){seen.writes++;if(failWrite)throw Error('lost');return {isError:false};}
  };
  return {tools,seen};
}
test('default dry-run invokes only local inspection and safely quotes paths',async()=>{
  const {tools,seen}=fixture([]);
  assert.equal((await run(config,tools)).dry_run,true);
  assert.equal(seen.reads+seen.writes,0);assert.equal(seen.commands.length,1);
  assert.ok(seen.commands[0].includes("'C:/candidate''s folder/batch_cli.py'"));
});
test('native read uses secure launcher and plan-local event file without printing raw data',async()=>{
  const native=action('NATIVE_PREWRITE',{page_id:page});
  const {tools,seen}=fixture([native,{type:'FINISH',status:'BLOCKED'}]);
  const execute=tools.exec_command;
  tools.exec_command=async({cmd})=>{
    if(!cmd.includes("'native-read'"))return execute({cmd});
    seen.commands.push(cmd);
    assert.ok(cmd.includes("'C:/secure launcher.ps1'"));
    const output=cmd.match(/'--output','([^']+)'/)[1];
    seen.spools.set(output,JSON.stringify({nonce:native.nonce,result:{source:'NATIVE_FIXTURE'}}));
    return {exit_code:0,output:JSON.stringify({path:output,sha256:'fixture'})};
  };
  const result=await run({...config,apply:true,nativeReadLauncher:'C:/secure launcher.ps1',pythonExe:'C:/Python/python.exe'},tools);
  assert.equal(result.status,'BLOCKED');
  assert.equal(seen.events[0].result.source,'NATIVE_FIXTURE');
  assert.equal(seen.writes,0);assert.equal(seen.spools.size,0);
});
test('explicit application serialises real tool calls and UTF-8 events',async()=>{
  const {tools,seen}=fixture([
    action('FETCH_PAGE',{id:page}),action('FETCH_COMMENTS',{page_id:page}),
    action('WRITE_PENDING',{command:'update_content',page_id:page,content_updates:[{old_str:'old',new_str:'new',replace_all_matches:false}]}),
    action('VERIFY_PAGE',{id:page}),{type:'FINISH',status:'COMPLETE'}]);
  const result=await run({...config,apply:true},tools);
  assert.equal(result.status,'COMPLETE');assert.equal(result.reads,3);assert.equal(result.writeAttempts,1);
  assert.equal(seen.events[0].result.structuredContent.text,'ação, Peito e Bolso'.repeat(4000));
  assert.ok(seen.commands.every(c=>c.length<2000));
  assert.equal(seen.events[0].result.structuredContent.url,'https://example.test/file');
  assert.equal(seen.spools.size,0);
});
test('lost mutation result is delivered once to the durable engine, never retried',async()=>{
  const {tools,seen}=fixture([action('WRITE_PENDING',{command:'update_properties',page_id:page,properties:{Faces:['Peito']}}),{type:'FINISH',status:'UNCERTAIN'}],true);
  assert.equal((await run({...config,apply:true},tools)).status,'UNCERTAIN');
  assert.equal(seen.writes,1);assert.ok(seen.events[0].error);
});
test('reconciliation refuses mutations even if a malformed engine action requests one',async()=>{
  const {tools,seen}=fixture([action('WRITE_PENDING',{command:'insert_content',page_id:page,content:'unsafe'}),{type:'FINISH',status:'UNCERTAIN'}]);
  await run({...config,apply:true,reconcileOnly:true},tools);
  assert.equal(seen.writes,0);assert.ok(seen.events[0].error);
  assert.ok(seen.commands.some(c=>c.includes("'session-reconcile'")));
});
test('out-of-batch targets and replace-all do not reach the connector',async()=>{
  for(const payload of [
    {command:'update_properties',page_id:'outside',properties:{Faces:[]}},
    {command:'update_content',page_id:page,content_updates:[{old_str:'a',new_str:'b',replace_all_matches:true}]}
  ]){
    const {tools,seen}=fixture([action('WRITE_PENDING',payload),{type:'FINISH',status:'UNCERTAIN'}]);
    await run({...config,apply:true},tools);assert.equal(seen.writes,0);assert.ok(seen.events[0].error);
  }
});
test('cancellation is local and cannot dispatch a mutation',async()=>{
  const {tools,seen}=fixture([{type:'FINISH',status:'CANCELLED'}]);
  const result=await run({...config,apply:true,cancelOnly:true},tools);
  assert.equal(result.status,'CANCELLED');assert.equal(seen.reads+seen.writes,0);
  assert.ok(seen.commands.some(c=>c.includes("'session-cancel'")));
});
test('targeted policy refuses property and insertion commands at the bridge',async()=>{
  scope.validation_policy={name:'TARGETED_SECTION'};
  try{
    for(const command of ['insert_content','update_properties']){
      const {tools,seen}=fixture([action('WRITE_PENDING',{command,page_id:page}),{type:'FINISH',status:'UNCERTAIN'}]);
      await run({...config,apply:true},tools);assert.equal(seen.writes,0);assert.ok(seen.events[0].error);
    }
  }finally{delete scope.validation_policy;}
});
test('fresh rule reads are limited to the reviewed Working Copy home',async()=>{
  scope.working_copy='working-home';
  try{
    const good=fixture([action('FETCH_RULES',{id:'working-home'}),{type:'FINISH',status:'COMPLETE'}]);
    await run({...config,apply:true},good.tools);assert.equal(good.seen.reads,1);
    const bad=fixture([action('FETCH_RULES',{id:'original-catalogue'}),{type:'FINISH',status:'FAILED'}]);
    await run({...config,apply:true},bad.tools);assert.equal(bad.seen.reads,0);assert.ok(bad.seen.events[0].error);
  }finally{delete scope.working_copy;}
});
test('per-page status phases use actual connector and return error report',async()=>{
  const {tools,seen}=fixture([
    action('FETCH_ERROR_PAGE',{id:page}),action('FETCH_ERROR_SCHEMA',{id:scope.collection}),
    action('WRITE_PENDING',{command:'update_properties',page_id:page,properties:{Estado:'Erro'}}),
    action('VERIFY_ERROR_STATUS',{id:page}),
    {type:'FINISH',status:'COMPLETED_WITH_ERRORS',pages:{633:{outcome:'UNCERTAIN'}},report_path:'local/batch-report.json'}]);
  const result=await run({...config,apply:true},tools);
  assert.equal(result.status,'COMPLETED_WITH_ERRORS');assert.equal(result.pages[633].outcome,'UNCERTAIN');assert.equal(result.reportPath,'local/batch-report.json');assert.equal(seen.writes,1);
});
test('explicit batch continuation is separate from read-only reconciliation',async()=>{
  const {tools,seen}=fixture([{type:'FINISH',status:'COMPLETED_WITH_ERRORS'}]);
  await run({...config,apply:true,continueBatch:true},tools);assert.ok(seen.commands.some(c=>c.includes("'session-continue'")));
  await assert.rejects(()=>run({...config,apply:true,continueBatch:true,reconcileOnly:true},tools));
});
