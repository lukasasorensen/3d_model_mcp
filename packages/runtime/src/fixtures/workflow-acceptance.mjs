// Against an isolated configured database and a signed-in browser. Run create, open the returned URL, then finish.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseBinaryStl, parseThreeMf } from "@rjls/renderer";
const directory=process.env.RJLS_ACCEPTANCE_DIRECTORY??"/tmp/cad-workflow-evidence";
const client=new Client({name:"workflow-acceptance",version:"1"});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL("../../dist/stdio-server.js",import.meta.url))],env:Object.fromEntries(Object.entries(process.env).filter(([,v])=>v!==undefined)),stderr:"inherit"});
const call=async(name,args)=>{
  for(let i=0;i<10;i++) {
    const response=await client.callTool({name,arguments:args},undefined,{timeout:120_000});
    if(!response.isError)return response;
    const error=JSON.parse(response.content[0].text).error;
    if(error.code!=="BROWSER_BUSY")throw new Error(JSON.stringify(error));
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error("Browser remained busy");
};
try {
  await mkdir(directory,{recursive:true});await client.connect(transport);
  if(process.argv[2]==="create") {
    const {project}= (await call("create_project",{name:"Workflow acceptance",description:"20 × 30 × 10 mm test cube"})).structuredContent;
    const {candidate}=(await call("propose_model_source",{projectId:project.projectId,parentRevision:null,source:"cube([20,30,10]);",requestId:crypto.randomUUID(),toolCallId:crypto.randomUUID()})).structuredContent;
    const input={projectId:project.projectId,candidateId:candidate.candidateId,previewProfile:"standard"};
    const closed=await client.callTool({name:"validate_and_render",arguments:input});
    assert.equal(JSON.parse(closed.content[0].text).error.code,"BROWSER_REQUIRED");
    await writeFile(`${directory}/target.json`,JSON.stringify({project,candidate}));
    console.log(JSON.stringify({projectUrl:project.projectUrl,candidateId:candidate.candidateId,closedBrowser:"BROWSER_REQUIRED"}));
  }else{
    const {project,candidate}=JSON.parse(await readFile(`${directory}/target.json`,"utf8"));
    let revision;
    if(process.argv[2]!=="export") {
    const validated=(await call("validate_and_render",{projectId:project.projectId,candidateId:candidate.candidateId,previewProfile:"standard"})).structuredContent.candidate;
    assert.equal(validated.state,"VALID");assert.deepEqual(validated.geometry.dimensions,[20,30,10]);
    const preview=await call("get_model_preview",{projectId:project.projectId,candidateId:candidate.candidateId});
    await writeFile(`${directory}/preview.png`,Buffer.from(preview.content.find(c=>c.type==="image").data,"base64"));
    ({revision}=(await call("promote_candidate",{projectId:project.projectId,candidateId:candidate.candidateId,expectedParentRevision:null})).structuredContent);
    } else { revision = {revisionId:(await call("get_project_state",{projectId:project.projectId})).structuredContent.state.currentRevision}; }
    const evidence={candidateId:candidate.candidateId,revisionId:revision.revisionId,geometry:revision.geometry,exports:[]};
    for(const format of ["stl","3mf"]) {
      const receipt=(await call("export_model",{projectId:project.projectId,revision:revision.revisionId,format})).structuredContent.export;
      const response=await fetch(receipt.downloadUrl);assert.equal(response.status,200);
      const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,receipt.byteSize);assert.equal(createHash("sha256").update(bytes).digest("hex"),receipt.hash);
      const mesh=format==="stl"?parseBinaryStl(bytes):parseThreeMf(bytes);
      assert.deepEqual(mesh.boundingBox.max.map((value,axis)=>value-mesh.boundingBox.min[axis]),[20,30,10]);
      assert.equal(mesh.triangleCount,12);
      await writeFile(`${directory}/${receipt.filename}`,bytes);
      const {downloadUrl,...safe}=receipt;void downloadUrl;evidence.exports.push(safe);
    }
    await writeFile(`${directory}/evidence.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
  }
}finally{await client.close();await transport.close();}
