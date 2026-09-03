#!/usr/bin/env node

import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const archive = process.argv[2] || ".novaready/package-output/app.asar.flight-route-general-v14";
const runtimes = ["electron", "daemon", "cli"];
const marker = /NW_FLIGHT_ROUTE_GENERAL_V(?:[3-9]|10|11|12|13|14)/;

function extract(runtime, file) {
  return asar.extractFile(archive, `dist/${runtime}/electron/agent/${file}`).toString("utf8");
}

function loadHelpers(source) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (id) => id === "path" ? require("node:path") : id === "crypto" ? require("node:crypto") : { canonicalizeToolName: (name) => name },
    console,
    URL,
    Date,
    setTimeout,
    clearTimeout,
  }, { filename: "executor-helpers.js" });
  return module.exports;
}

for (const runtime of runtimes) {
  const helpersSource = extract(runtime, "executor-helpers.js");
  assert.match(helpersSource, marker);
  const helperApi = loadHelpers(helpersSource);
  const queries = [];
  await helperApi.runDuckDuckGoResearch({ query: "查一下9月5日广州飞沈阳的航班信息", maxResults: 4 }, async ({ query }) => {
    queries.push(query);
    return { results: [{ title: query, url: "https://example.test/flight", snippet: "flight result" }] };
  });
  assert.ok(queries.some((query) => /2026-09-05/.test(query) && /CAN/.test(query) && /SHE/.test(query)), `${runtime}: Guangzhou-Shenyang date/IATA expansion missing`);
  const otherQueries = [];
  await helperApi.runDuckDuckGoResearch({ query: "查一下9月10日成都飞深圳的航班信息", maxResults: 4 }, async ({ query }) => {
    otherQueries.push(query);
    return { results: [{ title: query, url: "https://example.test/flight", snippet: "flight result" }] };
  });
  assert.ok(otherQueries.some((query) => /2026-09-10/.test(query) && /CTU/.test(query) && /SZX/.test(query)), `${runtime}: Chengdu-Shenzhen date/IATA expansion missing`);
  assert.ok(otherQueries.some((query) => /site:zbordirect\.com/.test(query)), `${runtime}: targeted indexed schedule query missing`);
  assert.ok(otherQueries.every((query) => !/PEK\s+SHA/.test(query)), `${runtime}: route expansion still falls back to Beijing-Shanghai`);

  const searchToolsSource = extract(runtime, "tools/search-tools.js");
  assert.match(searchToolsSource, /extractFlightRouteCodes/);
  assert.match(searchToolsSource, /flightconnections\.com\/flights-from-/);
  assert.match(searchToolsSource, /route\.fromCode \+ "-" \+ route\.toCode/);
  assert.match(searchToolsSource, /route\.fromSlug \+ "-cn-" \+ route\.toSlug/);
  assert.match(searchToolsSource, /zbordirect\.com\/en\/tools\/schedule/);
  assert.match(searchToolsSource, /trip\.com\/flights\/airport-/);
  assert.match(searchToolsSource, /const codePair/);
  assert.match(searchToolsSource, /const ordered/);
  assert.match(searchToolsSource, /tripCityCodes/);
  assert.match(searchToolsSource, /SIA/);
  assert.match(searchToolsSource, /csair\.com\/h5\/cn\/tourism_strategy/);

  const providerSource = extract(runtime, "search/duckduckgo-provider.js");
  assert.match(providerSource, /NW_FLIGHT_SEARCH_PROVIDER_V1/);
  assert.match(providerSource, /chinaFirst && !flightQuery/);

  const executorSource = extract(runtime, "executor.js");
  assert.match(executorSource, /NW_OUTPUT_LENGTH_V1/);
  assert.match(executorSource, /initialMaxTokens: finalizationAttempt === 0 \? 4000 : 4000/);
  assert.match(executorSource, /continuationMaxTokens: finalizationAttempt === 0 \? 4000 : 4000/);
  assert.doesNotMatch(executorSource, /initialMaxTokens: finalizationAttempt === 0 \? 1200 : 1600/);
  assert.match(executorSource, /detected city pair and IATA codes/);
  assert.match(executorSource, /city-pair\/IATA\/date candidates/);
  assert.match(executorSource, /weekdayConfirmed/);
  assert.match(executorSource, /englishDateAnchors/);
  assert.match(executorSource, /targeted web_search/);
  assert.match(executorSource, /\["web_search", "web_fetch"/);
  assert.match(executorSource, /targetDay \+ " " \+ targetMonthName/);
  assert.match(executorSource, /routeNames/);
  assert.match(executorSource, /dateAirlineRow/);
  assert.match(executorSource, /Trip\.com date candidate first/);
  const methodStart = executorSource.indexOf("isFlightInfoTask() {");
  const methodEnd = executorSource.indexOf("taskRequiresTodayContext() {", methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart, `${runtime}: flight evidence method boundaries`);
  const vmContext = vm.createContext({ Date, String, Array, RegExp, Number });
  new vm.Script("class FlightHarness {" + executorSource.slice(methodStart, methodEnd) + "}; this.FlightHarness = FlightHarness;").runInContext(vmContext);
  const FlightHarness = vmContext.FlightHarness;
  const harness = new FlightHarness();
  harness.task = { title: "", prompt: "查一下2026年9月6日成都飞深圳的航班信息" };
  harness.getContractPrompt = () => harness.task.prompt;
  harness.webEvidenceMemory = [{ tool: "web_fetch", url: "https://www.trip.com/flights/airport-ctu-city-szx/", evidenceText: "2026年9月6日 成都（CTU）→ 深圳（SZX） 成都航空 07:55 10:30" }];
  assert.equal(harness.hasDatedFetchedFlightEvidence(), true, `${runtime}: dated airline/time row should unlock reference output`);
}

console.log(JSON.stringify({ archive, runtimes: runtimes.length, passed: true, marker: "NW_FLIGHT_ROUTE_GENERAL_V13" }, null, 2));
