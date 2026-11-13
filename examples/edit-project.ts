import { readFile, writeFile } from "node:fs/promises";
import { parseQgs, serializeQgs } from "../src/index.ts";

const [input, output, version] = process.argv.slice(2);
if (!input || !output || !version)
  throw new Error(
    "Usage: node examples/edit-project.ts input.qgs output.qgs <QGIS version>",
  );
const project = parseQgs(await readFile(input, "utf8"));
project.title = "札幌の地図";
project.layers.push({
  type: "vector",
  id: "qgserde_cities_001",
  name: "都市",
  provider: "memory",
  source: "Point?crs=EPSG:4326&field=name:string",
  crs: { authId: "EPSG:4326" },
  fields: [],
});
await writeFile(output, serializeQgs(project, { version }), "utf8");
