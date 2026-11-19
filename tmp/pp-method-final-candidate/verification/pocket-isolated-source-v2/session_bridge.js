(async function runReviewedBatch(config, tools) {
  // Run only inside a tool-enabled session. Python is a local state engine, not an MCP client.
  const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
  async function python(command, extra = []) {
    const args = [config.script, command, "--plan", config.plan, ...extra];
    const reply = await tools.exec_command({cmd: "python " + args.map(quote).join(" "), max_output_tokens: 18000});
    if (reply.exit_code !== 0 || reply.session_id) throw new Error("Local session step failed; inspect journal. No write is retried.");
    const value = JSON.parse(reply.output.trim());
    if (value.error) throw new Error(value.error);
    return value;
  }
  if (config.apply !== true) return await python("inspect");
  if (config.reconcileOnly && config.cancelOnly) throw new Error("Choose reconciliation or cancellation");
  if (/[\r\n]/.test(config.plan)) throw new Error("Invalid local plan path");
  if (!/^[a-f0-9]{64}$/.test(config.approvedPlanSha || "") || !config.approval) throw new Error("Exact reviewed-plan authorisation is required");
  const base = ["--approval", config.approval, "--approved-plan-sha", config.approvedPlanSha, "--apply"];
  const scope = await python("inspect");
  if (scope.plan_sha256 !== config.approvedPlanSha) throw new Error("Reviewed plan changed");
  const pages = new Set(scope.pages.map(p => p.page_id));
  function scrub(value) {
    if (typeof value === "string") return value.replace(/https?:\/\/[^\s"'<>\\]+/g, url => /X-Amz-|[?&](?:signature|token)=/i.test(url) ? url.split("?")[0].split("#")[0] : url);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,scrub(v)]));
    return value;
  }
  let action = await python(config.cancelOnly ? "session-cancel" : config.reconcileOnly ? "session-reconcile" : "session-start", base);
  const counts = {reads:0,writeAttempts:0};
  while (action.type !== "FINISH") {
    if (action.plan_sha256 !== config.approvedPlanSha) throw new Error("Session plan identity changed");
    let event = {nonce:action.nonce};
    try {
      let result;
      if (["FETCH_PAGE","FETCH_PREWRITE","VERIFY_PAGE","RECONCILE_PAGE","FETCH_SCHEMA","FETCH_RULES"].includes(action.type)) {
        if (action.type === "FETCH_SCHEMA" ? action.payload.id !== scope.collection : action.type === "FETCH_RULES" ? action.payload.id !== scope.working_copy : !pages.has(action.payload.id)) throw new Error("Read target is outside the exact batch");
        result = await tools.mcp__codex_apps__notion_fetch(action.payload); counts.reads++;
      } else if (action.type === "FETCH_COMMENTS") {
        if (!pages.has(action.payload.page_id)) throw new Error("Comment target is outside the batch");
        result = await tools.mcp__codex_apps__notion_notion_get_comments(action.payload); counts.reads++;
      } else if (action.type === "WRITE_PENDING") {
        if (config.reconcileOnly || config.cancelOnly) throw new Error("Reconciliation/cancellation cannot write");
        const payload=action.payload;
        if (scope.validation_policy?.name === "TARGETED_SECTION" && payload.command !== "update_content") throw new Error("Targeted contract permits update_content only");
        if (!pages.has(payload.page_id)) throw new Error("Write target is outside the batch");
        if (!["update_content","insert_content","update_properties"].includes(payload.command) || payload.allow_deleting_content || payload.allow_async) throw new Error("Unsafe connector command");
        if (payload.content_updates && (payload.content_updates.length!==1 || payload.content_updates[0].replace_all_matches!==false)) throw new Error("Unsafe replacement scope");
        counts.writeAttempts++;
        result = await tools.mcp__codex_apps__notion_notion_update_page(payload);
      } else throw new Error("Unsupported action");
      const text=result?.structuredContent?.text;
      const body=typeof text === "string" ? text.match(/<content>([\s\S]*?)<\/content>/)?.[1] : null;
      if (body && /https?:\/\/[^\s<>]*[?&](?:X-Amz-|signature=|token=)/i.test(body)) throw new Error("Unstable signed body media");
      event.result=scrub(result);
    } catch (_) {
      event.error="Connector operation failed; outcome unconfirmed. No automatic retry.";
    }
    // Full fetch responses exceed the Windows command-line limit. Spool scrubbed JSON as data.
    if (!/^[a-f0-9]{32}$/.test(action.nonce)) throw new Error("Invalid event nonce");
    const spool=config.plan.replace(/\\/g,"/")+".event-"+action.nonce+".json";
    const saved=await tools.apply_patch("*** Begin Patch\n*** Add File: "+spool+"\n+"+JSON.stringify(event)+"\n*** End Patch");
    if (saved?.isError) throw new Error("Cannot save connector event; inspect journal before resuming");
    action = await python("session-step", [...base,"--event-file",spool]);
    await tools.apply_patch("*** Begin Patch\n*** Delete File: "+spool+"\n*** End Patch");
  }
  return {status:action.status,reason:action.reason||null,...counts,plan_sha256:config.approvedPlanSha};
})
