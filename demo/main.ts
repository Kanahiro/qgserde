import { parseQgs, type QgsProject, serializeQgs } from "../src/index.ts";
import sample from "../test/fixtures/qgis3.qgs";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const xml = $<HTMLTextAreaElement>("xml");
const json = $<HTMLTextAreaElement>("json");
const version = $<HTMLSelectElement>("version");
const file = $<HTMLInputElement>("file");
const status = $<HTMLSpanElement>("status");

let project: QgsProject;

function report(error?: unknown) {
  status.className = error ? "error" : "";
  status.textContent = error ? String(error) : "OK";
}

function writeXml() {
  xml.value = serializeQgs(project, { version: version.value });
}

function fromXml(text: string) {
  project = parseQgs(text);
  json.value = JSON.stringify(project, null, 2);
}

function run(fn: () => void) {
  try {
    fn();
    report();
  } catch (error) {
    report(error);
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
const debounced = (fn: () => void) => () => {
  clearTimeout(timer);
  timer = setTimeout(() => run(fn), 300);
};

xml.addEventListener(
  "input",
  debounced(() => fromXml(xml.value)),
);
json.addEventListener(
  "input",
  debounced(() => {
    project = JSON.parse(json.value);
    writeXml();
  }),
);
version.addEventListener("change", () => run(writeXml));
file.addEventListener("change", async () => {
  const text = await file.files?.[0]?.text();
  if (text !== undefined)
    run(() => {
      fromXml(text);
      writeXml();
    });
});

run(() => {
  fromXml(sample);
  writeXml();
});
