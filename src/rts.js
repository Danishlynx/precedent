// Real-Time Search helper. @slack/web-api 7.19 does not yet bind
// client.assistant.search.context, so fall back to apiCall — same HTTP method,
// same params, same response shape (res.results.messages).
async function searchContext(client, params) {
  if (client.assistant?.search?.context) return client.assistant.search.context(params);
  return client.apiCall('assistant.search.context', params);
}

module.exports = { searchContext };
