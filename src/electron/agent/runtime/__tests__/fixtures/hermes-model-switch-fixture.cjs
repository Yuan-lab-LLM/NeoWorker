// Local ACP peer: the reasoner route is unavailable; other routes echo the
// actual subprocess configuration. No external API or credentials are used.
const readline = require('node:readline');
const send = (value) => process.stdout.write(JSON.stringify({jsonrpc: '2.0', ...value}) + '\n');
let sessionId = 'model-switch-session';
readline.createInterface({input: process.stdin}).on('line', (line) => {
  const {id, method, params} = JSON.parse(line);
  if (method === 'initialize') {
    send({id, result: {protocolVersion: 1, agentInfo: {version: 'fixture'}, agentCapabilities: {loadSession: true}}});
  } else if (method === 'session/new') {
    send({id, result: {sessionId}});
  } else if (method === 'session/load') {
    sessionId = params.sessionId;
    send({id, result: {}});
  } else if (method === 'session/prompt') {
    const model = process.env.NEOWORKER_HERMES_MODEL;
    if (model === 'deepseek-reasoner') {
      send({id, error: {code: -32001, message: 'Fixture model is unavailable'}});
      return;
    }
    const text = JSON.stringify({model, provider: process.env.NEOWORKER_HERMES_PROVIDER, baseUrl: process.env.NEOWORKER_HERMES_BASE_URL});
    send({method: 'session/update', params: {sessionId, update: {sessionUpdate: 'agent_message_chunk', content: {type: 'text', text}}}});
    send({id, result: {stopReason: 'end_turn'}});
  }
});
