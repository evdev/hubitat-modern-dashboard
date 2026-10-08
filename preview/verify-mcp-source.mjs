#!/usr/bin/env node
// Schedule assistant: MCP on the hub, plus a JSON upload that works through Hubitat Cloud.
// Run: node preview/verify-mcp-source.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const groovy = readFileSync(join(root, "app/ModernLightsDashboard.groovy.template"), "utf8");
const js = readFileSync(join(root, "src/app.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(groovy.includes('path("/mcp")'), "MCP endpoint must be mapped");
assert(groovy.includes('path("/schedules/upload")'), "schedule upload must be mapped");
assert(groovy.includes('path("/schedules/devices")'), "device list download must be mapped");
assert(groovy.includes('path("/schedules/schema")'), "schema download must be mapped");
assert(groovy.includes("mdash-devices.json"), "device list must download as a file");
assert(groovy.includes("mdash-schedule-schema.json"), "schema must download as a file");
assert(groovy.includes('title: "Allow an AI assistant to create schedules"'), "assistant preference must be labeled");
assert(groovy.includes("defaultValue: false, submitOnChange: true"), "assistant preference exists");
assert(/mcpSchedulesEnabled[\s\S]{0,240}defaultValue: false/.test(groovy), "assistant must default off");
assert(groovy.includes("schedule assistant is off"), "a disabled assistant must reject /mcp");
assert(groovy.includes("schedule assistant is local only"), "cloud requests must be rejected");
assert(!groovy.includes("Cloud assistant"), "the app page must not offer a cloud assistant link");
assert(!groovy.includes("mcpUrl(false)"), "MCP must not build a cloud URL");

const mcpPost = groovy.match(/def mcpPost\(\)[\s\S]*?\ndef mcpDispatch/);
assert(mcpPost, "mcpPost block parseable");
assert(!mcpPost[0].includes("guardDashboardAccess"), "MCP must not require the dashboard password session");
assert(mcpPost[0].includes("status: 202"), "JSON-RPC notifications must not return a result");

assert(groovy.includes('name: "list_schedule_context"'), "context tool");
assert(groovy.includes('name: "create_schedule"'), "create tool");
assert(groovy.includes('name: "update_schedule"'), "update tool");
assert(groovy.includes('name: "delete_schedule"'), "delete tool");
assert(groovy.includes("schedulesFinishSave"), "save, upload, and MCP must share the arm-and-rollback path");
assert(/def schedulesSave\(\)[\s\S]*?schedulesFinishSave\(/.test(groovy), "single save uses the shared finish");
assert(/def schedulesUpload\(\)[\s\S]*?schedulesCommitBundle\(/.test(groovy), "upload commits a bundle");
assert(/def mcpCreateSchedule[\s\S]*?schedulesFinishSave\(/.test(groovy), "create tool uses the shared finish");

const resolve = groovy.match(/def scheduleResolveDeviceToken[\s\S]*?\ndef schedulesApplyDeviceNames/);
assert(resolve, "device resolver parseable");
assert(resolve[0].includes("more than one device matches"), "ambiguous names must be rejected");
assert(resolve[0].includes("no device named"), "unknown names must be rejected");
assert(resolve[0].includes("equalsIgnoreCase"), "names must match case-insensitively before a substring");

assert(!js.includes('schedMutationApi("upload"'), "dashboard must not upload schedule files");
assert(!js.includes("Copy for AI"), "dashboard must not offer the schema");
assert(!js.includes("scheduleUploadSchemaText"), "dashboard must not carry the schema text");

const schema = readFileSync(join(root, "lib/schedule-upload.schema.json"), "utf8").trim();
const parsed = JSON.parse(schema);
assert(parsed.required?.includes("schedules"), "schema root is a schedules array");
assert(parsed.$defs?.trigger?.oneOf?.length === 4, "schema must describe clock, sun, once, and mode triggers");
assert(parsed.$defs?.action?.oneOf?.length === 7, "schema must describe lights, outlets, locks, blinds, fans, thermostats, and hub mode");
assert(groovy.includes(schema), "hub upload page must show the same schema file");
assert(
  /def schedUploadSchema\(\) \{\s*return '''/.test(groovy),
  "schema must be a triple-quoted Groovy string so the JSON is not parsed as code",
);
assert(!js.includes(schema.slice(0, 80)), "dashboard must not embed the schema file");

const catalog = groovy.match(/def scheduleDeviceCatalog\(\)[\s\S]*?\ndef schedulesDevicesGet/);
assert(catalog, "device catalog parseable");
assert(catalog[0].includes('add(d, "lights"'), "catalog includes lights");
assert(catalog[0].includes('add(d, "outlets"'), "catalog includes outlets");
assert(catalog[0].includes('add(d, "locks"'), "catalog includes locks");
assert(catalog[0].includes('add(d, "blinds"'), "catalog includes blinds");
assert(catalog[0].includes("shadeSupportsPosition"), "a shade lists position only when the scheduler can set it");
assert(catalog[0].includes('add(d, "fans"'), "catalog includes fans");
assert(catalog[0].includes("scheduleFanSpeedChoices"), "a fan lists the speeds a schedule can set");
assert(catalog[0].includes('add(d, "thermostats"'), "catalog includes thermostats");
assert(catalog[0].includes("useId"), "a shared device name must tell the assistant to use the id");
assert(catalog[0].includes('["auto", "heat", "cool", "off"]'), "a thermostat with no reported modes uses the scheduler defaults");
assert(!catalog[0].includes("fanAuto"), "fan modes must come from the device, not assumed commands");
assert(!catalog[0].includes("musicPlayers"), "catalog must not include music");
assert(!catalog[0].includes("cameras"), "catalog must not include cameras");
assert(!catalog[0].includes("motionSensors"), "catalog must not include sensors");
assert(groovy.includes('section("Schema for your assistant", hideable: true, hidden: false)'), "schema section starts open");
assert(groovy.includes('section("Devices for your assistant", hideable: true, hidden: false)'), "device list section starts open");
assert(groovy.includes("Download schedule schema"), "upload page offers a schema download");
assert(groovy.includes("scheduleSchemaUrl(false)"), "schema download must include the cloud link");
assert(groovy.includes("mldSchemaToolbar()"), "schema section uses the download and copy toolbar");
assert(groovy.includes('id=\'mldSchedSchema\''), "schema text is the copy source");
assert(groovy.includes(">Download<"), "schema has a download button");
assert(groovy.includes(">Copy<"), "schema has a copy button");
assert(groovy.includes("navigator.clipboard"), "copy button writes the schema to the clipboard");
assert(groovy.includes('download=\'mdash-schedule-schema.json\''), "schema download keeps the schema filename");
assert(groovy.includes("max-height:48px"), "schema preview stays short");
assert(groovy.includes('title: "Upload"'), "upload page has an Upload button");
assert(groovy.includes("rows: 3"), "schedule paste box stays short");
assert(groovy.includes("mldSchedUploadFilePicker"), "upload page can read a JSON file into the paste box");
assert(groovy.includes("mldSchedScrollTop"), "upload page scrolls to the top when opened");

console.log("mcp source ok");
