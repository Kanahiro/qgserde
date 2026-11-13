import { readFile, writeFile } from "node:fs/promises";
import {
  addLayer,
  createLayer,
  parseQgs,
  serializeQgs,
  setProjectTitle,
} from "../src/index.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Usage: node examples/edit-project.ts input.qgs output.qgs");
}

const project = parseQgs(await readFile(input, "utf8"));
setProjectTitle(project, "札幌の地図");
addLayer(
  project,
  createLayer({
    id: "qgserde_cities_001",
    name: "都市",
    type: "vector",
    provider: "memory",
    source: "Point?crs=EPSG:4326&field=name:string",
    crs: "EPSG:4326",
  }),
);
await writeFile(output, serializeQgs(project), "utf8");
