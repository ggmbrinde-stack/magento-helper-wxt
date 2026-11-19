const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const prepare=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../prepare_bridge.js'),'utf8'));
const config={script:'C:/candidate/batch_cli.py',plan:'C:/run/full.json',captures:'C:/run/captures',index:'C:/run/index.json',inventory:'C:/run/inventory.json',workbook:'C:/run/book.xlsx',codes:['39']};
function harness() {
  const reads=[], patches=[], commands=[];
  const tools={
    exec_command:async x=>{commands.push(x.cmd);return {exit_code:0,output:JSON.stringify(x.cmd.includes("'selection'")?{collection:'collection://working',working_copy:'home',pages:[{code:'39',page_id:'page39'}]}:{plan_sha256:'review-hash',pages:[{code:'39',method_complete:true}]})};},
    mcp__codex_apps__notion_fetch:async x=>{reads.push(x.id);const value={id:x.id,text:'<properties>{"file":"https://files.example/image.png?X-Amz-Signature=private-token"}</properties><content>Own content</content>'};return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false};},
    apply_patch:async x=>{patches.push(x);return {};},
    mcp__codex_apps__notion_notion_update_page:async()=>{throw Error('Preparation cannot write Notion');}
  };
  return {tools,reads,patches,commands};
}
test('full preparation reads exact selected pages, schema, rules and layout only; scrubs credentials',async()=>{
  const h=harness(),result=await prepare(config,h.tools);
  assert.equal(result.plan_sha256,'review-hash');
  assert.deepEqual(h.reads,['home','collection://working','074b6705ae1f8257a53701d87a64eb32','page39']);
  assert.equal(h.patches.length,4);
  assert.ok(h.patches.every(x=>!x.includes('private-token')));
  assert.ok(h.commands[1].includes("'prepare-full'"));
});
test('PP601-only selection is refused before connector reads',async()=>{
  const h=harness();h.tools.exec_command=async()=>({exit_code:0,output:JSON.stringify({pages:[]})});
  await assert.rejects(()=>prepare({...config,codes:['601']},h.tools),/protected/);
  assert.equal(h.reads.length,0);
});
test('failed actual fetch stops preparation and never applies a page',async()=>{
  const h=harness();h.tools.mcp__codex_apps__notion_fetch=async()=>({isError:true});
  await assert.rejects(()=>prepare(config,h.tools),/read failed/);
  assert.equal(h.patches.length,0);
});
test('failed selected-page read is persisted as a per-page error while source reads remain global',async()=>{
  const h=harness(),fetch=h.tools.mcp__codex_apps__notion_fetch;
  h.tools.mcp__codex_apps__notion_fetch=async x=>x.id==='page39'?{isError:true,content:[],structuredContent:null}:fetch(x);
  const result=await prepare(config,h.tools);
  assert.equal(result.plan_sha256,'review-hash');assert.equal(h.patches.length,4);
  assert.ok(h.patches[3].includes('"isError":true'));
});
