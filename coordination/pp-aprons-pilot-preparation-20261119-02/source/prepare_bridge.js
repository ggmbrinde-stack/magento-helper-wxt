(async function prepareReviewedFullBatch(config, tools) {
  // Session tools supply current MCP reads; Python remains a local source/plan engine.
  const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
  for (const value of [config.script, config.plan, config.inventory, config.index, config.workbook, config.captures, ...(config.nativeManifest?[config.nativeManifest]:[])]) {
    if (typeof value !== "string" || !value || /[\r\n]/.test(value)) throw new Error("Exact local preparation paths are required");
  }
  if (!Array.isArray(config.codes) || !config.codes.length || config.codes.some(c => !/^\d+$/.test(c))) throw new Error("Choose exact reviewed PP codes");
  async function python(command, args) {
    const reply = await tools.exec_command({cmd:"python -B "+[config.script, command, ...args].map(quote).join(" "),max_output_tokens:12000});
    if (reply.exit_code!==0 || reply.session_id) throw new Error("Local preparation refused; no writes were attempted");
    const result=JSON.parse(reply.output.trim()); if (result.error) throw new Error(result.error); return result;
  }
  function scrub(value) {
    if (typeof value==="string") return value.replace(/https?:\/\/[^\s"'<>\\]+/g,u=>/X-Amz-|[?&](?:signature|token)=/i.test(u)?u.split("?")[0].split("#")[0]:u);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value==="object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,scrub(v)]));
    return value;
  }
  const selected=await python("selection",["--inventory",config.inventory,"--codes",...config.codes]);
  if (!selected.pages.length) throw new Error("PP601 is protected; there are no mutable selected pages");
  const reads=new Map([["home.json",selected.working_copy],["schema.json",selected.collection],["pp428.json","074b6705ae1f8257a53701d87a64eb32"]]);
  for (const page of selected.pages) reads.set("pp"+page.code+".json",page.page_id);
  for (const [name,id] of reads) {
    let response;
    try { response=await tools.mcp__codex_apps__notion_fetch({id,include_file_urls:false,include_discussions:false}); }
    catch (_) { response={isError:true,content:[],structuredContent:null}; }
    const failed=response.isError || !response.structuredContent?.text;
    if (failed && (name==='home.json' || name==='schema.json' || name==='pp428.json')) throw new Error("A current preparation read failed: "+name);
    const body=response.structuredContent?.text?.match(/<content>([\s\S]*?)<\/content>/)?.[1];
    if (body && /https?:\/\/[^\s<>]*[?&](?:X-Amz-|signature=|token=)/i.test(body)) throw new Error("Unstable signed body media");
    const clean=scrub(response);
    const data=name.startsWith("pp")?{capture:{tool:"mcp__codex_apps__notion_fetch",requested_id:id,received_at_utc:new Date().toISOString()},response:clean}:clean;
    const path=config.captures.replace(/\\/g,"/")+"/"+name;
    const saved=await tools.apply_patch("*** Begin Patch\n*** Add File: "+path+"\n+"+JSON.stringify(data)+"\n*** End Patch");
    if (saved?.isError) throw new Error("Cannot persist the current read");
  }
  return await python("prepare-full",["--captures",config.captures,"--workbook",config.workbook,"--index",config.index,
    "--inventory",config.inventory,"--codes",...config.codes,"--output",config.plan,...(config.contexts?["--contexts",config.contexts]:[]),
    ...(config.nativeManifest?["--native-manifest",config.nativeManifest]:[])]);
})
