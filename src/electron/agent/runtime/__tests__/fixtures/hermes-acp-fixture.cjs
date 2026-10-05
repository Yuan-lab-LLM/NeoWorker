const readline = require('node:readline');
const send = (message) => process.stdout.write(JSON.stringify({jsonrpc:'2.0', ...message})+'\n');
const result = (id, value) => send({id, result: value});
let promptId;
let permissionParent;
let mcpServers = [];
const sessionId = 'fixture-session';
readline.createInterface({input:process.stdin}).on('line', line => {
 const message = JSON.parse(line);
 const {id, method, params} = message;
 if (!method) {
   if (id === 'prompt-permission' && promptId) {
     send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify(message.result)}}}});
     result(promptId,{stopReason:'end_turn'}); promptId=undefined;
   }
   if (id === 'server-permission') result(permissionParent, message.result || message.error);
   return;
 }
 switch(method) {
 case 'initialize':
   if (process.env.NEOWORKER_TEST_HANG_INITIALIZE === '1') break;
   process.stderr.write('x'.repeat(512*1024), () => result(id, {protocolVersion:1, agentInfo:{name:'hermes-agent', version:'fixture'}, agentCapabilities:{loadSession:true}}));
   break;
 case 'session/new': mcpServers = params.mcpServers || []; result(id, {sessionId}); break;
 case 'session/load':
   mcpServers = params.mcpServers || [];
   send({method:'session/update', params:{sessionId:params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'HISTORY'}}}});
   result(id, {}); break;
 case 'session/prompt':
   promptId=id;
   if (params.prompt[0].text === 'progress-until-done' || params.prompt[0].text === 'progress-never-done') {
     const interval = setInterval(() => send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'.'}}}}), 30);
     if (params.prompt[0].text === 'progress-until-done') setTimeout(() => { clearInterval(interval); result(id,{stopReason:'end_turn'}); }, 300);
     break;
   }
   if (params.prompt[0].text === 'provider-error') {
     send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'HTTP 402: Insufficient Balance'}}}});
     result(id,{stopReason:'end_turn',_meta:{neoworker:{runtimeError:{code:'HERMES_RUNTIME_ERROR',message:'HTTP 402: Insufficient Balance',retryable:false}}}});
     promptId=undefined; break;
   }
   if (params.prompt[0].text === 'host-tool') {
     void (async () => {
       const server = mcpServers.find(item => item.name === 'neoworker');
       const headers = Object.fromEntries(server.headers.map(item => [item.name, item.value]));
       headers['content-type'] = 'application/json';
       const init = await fetch(server.url, {method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})});
       headers['mcp-session-id'] = init.headers.get('mcp-session-id');
       const call = await fetch(server.url, {method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'run_command',arguments:{command:'echo host'}}})});
       const payload = await call.json();
       send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify(payload)}}}});
       result(id,{stopReason:'end_turn'}); promptId=undefined;
     })().catch(error => send({id,error:{code:-32001,message:error.message}}));
     break;
   }
   if (params.prompt[0].text === 'narrated-host-tool') {
     void (async () => {
       send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'让我先检查可用的数据源。'}}}});
       const server = mcpServers.find(item => item.name === 'neoworker');
       const headers = Object.fromEntries(server.headers.map(item => [item.name, item.value]));
       headers['content-type'] = 'application/json';
       const init = await fetch(server.url, {method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})});
       headers['mcp-session-id'] = init.headers.get('mcp-session-id');
       await fetch(server.url, {method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'run_command',arguments:{command:'echo host'}}})});
       send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'最终答案：已完成。'}}}});
       result(id,{stopReason:'end_turn'}); promptId=undefined;
     })().catch(error => send({id,error:{code:-32001,message:error.message}}));
     break;
   }
   if (params.prompt[0].text === 'host-dependency-install') {
     void (async () => {
       const server = mcpServers.find(item => item.name === 'neoworker');
       const headers = Object.fromEntries(server.headers.map(item => [item.name, item.value]));
       headers['content-type'] = 'application/json';
       const request = async (id, name, arguments_) => {
         const response = await fetch(server.url, {
           method: 'POST', headers,
           body: JSON.stringify({jsonrpc:'2.0', id, method:'tools/call', params:{name, arguments:arguments_}}),
         });
         return response.json();
       };
       const init = await fetch(server.url, {method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})});
       headers['mcp-session-id'] = init.headers.get('mcp-session-id');
       const manifest = await request(2, 'write_file', {
         path: 'package.json',
         content: JSON.stringify({
           private: true,
           dependencies: {'neoworker-fixture-dep': 'file:./dep'},
         }),
       });
       const dependency = await request(3, 'write_file', {
         path: 'dep/package.json',
         content: JSON.stringify({name:'neoworker-fixture-dep', version:'1.0.0', main:'index.js'}),
       });
       const install = await request(4, 'run_command', {
         command: 'npm install ./dep --ignore-scripts --no-audit --no-fund --offline',
       });
       send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify({manifest,dependency,install})}}}});
       result(id,{stopReason:'end_turn'}); promptId=undefined;
     })().catch(error => send({id,error:{code:-32001,message:error.message}}));
     break;
   }
   if (params.prompt[0].text === 'host-multi-tool') {
     void (async () => {
       const server = mcpServers.find(item => item.name === 'neoworker');
       const headers = Object.fromEntries(server.headers.map(item => [item.name, item.value]));
       headers['content-type'] = 'application/json';
       const request = async (id, name, arguments_) => {
         const response = await fetch(server.url, {
           method: 'POST', headers,
           body: JSON.stringify({jsonrpc:'2.0', id, method:'tools/call', params:{name, arguments:arguments_}}),
         });
         return response.json();
       };
       const init = await fetch(server.url, {method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})});
       headers['mcp-session-id'] = init.headers.get('mcp-session-id');
       const write = await request(2, 'write_file', {path:'hermes-host.cjs', content:"process.stdout.write('hello from Hermes')"});
       const shell = await request(3, 'run_command', {command:'node hermes-host.cjs'});
       send({method:'session/update',params:{sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify({write,shell})}}}});
       result(id,{stopReason:'end_turn'}); promptId=undefined;
     })().catch(error => send({id,error:{code:-32001,message:error.message}}));
     break;
   }
   if (params.prompt[0].text === 'wait') break;
   if (['delayed-stream', 'foreign-stream', 'stream-without-result'].includes(params.prompt[0].text)) {
     send({method:'session/update', params:{
       sessionId:params.prompt[0].text === 'foreign-stream' ? 'unrelated' : params.sessionId,
       update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Working'}},
     }});
     if (params.prompt[0].text !== 'stream-without-result') {
       setTimeout(() => { result(id,{stopReason:'end_turn'}); promptId=undefined; }, 500);
     }
     break;
   }
   if (['permission', 'foreign-permission'].includes(params.prompt[0].text)) {
     send({id:'prompt-permission',method:'session/request_permission',params:{
       sessionId:params.prompt[0].text === 'foreign-permission' ? 'foreign' : sessionId,
       toolCall:{toolCallId:'write-1',title:'Write a file',rawInput:{path:'example.txt'}},
       options:[{optionId:'allow',kind:'allow_once',name:'Allow once'},{optionId:'reject',kind:'reject_once',name:'Reject'}],
     }}); break;
   }
   send({method:'session/update', params:{sessionId:'unrelated',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'WRONG'}}}});
   send({method:'session/update', params:{sessionId:params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'你好'}}}});
   send({method:'session/update', params:{sessionId:params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:' OK'}}}});
   result(id,{stopReason:'end_turn'}); promptId=undefined; break;
 case 'session/cancel':
   if(promptId) result(promptId,{stopReason:'cancelled'});
   promptId=undefined; break;
 case 'echo': setTimeout(() => result(id,params), params.delay || 0); break;
 case 'permission':
   permissionParent=id;
   send({id:'server-permission',method:'session/request_permission',params:{sessionId,options:[{optionId:'allow_once',kind:'allow_once',name:'Allow'}]}}); break;
 case 'unknownCallback':
   permissionParent=id;
   send({id:'server-permission',method:'fs/write_text_file',params:{sessionId}}); break;
 case 'unicode': {
   const bytes=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,result:'中文 😀'})+'\n');
   let i=0;
   const write=()=>{ if(i<bytes.length) {process.stdout.write(bytes.subarray(i,++i));setImmediate(write);} };
   write(); break;
 }
 case 'invalid': process.stdout.write('not json\n'); break;
 case 'oversized': process.stdout.write('x'.repeat(4096)); break;
 case 'error': send({id,error:{code:-32001,message:'fixture failure',data:{retryable:false}}}); break;
 case 'exit': process.exit(7); break;
 case 'wait': break;
 default: send({id,error:{code:-32601,message:'unknown'}});
 }
});
